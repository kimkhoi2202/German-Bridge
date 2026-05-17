#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

PYTHON_BIN="${PYTHON_BIN:-python3}"

"${PYTHON_BIN}" scripts/export_champion_snapshot.py \
  --checkpoint ai-checkpoints/cloud-ladder-profile-selfplay-self-rankmargin-v1-from-lr106-e6000.pt \
  --out src/lib/ai/championSnapshotWeights.json
