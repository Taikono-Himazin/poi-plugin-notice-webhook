#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# poi-plugin-notice-webhook AWS デプロイスクリプト (sh 版)
#
# CDK を使って AWS にデプロイします。--profile と --region は必須です。
#
# Usage:
#   ./deploy.sh --profile myprofile --region ap-northeast-1
#   ./deploy.sh --profile prod --region ap-northeast-1 --skip-bootstrap
#   ./deploy.sh --profile prod --region ap-northeast-1 --dry-run
# ---------------------------------------------------------------------------
set -euo pipefail

# -----------------------------------------------------------------------------
# ユーティリティ
# -----------------------------------------------------------------------------
info()    { printf '\033[36m[INFO]  %s\033[0m\n' "$*"; }
success() { printf '\033[32m[OK]    %s\033[0m\n' "$*"; }
warn()    { printf '\033[33m[WARN]  %s\033[0m\n' "$*"; }
fail()    { printf '\033[31m[ERROR] %s\033[0m\n' "$*"; exit 1; }

# シークレット入力 (エコーバックなし)
read_secret() {
  local prompt="$1" val
  printf '%s' "$prompt" >&2
  read -rs val
  echo >&2
  printf '%s' "$val"
}

# 値取得: 環境変数 > 保存済み > 対話入力
# get_value ENV_VAR "プロンプト" is_secret(0/1) required(0/1)
get_value() {
  local env_var="$1" prompt="$2" is_secret="${3:-1}" required="${4:-1}"
  local val="" new="" hint=""

  # 環境変数を優先
  val="${!env_var:-}"

  # 保存済み設定を参照
  if [[ -z "$val" && -f "$CONFIG_FILE" ]]; then
    val="$(jq -r --arg k "$env_var" '.[$k] // ""' "$CONFIG_FILE" 2>/dev/null || true)"
  fi

  if [[ -n "$val" ]]; then
    # 保存済みあり: Enter でスキップ、入力すれば上書き
    if [[ "$is_secret" == "1" ]]; then
      hint="${val:0:4}****"
      new="$(read_secret "$prompt [$hint] (Enter でそのまま): ")"
    else
      read -rp "$prompt [$val] (Enter でそのまま): " new
    fi
    [[ -n "$new" ]] && val="$new"
  else
    # 未保存: 入力
    if [[ "$is_secret" == "1" ]]; then
      val="$(read_secret "$prompt: ")"
    else
      read -rp "$prompt: " val
    fi
    if [[ -z "$val" && "$required" == "1" ]]; then
      fail "$env_var が空です。"
    fi
  fi

  printf '%s' "$val"
}

# -----------------------------------------------------------------------------
# 引数解析
# -----------------------------------------------------------------------------
PROFILE=""
REGION=""
SKIP_BOOTSTRAP=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)       PROFILE="$2";       shift 2 ;;
    --region)        REGION="$2";        shift 2 ;;
    --skip-bootstrap) SKIP_BOOTSTRAP=true; shift ;;
    --dry-run)       DRY_RUN=true;       shift ;;
    *) fail "不明なオプション: $1" ;;
  esac
done

[[ -z "$PROFILE" ]] && fail "--profile は必須です。"
[[ -z "$REGION" ]]  && fail "--region は必須です。"

# -----------------------------------------------------------------------------
# 前提ツール確認
# -----------------------------------------------------------------------------
echo ""
echo "=== 前提ツール確認 ==="

for cmd in node npm aws; do
  if command -v "$cmd" &>/dev/null; then
    success "$cmd : $(command -v "$cmd")"
  else
    fail "$cmd が見つかりません。インストールしてください。"
  fi
done

NODE_VER="$(node -e 'process.stdout.write(process.version)')"
info "Node.js バージョン: $NODE_VER"

# -----------------------------------------------------------------------------
# AWS 認証確認
# -----------------------------------------------------------------------------
echo ""
echo "=== AWS 認証確認 ==="
info "プロファイル: $PROFILE  /  リージョン: $REGION"

IDENTITY="$(aws sts get-caller-identity \
  --profile "$PROFILE" \
  --region  "$REGION"  \
  --output  json 2>&1)" || fail "AWS 認証に失敗しました。プロファイル「$PROFILE」を確認してください。"

AWS_ACCOUNT="$(echo "$IDENTITY" | jq -r '.Account')"
AWS_USER="$(echo "$IDENTITY" | jq -r '.Arn')"
success "認証成功"
info "  アカウント ID : $AWS_ACCOUNT"
info "  IAM 識別子    : $AWS_USER"

# -----------------------------------------------------------------------------
# aws/ ディレクトリに移動
# -----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AWS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/aws"
cd "$AWS_DIR"
info "作業ディレクトリ: $AWS_DIR"

# -----------------------------------------------------------------------------
# 保存済み設定読み込み
# -----------------------------------------------------------------------------
CONFIG_FILE="$AWS_DIR/.poi-webhook-deploy.json"
if [[ -f "$CONFIG_FILE" ]]; then
  info "保存済み設定を読み込みました: $CONFIG_FILE"
fi

# -----------------------------------------------------------------------------
# Google ログイン設定（任意）
# -----------------------------------------------------------------------------
echo ""
echo "=== Google ログイン設定（任意）==="
info "Google でのサインインを有効にするには Google OAuth クライアントを設定してください。"
info "不要な場合は Enter でスキップします。"

GOOGLE_CLIENT_ID="$(get_value GOOGLE_CLIENT_ID "Google OAuth クライアント ID (空 Enter でスキップ)" 0 0)"
if [[ -n "$GOOGLE_CLIENT_ID" ]]; then
  GOOGLE_CLIENT_SECRET="$(get_value GOOGLE_CLIENT_SECRET "Google OAuth クライアントシークレット" 1 1)"
else
  GOOGLE_CLIENT_SECRET=""
  warn "Google ログインをスキップしました。後から再デプロイして追加できます。"
fi

# -----------------------------------------------------------------------------
# Apple Sign In 設定（任意）
# -----------------------------------------------------------------------------
echo ""
echo "=== Apple Sign In 設定（任意）==="
info "Sign in with Apple を有効にするには Apple Developer の資格情報を設定してください。"
info "不要な場合は Enter でスキップします。"

APPLE_SERVICE_ID="$(get_value APPLE_SERVICE_ID "Apple Services ID (空 Enter でスキップ)" 0 0)"
if [[ -n "$APPLE_SERVICE_ID" ]]; then
  APPLE_TEAM_ID="$(get_value APPLE_TEAM_ID "Apple Team ID" 0 1)"
  APPLE_KEY_ID="$(get_value APPLE_KEY_ID "Apple Key ID" 0 1)"
  APPLE_PRIVATE_KEY_PATH="$(get_value APPLE_PRIVATE_KEY_PATH "Apple 秘密鍵 (.p8 ファイルパス)" 0 1)"
  [[ ! -f "$APPLE_PRIVATE_KEY_PATH" ]] && fail ".p8 ファイルが見つかりません: $APPLE_PRIVATE_KEY_PATH"
  info ".p8 ファイルから秘密鍵を読み込みました"
else
  APPLE_TEAM_ID=""
  APPLE_KEY_ID=""
  APPLE_PRIVATE_KEY_PATH=""
  warn "Apple Sign In をスキップしました。後から再デプロイして追加できます。"
fi

# -----------------------------------------------------------------------------
# フェデレーションサインイン制限設定
# -----------------------------------------------------------------------------
GOOGLE_ONLY="false"
if [[ -n "$GOOGLE_CLIENT_ID" || -n "$APPLE_SERVICE_ID" ]]; then
  echo ""
  echo "=== サインイン制限設定 ==="
  info "フェデレーションサインイン (Google / Apple) 以外のログインを禁止できます。"
  PREV_FED_ONLY="$(jq -r '.GOOGLE_ONLY // "false"' "$CONFIG_FILE" 2>/dev/null || echo "false")"
  read -rp "フェデレーションサインイン以外を許可しない? (true/false) [$PREV_FED_ONLY] (Enter でそのまま): " FED_INPUT
  GOOGLE_ONLY="${FED_INPUT:-$PREV_FED_ONLY}"
fi

# 設定を JSON で保存 (パーミッション 600 で保護)
jq -n \
  --arg gci  "$GOOGLE_CLIENT_ID" \
  --arg gcs  "$GOOGLE_CLIENT_SECRET" \
  --arg go   "$GOOGLE_ONLY" \
  --arg asi  "$APPLE_SERVICE_ID" \
  --arg ati  "$APPLE_TEAM_ID" \
  --arg aki  "$APPLE_KEY_ID" \
  --arg apkp "$APPLE_PRIVATE_KEY_PATH" \
  '{
    GOOGLE_CLIENT_ID:     $gci,
    GOOGLE_CLIENT_SECRET: $gcs,
    GOOGLE_ONLY:          $go,
    APPLE_SERVICE_ID:     $asi,
    APPLE_TEAM_ID:        $ati,
    APPLE_KEY_ID:         $aki,
    APPLE_PRIVATE_KEY_PATH: $apkp
  }' > "$CONFIG_FILE"
chmod 600 "$CONFIG_FILE"
success "設定を保存しました: $CONFIG_FILE (chmod 600)"

# -----------------------------------------------------------------------------
# npm install
# -----------------------------------------------------------------------------
echo ""
echo "=== npm install ==="
npm install --prefer-offline || fail "npm install が失敗しました。"
success "npm install 完了"

# -----------------------------------------------------------------------------
# TypeScript ビルド確認
# -----------------------------------------------------------------------------
echo ""
echo "=== TypeScript ビルド ==="
npx tsc --noEmit || fail "TypeScript のビルドエラーがあります。修正してください。"
success "TypeScript チェック完了"

# jsii の Node.js バージョン未テスト警告を抑制
export JSII_SILENCE_WARNING_UNTESTED_NODE_VERSION=1
export AWS_PROFILE="$PROFILE"
export AWS_DEFAULT_REGION="$REGION"

if [[ "$SKIP_BOOTSTRAP" == "false" ]]; then
  echo ""
  echo "=== CDK Bootstrap ==="
  info "aws://${AWS_ACCOUNT}/${REGION} をブートストラップします..."
  npx cdk bootstrap "aws://${AWS_ACCOUNT}/${REGION}" \
    --profile "$PROFILE" \
    --region  "$REGION" || fail "CDK Bootstrap が失敗しました。"
  success "Bootstrap 完了"
else
  warn "Bootstrap をスキップしました (--skip-bootstrap)"
fi

# -----------------------------------------------------------------------------
# CDK パラメータ
# -----------------------------------------------------------------------------
CDK_PARAMS=(
  "--parameters" "GoogleClientId=$GOOGLE_CLIENT_ID"
  "--parameters" "GoogleClientSecret=$GOOGLE_CLIENT_SECRET"
  "--parameters" "GoogleOnly=$GOOGLE_ONLY"
  "--parameters" "AppleServiceId=$APPLE_SERVICE_ID"
  "--parameters" "AppleTeamId=$APPLE_TEAM_ID"
  "--parameters" "AppleKeyId=$APPLE_KEY_ID"
  "--parameters" "ApplePrivateKeyPath=$APPLE_PRIVATE_KEY_PATH"
)
if [[ -n "$APPLE_PRIVATE_KEY_PATH" ]]; then
  RESOLVED_PATH="$(realpath "$APPLE_PRIVATE_KEY_PATH")"
  CDK_PARAMS+=("-c" "applePrivateKeyPath=$RESOLVED_PATH")
fi

# -----------------------------------------------------------------------------
# CDK Synth / Deploy
# -----------------------------------------------------------------------------
if [[ "$DRY_RUN" == "true" ]]; then
  echo ""
  echo "=== CDK Synth (dry-run) ==="
  npx cdk synth PoiWebhookStack --profile "$PROFILE" --region "$REGION" "${CDK_PARAMS[@]}"
  success "Synth 完了 (デプロイはスキップ)"
  exit 0
fi

echo ""
echo "=== CDK Deploy ==="
info "スタック: PoiWebhookStack"
info "リージョン: $REGION  /  プロファイル: $PROFILE"

OUTPUTS_FILE="$AWS_DIR/aws-outputs.json"

npx cdk deploy PoiWebhookStack \
  --profile          "$PROFILE" \
  --region           "$REGION"  \
  --require-approval never      \
  --outputs-file     "$OUTPUTS_FILE" \
  "${CDK_PARAMS[@]}" || fail "CDK Deploy が失敗しました。"

# src/ にコピー
SRC_DIR="$(dirname "$AWS_DIR")/src"
if [[ -f "$OUTPUTS_FILE" && -d "$SRC_DIR" ]]; then
  cp "$OUTPUTS_FILE" "$SRC_DIR/aws-outputs.json"
  success "CDK Outputs を src/aws-outputs.json にコピーしました"
fi

# mobile-app/ にコピー
MOBILE_APP_DIR="$(dirname "$AWS_DIR")/mobile-app"
if [[ -f "$OUTPUTS_FILE" && -d "$MOBILE_APP_DIR" ]]; then
  cp "$OUTPUTS_FILE" "$MOBILE_APP_DIR/aws-outputs.json"
  success "CDK Outputs を mobile-app/aws-outputs.json にコピーしました"
fi

# -----------------------------------------------------------------------------
# デプロイ後: Outputs 表示
# -----------------------------------------------------------------------------
echo ""
echo "=== デプロイ結果 ==="

OUTPUTS="$(aws cloudformation describe-stacks \
  --stack-name PoiWebhookStack \
  --profile    "$PROFILE" \
  --region     "$REGION"  \
  --query      'Stacks[0].Outputs' \
  --output     json)"

echo "$OUTPUTS" | jq -r '.[] | "  \(.OutputKey)  = \(.OutputValue)"'

echo ""
success "デプロイ完了!"
success "CDK Outputs を保存しました: $OUTPUTS_FILE"
info "  → poi プラグインを再起動すると AWS モードの設定が自動入力されます"
echo ""
echo "次のステップ:"
echo "  1. poi を再起動してプラグインを開き、AWS モードを選択してログインしてください"
echo ""
