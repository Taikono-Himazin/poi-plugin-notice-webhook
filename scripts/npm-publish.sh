#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# poi-plugin-notice-webhook npm パブリッシュスクリプト (sh 版)
#
# Usage:
#   ./npm-publish.sh
#   ./npm-publish.sh --dry-run
#   ./npm-publish.sh --skip-test
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
DRY_RUN=false
SKIP_TEST=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)   DRY_RUN=true;   shift ;;
    --skip-test) SKIP_TEST=true; shift ;;
    *) fail "不明なオプション: $1" ;;
  esac
done

# -----------------------------------------------------------------------------
# ディレクトリ移動
# -----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="$PROJECT_ROOT/src"

[[ ! -d "$SRC_DIR" ]] && fail "src ディレクトリが見つかりません: $SRC_DIR"
cd "$SRC_DIR"
info "作業ディレクトリ: $SRC_DIR"

# -----------------------------------------------------------------------------
# 前提確認
# -----------------------------------------------------------------------------
echo ""
echo "=== 前提確認 ==="

for cmd in node npm; do
  if command -v "$cmd" &>/dev/null; then
    success "$cmd : $(command -v "$cmd")"
  else
    fail "$cmd が見つかりません。"
  fi
done

# npm ログイン確認
NPM_USER="$(npm whoami 2>&1)" || fail "npm にログインしていません。'npm login' を実行してください。"
success "npm ユーザー: $NPM_USER"

# -----------------------------------------------------------------------------
# package.json 読み込み
# -----------------------------------------------------------------------------
PKG_NAME="$(jq -r '.name' package.json)"
PKG_VERSION="$(jq -r '.version' package.json)"
info "パッケージ: ${PKG_NAME}@${PKG_VERSION}"

# 既に公開済みか確認
if PUBLISHED_VERSIONS="$(npm view "$PKG_NAME" versions --json 2>&1)"; then
  if echo "$PUBLISHED_VERSIONS" | jq -e --arg v "$PKG_VERSION" 'if type == "array" then index($v) else . == $v end' &>/dev/null; then
    fail "バージョン $PKG_VERSION は既に公開済みです。package.json のバージョンを上げてください。"
  fi
  success "バージョン $PKG_VERSION は未公開です"
else
  info "新規パッケージとして公開します"
fi

# -----------------------------------------------------------------------------
# files フィールドのファイル存在確認
# -----------------------------------------------------------------------------
echo ""
echo "=== パッケージ内容確認 ==="

FILES="$(jq -r '.files[]? // empty' package.json 2>/dev/null || true)"
if [[ -n "$FILES" ]]; then
  while IFS= read -r f; do
    if [[ -e "$SRC_DIR/$f" ]]; then
      success "  $f"
    else
      fail "files に記載されたファイルが見つかりません: $f"
    fi
  done <<< "$FILES"
fi

# npm pack で中身を確認
info "パッケージ内容をプレビュー:"
npm pack --dry-run || fail "npm pack --dry-run が失敗しました。"

# -----------------------------------------------------------------------------
# テスト
# -----------------------------------------------------------------------------
if [[ "$SKIP_TEST" == "false" ]]; then
  TEST_SCRIPT="$(jq -r '.scripts.test // ""' package.json)"
  if [[ -n "$TEST_SCRIPT" && "$TEST_SCRIPT" != *"no test specified"* ]]; then
    echo ""
    echo "=== テスト実行 ==="
    npm test || fail "テストが失敗しました。"
    success "テスト完了"
  else
    warn "テストスクリプトが未設定のためスキップします"
  fi
else
  warn "テストをスキップしました (--skip-test)"
fi

# -----------------------------------------------------------------------------
# パブリッシュ
# -----------------------------------------------------------------------------
echo ""
echo "=== npm publish ==="

if [[ "$DRY_RUN" == "true" ]]; then
  warn "ドライランモード: 実際には公開しません"
  npm publish --dry-run
  success "ドライラン完了"
else
  info "${PKG_NAME}@${PKG_VERSION} を公開します..."
  npm publish || fail "npm publish が失敗しました。"
  success "${PKG_NAME}@${PKG_VERSION} を公開しました"
fi

# -----------------------------------------------------------------------------
# 完了
# -----------------------------------------------------------------------------
echo ""
success "完了!"
if [[ "$DRY_RUN" == "false" ]]; then
  echo "  https://www.npmjs.com/package/$PKG_NAME"
fi
echo ""
