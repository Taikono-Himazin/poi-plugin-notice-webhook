#!/usr/bin/env bash
# =============================================================================
# poi-notice-webhook デプロイスクリプト
# 使い方:
#   ./deploy.sh --profile <AWS_PROFILE> --region <AWS_REGION> [options]
# =============================================================================
set -euo pipefail

# -----------------------------------------------------------------------------
# カラー出力
# -----------------------------------------------------------------------------
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; }
die()     { error "$*"; exit 1; }

# -----------------------------------------------------------------------------
# 引数パース
# -----------------------------------------------------------------------------
AWS_PROFILE=""
AWS_REGION=""
PAYJP_SECRET_KEY="${PAYJP_SECRET_KEY:-}"
PAYJP_PUBLIC_KEY="${PAYJP_PUBLIC_KEY:-}"
PAYJP_WEBHOOK_SECRET="${PAYJP_WEBHOOK_SECRET:-}"
PAYJP_PRICE_1M="${PAYJP_PRICE_1M:-}"
PAYJP_PRICE_6M="${PAYJP_PRICE_6M:-}"
PAYJP_PRICE_12M="${PAYJP_PRICE_12M:-}"
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"
SKIP_BOOTSTRAP=false
DRY_RUN=false

usage() {
  cat <<EOF
${BOLD}使い方:${RESET}
  $(basename "$0") --profile PROFILE --region REGION [options]

${BOLD}必須オプション:${RESET}
  --profile  PROFILE   AWS CLI プロファイル名
  --region   REGION    デプロイ先リージョン (例: ap-northeast-1)

${BOLD}任意オプション:${RESET}
  --skip-bootstrap     CDK bootstrap をスキップ (既に実行済みの場合)
  --dry-run            デプロイせず確認のみ (cdk synth)
  --help               このヘルプを表示

${BOLD}環境変数 (引数で渡す代わりに設定可):${RESET}
  PAYJP_SECRET_KEY      PAY.JP シークレットキー
  PAYJP_PUBLIC_KEY      PAY.JP 公開キー
  PAYJP_WEBHOOK_SECRET  PAY.JP Webhook シークレット (v2: whook_...)
  PAYJP_PRICE_1M        PAY.JP v2 価格 ID — 1ヶ月プラン (price_...)
  PAYJP_PRICE_6M        PAY.JP v2 価格 ID — 6ヶ月プラン (price_...)
  PAYJP_PRICE_12M       PAY.JP v2 価格 ID — 12ヶ月プラン (price_...)
  GOOGLE_CLIENT_ID      Google OAuth 2.0 クライアント ID（省略でスキップ）
  GOOGLE_CLIENT_SECRET  Google OAuth 2.0 クライアントシークレット

${BOLD}例:${RESET}
  ./deploy.sh --profile myprofile --region ap-northeast-1
  ./deploy.sh --profile prod --region ap-northeast-1 --skip-bootstrap
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)        AWS_PROFILE="$2";  shift 2 ;;
    --region)         AWS_REGION="$2";   shift 2 ;;
    --skip-bootstrap) SKIP_BOOTSTRAP=true; shift  ;;
    --dry-run)        DRY_RUN=true;      shift    ;;
    --help|-h)        usage ;;
    *) die "不明なオプション: $1  (--help でヘルプを表示)" ;;
  esac
done

# -----------------------------------------------------------------------------
# 必須引数チェック
# -----------------------------------------------------------------------------
[[ -z "$AWS_PROFILE" ]] && die "--profile は必須です。例: --profile myprofile"
[[ -z "$AWS_REGION"  ]] && die "--region は必須です。例: --region ap-northeast-1"

# -----------------------------------------------------------------------------
# 前提ツール確認
# -----------------------------------------------------------------------------
echo -e "\n${BOLD}=== 前提ツール確認 ===${RESET}"
check_cmd() {
  if command -v "$1" &>/dev/null; then
    success "$1 : $(command -v "$1")"
  else
    die "$1 が見つかりません。インストールしてください。"
  fi
}
check_cmd node
check_cmd npm
check_cmd aws

NODE_VER=$(node -e "process.stdout.write(process.version)")
info "Node.js バージョン: $NODE_VER"

# -----------------------------------------------------------------------------
# AWS 認証確認
# -----------------------------------------------------------------------------
echo -e "\n${BOLD}=== AWS 認証確認 ===${RESET}"
info "プロファイル: ${AWS_PROFILE}  /  リージョン: ${AWS_REGION}"

CALLER_IDENTITY=$(aws sts get-caller-identity \
  --profile "$AWS_PROFILE" \
  --region  "$AWS_REGION" \
  --output json 2>&1) \
  || die "AWS 認証に失敗しました。プロファイル「${AWS_PROFILE}」を確認してください。\n${CALLER_IDENTITY}"

AWS_ACCOUNT=$(echo "$CALLER_IDENTITY" | grep -o '"Account": *"[^"]*"' | grep -o '[0-9]*')
AWS_USER=$(echo "$CALLER_IDENTITY" | grep -o '"Arn": *"[^"]*"' | cut -d'"' -f4)
success "認証成功"
info "  アカウント ID : $AWS_ACCOUNT"
info "  IAM 識別子    : $AWS_USER"

# -----------------------------------------------------------------------------
# スクリプトのディレクトリから aws/ に移動
# -----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AWS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$AWS_DIR"
info "作業ディレクトリ: $AWS_DIR"

# -----------------------------------------------------------------------------
# PAY.JP キー設定 (保存済み → 環境変数 → 対話入力 の優先順位)
# 保存先: aws/.poi-webhook-deploy.env (chmod 600, オーナーのみ読み取り可)
# -----------------------------------------------------------------------------
echo -e "\n${BOLD}=== PAY.JP キー設定 ===${RESET}"

CONFIG_FILE="$AWS_DIR/.poi-webhook-deploy.env"

# 保存済み設定を読み込む (環境変数が未設定の項目のみ上書き)
if [[ -f "$CONFIG_FILE" ]]; then
  info "保存済み設定を読み込んでいます: $CONFIG_FILE"
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [[ -z "$key" ]] && continue
    value="${value#\'}" ; value="${value%\'}"          # シングルクォート除去
    [[ -z "${!key:-}" ]] && printf -v "$key" '%s' "$value"  # 未設定の場合のみセット
  done < "$CONFIG_FILE"
fi

# 入力ヘルパー: 保存済みの値があれば Enter でスキップ、入力すれば上書き
ask_secret() {
  local var_name="$1" prompt_text="$2" required="${3:-true}"
  local val; eval val="\$$var_name"
  if [[ -n "$val" ]]; then
    local hint="${val:0:4}****"
    read -rsp "${prompt_text} [${hint}] (Enter でそのまま): " new_val; echo
    [[ -n "$new_val" ]] && val="$new_val"
  else
    read -rsp "${prompt_text}: " val; echo
    if [[ -z "$val" ]]; then
      [[ "$required" == true ]] && die "${var_name} が空です。"
    fi
  fi
  eval "$var_name='$val'"
}

ask_plain() {
  local var_name="$1" prompt_text="$2" required="${3:-true}"
  local val; eval val="\$$var_name"
  if [[ -n "$val" ]]; then
    read -rp "${prompt_text} [${val}] (Enter でそのまま): " new_val
    [[ -n "$new_val" ]] && val="$new_val"
  else
    read -rp "${prompt_text}: " val
    [[ -z "$val" ]] && [[ "$required" == true ]] && die "${var_name} が空です。"
  fi
  eval "$var_name='$val'"
}

ask_secret PAYJP_SECRET_KEY     "PAY.JP シークレットキー (sk_live_... / sk_test_...)"
ask_plain  PAYJP_PUBLIC_KEY     "PAY.JP 公開キー (pk_live_... / pk_test_...)"
ask_plain  PAYJP_PRICE_1M       "PAY.JP v2 価格 ID — 1ヶ月プラン (price_...)"
ask_plain  PAYJP_PRICE_6M       "PAY.JP v2 価格 ID — 6ヶ月プラン (price_...)"
ask_plain  PAYJP_PRICE_12M      "PAY.JP v2 価格 ID — 12ヶ月プラン (price_...)"
ask_secret PAYJP_WEBHOOK_SECRET "PAY.JP Webhook シークレット (whook_...) (空 Enter で後から設定)" false
[[ -z "$PAYJP_WEBHOOK_SECRET" ]] && warn "PAYJP_WEBHOOK_SECRET が空です。デプロイ後に再デプロイして設定してください。"

echo -e "\n${BOLD}=== Google ログイン設定（任意）===${RESET}"
info "Google でのサインインを有効にするには Google OAuth クライアントを設定してください。"
info "不要な場合は Enter でスキップします。"
ask_plain  GOOGLE_CLIENT_ID     "Google OAuth クライアント ID (空 Enter でスキップ)" false
if [[ -n "$GOOGLE_CLIENT_ID" ]]; then
  ask_secret GOOGLE_CLIENT_SECRET "Google OAuth クライアントシークレット"
else
  warn "Google ログインをスキップしました。後から再デプロイして追加できます。"
fi

# キーのプレフィックス簡易チェック
[[ "$PAYJP_SECRET_KEY"  != sk_*  ]] && warn "PAYJP_SECRET_KEY が sk_ で始まっていません。"
[[ "$PAYJP_PUBLIC_KEY"  != pk_*  ]] && warn "PAYJP_PUBLIC_KEY が pk_ で始まっていません。"
[[ -n "$PAYJP_PRICE_1M"  && "$PAYJP_PRICE_1M"  != price_* ]] && warn "PAYJP_PRICE_1M が price_ で始まっていません。"
[[ -n "$PAYJP_PRICE_6M"  && "$PAYJP_PRICE_6M"  != price_* ]] && warn "PAYJP_PRICE_6M が price_ で始まっていません。"
[[ -n "$PAYJP_PRICE_12M" && "$PAYJP_PRICE_12M" != price_* ]] && warn "PAYJP_PRICE_12M が price_ で始まっていません。"

# 設定をファイルに保存 (chmod 600 = オーナーのみ読み取り可)
cat > "$CONFIG_FILE" <<ENVEOF
PAYJP_SECRET_KEY='${PAYJP_SECRET_KEY}'
PAYJP_PUBLIC_KEY='${PAYJP_PUBLIC_KEY}'
PAYJP_WEBHOOK_SECRET='${PAYJP_WEBHOOK_SECRET}'
PAYJP_PRICE_1M='${PAYJP_PRICE_1M}'
PAYJP_PRICE_6M='${PAYJP_PRICE_6M}'
PAYJP_PRICE_12M='${PAYJP_PRICE_12M}'
GOOGLE_CLIENT_ID='${GOOGLE_CLIENT_ID}'
GOOGLE_CLIENT_SECRET='${GOOGLE_CLIENT_SECRET}'
ENVEOF
chmod 600 "$CONFIG_FILE"
success "設定を保存しました: $CONFIG_FILE"

# -----------------------------------------------------------------------------
# npm install
# -----------------------------------------------------------------------------
echo -e "\n${BOLD}=== npm install ===${RESET}"
npm install --prefer-offline
success "npm install 完了"

# -----------------------------------------------------------------------------
# TypeScript ビルド確認
# -----------------------------------------------------------------------------
echo -e "\n${BOLD}=== TypeScript ビルド ===${RESET}"
npx tsc --noEmit
success "TypeScript チェック完了"

# jsii の Node.js バージョン未テスト警告を抑制 (動作には影響しない)
export JSII_SILENCE_WARNING_UNTESTED_NODE_VERSION=1
# CDK がリージョン・プロファイルを確実に認識するよう環境変数にも設定
export AWS_PROFILE="$AWS_PROFILE"
export AWS_DEFAULT_REGION="$AWS_REGION"

# -----------------------------------------------------------------------------
# CDK Bootstrap
# -----------------------------------------------------------------------------
if [[ "$SKIP_BOOTSTRAP" == false ]]; then
  echo -e "\n${BOLD}=== CDK Bootstrap ===${RESET}"
  info "aws://${AWS_ACCOUNT}/${AWS_REGION} をブートストラップします..."
  AWS_PROFILE="$AWS_PROFILE" npx cdk bootstrap \
    "aws://${AWS_ACCOUNT}/${AWS_REGION}" \
    --profile "$AWS_PROFILE" \
    --region  "$AWS_REGION"
  success "Bootstrap 完了"
else
  warn "Bootstrap をスキップしました (--skip-bootstrap)"
fi

# -----------------------------------------------------------------------------
# CDK Synth / Deploy
# -----------------------------------------------------------------------------
CDK_PARAMS=(
  "--parameters" "PayjpSecretKey=${PAYJP_SECRET_KEY}"
  "--parameters" "PayjpPublicKey=${PAYJP_PUBLIC_KEY}"
  "--parameters" "PayjpWebhookSecret=${PAYJP_WEBHOOK_SECRET}"
  "--parameters" "PayjpPrice1m=${PAYJP_PRICE_1M}"
  "--parameters" "PayjpPrice6m=${PAYJP_PRICE_6M}"
  "--parameters" "PayjpPrice12m=${PAYJP_PRICE_12M}"
  "--parameters" "GoogleClientId=${GOOGLE_CLIENT_ID}"
  "--parameters" "GoogleClientSecret=${GOOGLE_CLIENT_SECRET}"
)

if [[ "$DRY_RUN" == true ]]; then
  echo -e "\n${BOLD}=== CDK Synth (dry-run) ===${RESET}"
  AWS_PROFILE="$AWS_PROFILE" npx cdk synth PoiWebhookStack \
    --profile "$AWS_PROFILE" \
    --region  "$AWS_REGION"  \
    "${CDK_PARAMS[@]}"
  success "Synth 完了 (デプロイはスキップ)"
  exit 0
fi

echo -e "\n${BOLD}=== CDK Deploy ===${RESET}"
info "スタック: PoiWebhookStack"
info "リージョン: $AWS_REGION  /  プロファイル: $AWS_PROFILE"

OUTPUTS_FILE="$AWS_DIR/aws-outputs.json"

AWS_PROFILE="$AWS_PROFILE" npx cdk deploy PoiWebhookStack \
  --profile         "$AWS_PROFILE" \
  --region          "$AWS_REGION"  \
  --require-approval never          \
  --outputs-file    "$OUTPUTS_FILE" \
  "${CDK_PARAMS[@]}"

# src/ にコピー（プラグイン起動時に自動読み込み）
SRC_DIR="$AWS_DIR/../src"
if [[ -f "$OUTPUTS_FILE" && -d "$SRC_DIR" ]]; then
  cp "$OUTPUTS_FILE" "$SRC_DIR/aws-outputs.json"
  success "CDK Outputs を src/aws-outputs.json にコピーしました"
fi

# -----------------------------------------------------------------------------
# デプロイ後: Outputs 表示
# -----------------------------------------------------------------------------
echo -e "\n${BOLD}=== デプロイ結果 ===${RESET}"
OUTPUTS=$(aws cloudformation describe-stacks \
  --stack-name PoiWebhookStack \
  --profile "$AWS_PROFILE"  \
  --region  "$AWS_REGION"   \
  --query  "Stacks[0].Outputs" \
  --output json)

echo "$OUTPUTS" | grep -o '"OutputKey": *"[^"]*"\|"OutputValue": *"[^"]*"' \
  | paste - - \
  | sed 's/"OutputKey": *"\([^"]*\)"\t"OutputValue": *"\([^"]*\)"/  \1 = \2/'

API_URL=$(echo "$OUTPUTS" | grep -o '"OutputValue": *"https://[^"]*"' | head -1 | grep -o 'https://[^"]*')

echo ""
success "デプロイ完了!"
success "CDK Outputs を保存しました: $OUTPUTS_FILE"
info  "  → poi プラグインを再起動すると AWS モードの設定が自動入力されます"
echo ""
echo -e "${BOLD}次のステップ:${RESET}"
echo -e "  1. PAY.JP v2 ダッシュボードで Webhook を登録してください:"
echo -e "     URL   : ${CYAN}${API_URL}payjp/webhook${RESET}"
echo -e "     イベント: checkout.session.completed"
echo -e "     ※ Webhook トークン (whook_...) を PAYJP_WEBHOOK_SECRET に設定して再デプロイしてください"
echo -e "  2. poi を再起動してプラグインを開き、AWS モードを選択してログインしてください"
echo ""
