#!/bin/bash
# EAS Build hook: Secret File をプロジェクトに配置する
set -euo pipefail

echo "=== eas-build-pre-install.sh ==="
echo "pwd: $(pwd)"
echo "AWS_OUTPUTS env: ${AWS_OUTPUTS:-<not set>}"

if [ -n "${AWS_OUTPUTS:-}" ] && [ -f "$AWS_OUTPUTS" ]; then
  cp "$AWS_OUTPUTS" ./aws-outputs.json
  echo "✅ aws-outputs.json copied from EAS Secret File ($(wc -c < ./aws-outputs.json) bytes)"
else
  echo "⚠️  AWS_OUTPUTS not set, creating empty aws-outputs.json"
  echo '{}' > ./aws-outputs.json
fi

echo "Verify: $(ls -la ./aws-outputs.json)"
