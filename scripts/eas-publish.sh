#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# poi-notice モバイルアプリ EAS ビルド & ストア提出スクリプト (sh 版)
#
# Usage:
#   ./eas-publish.sh
#   ./eas-publish.sh --platform ios
#   ./eas-publish.sh --platform android --skip-submit
#   ./eas-publish.sh --skip-build --platform ios
# ---------------------------------------------------------------------------
set -euo pipefail

# -----------------------------------------------------------------------------
# ユーティリティ
# -----------------------------------------------------------------------------
info()    { printf '\033[36m[INFO]  %s\033[0m\n' "$*"; }
success() { printf '\033[32m[OK]    %s\033[0m\n' "$*"; }
warn()    { printf '\033[33m[WARN]  %s\033[0m\n' "$*"; }
fail()    { printf '\033[31m[ERROR] %s\033[0m\n' "$*"; exit 1; }

# -----------------------------------------------------------------------------
# 引数解析
# -----------------------------------------------------------------------------
PLATFORM="all"
PROFILE="production"
SKIP_BUILD=false
SKIP_SUBMIT=false
NON_INTERACTIVE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform)        PLATFORM="$2";        shift 2 ;;
    --profile)         PROFILE="$2";         shift 2 ;;
    --skip-build)      SKIP_BUILD=true;      shift ;;
    --skip-submit)     SKIP_SUBMIT=true;     shift ;;
    --non-interactive) NON_INTERACTIVE=true;  shift ;;
    *) fail "不明なオプション: $1" ;;
  esac
done

# バリデーション
case "$PLATFORM" in
  ios|android|all) ;;
  *) fail "--platform は ios, android, all のいずれかです。" ;;
esac
case "$PROFILE" in
  production|preview) ;;
  *) fail "--profile は production, preview のいずれかです。" ;;
esac

# -----------------------------------------------------------------------------
# ディレクトリ移動
# -----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MOBILE_APP_DIR="$PROJECT_ROOT/mobile-app"

[[ ! -d "$MOBILE_APP_DIR" ]] && fail "mobile-app ディレクトリが見つかりません: $MOBILE_APP_DIR"
cd "$MOBILE_APP_DIR"
info "作業ディレクトリ: $MOBILE_APP_DIR"

# -----------------------------------------------------------------------------
# 前提ツール確認
# -----------------------------------------------------------------------------
echo ""
echo "=== 前提ツール確認 ==="

for cmd in node npm eas; do
  if command -v "$cmd" &>/dev/null; then
    success "$cmd : $(command -v "$cmd")"
  else
    fail "$cmd が見つかりません。インストールしてください。"
  fi
done

EAS_VER="$(eas --version 2>&1)"
info "EAS CLI: $EAS_VER"

# -----------------------------------------------------------------------------
# aws-outputs.json 確認
# -----------------------------------------------------------------------------
AWS_OUTPUTS="$MOBILE_APP_DIR/aws-outputs.json"
[[ ! -f "$AWS_OUTPUTS" ]] && fail "aws-outputs.json が見つかりません。先に deploy.sh を実行してください。"
success "aws-outputs.json を確認しました"

# -----------------------------------------------------------------------------
# バージョン表示
# -----------------------------------------------------------------------------
APP_VERSION="$(jq -r '.version' "$PROJECT_ROOT/version.json")"
info "アプリバージョン: $APP_VERSION"

# -----------------------------------------------------------------------------
# 確認
# -----------------------------------------------------------------------------
if [[ "$NON_INTERACTIVE" == "false" ]]; then
  echo ""
  echo "  プラットフォーム : $PLATFORM"
  echo "  プロファイル     : $PROFILE"
  echo "  ビルド           : $( [[ "$SKIP_BUILD" == "false" ]] && echo true || echo false )"
  echo "  ストア提出       : $( [[ "$SKIP_SUBMIT" == "false" ]] && echo true || echo false )"
  echo ""
  read -rp "続行しますか? (y/N) " CONFIRM
  case "$CONFIRM" in
    y|Y|yes) ;;
    *) warn "中止しました。"; exit 0 ;;
  esac
fi

# プラットフォームリスト
if [[ "$PLATFORM" == "all" ]]; then
  PLATFORMS=(ios android)
else
  PLATFORMS=("$PLATFORM")
fi

# -----------------------------------------------------------------------------
# EAS Build
# -----------------------------------------------------------------------------
if [[ "$SKIP_BUILD" == "false" ]]; then
  echo ""
  echo "=== EAS Build ==="

  for p in "${PLATFORMS[@]}"; do
    info "ビルド開始: $p ($PROFILE)"
    eas build --platform "$p" --profile "$PROFILE" --non-interactive || fail "EAS Build ($p) が失敗しました。"
    success "ビルド完了: $p"
  done
else
  warn "ビルドをスキップしました (--skip-build)"
fi

# -----------------------------------------------------------------------------
# EAS Submit
# -----------------------------------------------------------------------------
if [[ "$SKIP_SUBMIT" == "false" ]]; then
  echo ""
  echo "=== EAS Submit ==="

  for p in "${PLATFORMS[@]}"; do
    info "ストア提出開始: $p ($PROFILE)"
    eas submit --platform "$p" --profile "$PROFILE" --non-interactive --latest || fail "EAS Submit ($p) が失敗しました。"
    success "ストア提出完了: $p"
  done
else
  warn "ストア提出をスキップしました (--skip-submit)"
fi

# -----------------------------------------------------------------------------
# 完了
# -----------------------------------------------------------------------------
echo ""
echo "=== 完了 ==="
success "EAS ビルド & 提出が完了しました (v$APP_VERSION)"
echo ""
echo "次のステップ:"
for p in "${PLATFORMS[@]}"; do
  case "$p" in
    ios)     echo "  - iOS: App Store Connect でビルドを確認し、審査に提出してください" ;;
    android) echo "  - Android: Google Play Console でビルドを確認してください" ;;
  esac
done
echo ""
