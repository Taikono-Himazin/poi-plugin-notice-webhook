#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 全テストを実行するスクリプト (sh 版)
#
# Usage:
#   ./scripts/test.sh
#   ./scripts/test.sh --target aws
#   ./scripts/test.sh --target plugin
#   ./scripts/test.sh --target mobile
# ---------------------------------------------------------------------------
set -euo pipefail

# -----------------------------------------------------------------------------
# 引数解析
# -----------------------------------------------------------------------------
TARGET="all"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    *) echo "Usage: $0 [--target all|aws|plugin|mobile]"; exit 1 ;;
  esac
done

case "$TARGET" in
  all|aws|plugin|mobile) ;;
  *) echo "Error: --target は all, aws, plugin, mobile のいずれかです。"; exit 1 ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAILED=false

# -----------------------------------------------------------------------------
# テスト実行関数
# -----------------------------------------------------------------------------
run_tests() {
  local name="$1" dir="$2"

  printf '\n\033[36m========================================\n'
  printf '  %s\n' "$name"
  printf '========================================\033[0m\n'

  pushd "$dir" > /dev/null
  if [[ ! -d "node_modules" ]]; then
    printf '\033[33mnpm install ...\033[0m\n'
    npm install --silent
  fi
  if ! npx jest --verbose --coverage; then
    FAILED=true
  fi
  popd > /dev/null
}

# -----------------------------------------------------------------------------
# テスト対象
# -----------------------------------------------------------------------------
if [[ "$TARGET" == "all" || "$TARGET" == "aws" ]]; then
  run_tests "AWS Lambda Tests" "$ROOT/aws"
fi

if [[ "$TARGET" == "all" || "$TARGET" == "plugin" ]]; then
  run_tests "Plugin Pure Function Tests" "$ROOT/src"
fi

if [[ "$TARGET" == "all" || "$TARGET" == "mobile" ]]; then
  run_tests "Mobile App Tests" "$ROOT/mobile-app"
fi

# -----------------------------------------------------------------------------
# 結果
# -----------------------------------------------------------------------------
echo ""
if [[ "$FAILED" == "true" ]]; then
  printf '\033[31mSOME TESTS FAILED\033[0m\n'
  exit 1
else
  printf '\033[32mALL TESTS PASSED\033[0m\n'
  exit 0
fi
