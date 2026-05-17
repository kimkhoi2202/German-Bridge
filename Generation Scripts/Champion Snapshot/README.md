# Champion Snapshot Generation

This folder documents how `src/lib/ai/championSnapshotWeights.json` was generated.

## Current Mapping

- Output file: `src/lib/ai/championSnapshotWeights.json`
- Source checkpoint: `ai-checkpoints/cloud-ladder-profile-selfplay-self-rankmargin-v1-from-lr106-e6000.pt`
- Export script: `scripts/export_champion_snapshot.py`
- Inference wrapper: `src/lib/ai/championSnapshot.ts`

The snapshot is the current strongest corrected-ladder checkpoint as of this export. It is trained for 2-deck German Bridge with max hand size ladder rules, not the older fixed-hand interpretation.

## Regenerate

Run this from the repo root:

```sh
bash "Generation Scripts/Champion Snapshot/export-corrected-champion.sh"
```

The source checkpoint directory is intentionally gitignored because raw training
artifacts are large. Set `PYTHON_BIN=/path/to/python` if your PyTorch
environment is not available as `python3`.

After regenerating, run:

```sh
pnpm test
pnpm typecheck
pnpm build
```
