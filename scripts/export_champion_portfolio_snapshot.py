from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.export_champion_snapshot import export_checkpoint


def main() -> None:
    parser = argparse.ArgumentParser(description="Export a fair German Bridge checkpoint portfolio for TypeScript inference.")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    selected_ids = sorted({str(row["checkpoint_id"]) for row in manifest.get("selection", [])})
    source_paths = {
        str(source["checkpoint_id"]): Path(source["checkpoint_path"])
        for source in manifest.get("sources", [])
    }
    missing = [checkpoint_id for checkpoint_id in selected_ids if checkpoint_id not in source_paths]
    if missing:
        raise ValueError(f"portfolio manifest is missing source paths for: {', '.join(missing)}")

    models = {
        checkpoint_id: export_checkpoint(source_paths[checkpoint_id])
        for checkpoint_id in selected_ids
    }
    exported: dict[str, Any] = {
        "checkpointId": manifest["portfolio_id"],
        "createdBy": manifest.get("created_by"),
        "trainingMode": manifest.get("training_mode"),
        "notes": manifest.get("notes", ""),
        "portfolio": {
            "selectorMetric": manifest.get("selector_metric"),
            "baselineCheckpointId": manifest.get("baseline_checkpoint_id"),
            "regularization": manifest.get("regularization"),
            "selection": [
                {
                    "playerCount": int(row["playerCount"]),
                    "tricksPerHand": int(row["tricksPerHand"]),
                    "checkpointId": str(row["checkpoint_id"]),
                }
                for row in manifest.get("selection", [])
            ],
            "models": models,
        },
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(exported, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({
        "checkpointId": exported["checkpointId"],
        "out": str(out),
        "models": len(models),
        "selections": len(exported["portfolio"]["selection"]),
        "bytes": out.stat().st_size,
    }, indent=2))


if __name__ == "__main__":
    main()
