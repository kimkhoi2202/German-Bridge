# Table Textures

This folder keeps the reproducible source and generator for the hard-to-edit
poker felt image used by the live German Bridge table.

## Files

- `poker-table-felt-source.jpg`: source artwork copied from the previous
  `public/textures/poker-table-felt.jpg` asset.
- `generate-poker-felt-texture.py`: crops a seamless `1066x1066` two-period
  texture tile from the source artwork and writes it back to
  `public/textures/poker-table-felt.jpg`.

## Regenerate

From the repo root:

```bash
/Users/khoilam/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 "Generation Scripts/Table Textures/generate-poker-felt-texture.py"
```

The crop uses the source artwork's measured `533px` suit-pattern repeat. The
left/top crop starts were chosen in lower-detail felt areas so the CSS repeat
boundary is less noticeable even before tinting and table lighting are applied.
