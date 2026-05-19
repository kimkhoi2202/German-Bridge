# Champion Snapshot Generation

This folder documents how `src/lib/ai/championSnapshotWeights.json` was generated.

## Current Mapping

- Output file: `src/lib/ai/championSnapshotWeights.json`
- Source checkpoint: `ai-checkpoints/theodore-hybrid-platform-v1-h768-bs2048-bw130-cal45-av08-e10.pt`
- Export script: `scripts/export_champion_snapshot.py`
- Inference wrapper: `src/lib/ai/championSnapshot.ts`

The snapshot is the Theodore hybrid checkpoint trained from the existing champion-style synthetic dataset plus completed production games and trace data. The app still stores the runtime personality as `champion` for compatibility, but production labels this policy as Theodore.

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
