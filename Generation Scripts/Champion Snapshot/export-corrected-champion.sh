#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

PYTHON_BIN="${PYTHON_BIN:-python3}"

"${PYTHON_BIN}" scripts/export_champion_snapshot.py \
  --checkpoint ai-checkpoints/theodore-hybrid-platform-v1-h768-bs2048-bw130-cal45-av08-e10.pt \
  --out src/lib/ai/championSnapshotWeights.json
