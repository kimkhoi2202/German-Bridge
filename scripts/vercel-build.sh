#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${CONVEX_DEPLOY_KEY:-}" ]]; then
  npx convex deploy --cmd 'pnpm build' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL
else
  pnpm build
fi
