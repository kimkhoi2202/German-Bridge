from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import torch


def main() -> None:
    parser = argparse.ArgumentParser(description="Export a PyTorch German Bridge checkpoint for TypeScript inference.")
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    exported = export_checkpoint(args.checkpoint)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(exported, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({
        "checkpointId": exported["checkpointId"],
        "out": str(out),
        "featureDim": exported["architecture"]["featureDim"],
        "hiddenDim": exported["architecture"]["hiddenDim"],
        "actionDim": exported["architecture"]["actionDim"],
        "bytes": out.stat().st_size,
    }, indent=2))


def export_checkpoint(checkpoint: str | Path) -> dict[str, Any]:
    checkpoint_path = Path(checkpoint)
    payload: dict[str, Any] = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    state = payload["state_dict"]
    metadata = payload.get("metadata", {})
    architecture = payload.get("architecture", {})
    has_action_value = "action_value.weight" in state and "action_value.bias" in state
    has_bid_tricks = "bid_tricks.weight" in state and "bid_tricks.bias" in state
    exported = {
        "checkpointId": metadata.get("checkpoint_id", checkpoint_path.stem),
        "createdBy": metadata.get("created_by"),
        "trainingMode": metadata.get("training_mode"),
        "notes": metadata.get("notes", ""),
        "architecture": {
            "architectureVersion": int(architecture.get("architecture_version", 1)),
            "hiddenDim": int(architecture.get("hidden_dim") or state["encoder.0.weight"].shape[0]),
            "featureDim": int(architecture.get("feature_dim") or state["encoder.0.weight"].shape[1]),
            "actionDim": int(state["policy.bias"].shape[0]),
            "bidTrickDim": int(state["bid_tricks.bias"].shape[0]) if has_bid_tricks else 0,
            "auxiliaryHeadsTrained": bool(architecture.get("auxiliary_heads_trained", False)),
        },
        "layers": {
            "encoder0Weight": tensor_to_list(state["encoder.0.weight"]),
            "encoder0Bias": tensor_to_list(state["encoder.0.bias"]),
            "encoder2Weight": tensor_to_list(state["encoder.2.weight"]),
            "encoder2Bias": tensor_to_list(state["encoder.2.bias"]),
            "policyWeight": tensor_to_list(state["policy.weight"]),
            "policyBias": tensor_to_list(state["policy.bias"]),
        },
    }
    if has_action_value:
        exported["layers"]["actionValueWeight"] = tensor_to_list(state["action_value.weight"])
        exported["layers"]["actionValueBias"] = tensor_to_list(state["action_value.bias"])
    if has_bid_tricks:
        exported["layers"]["bidTricksWeight"] = tensor_to_list(state["bid_tricks.weight"])
        exported["layers"]["bidTricksBias"] = tensor_to_list(state["bid_tricks.bias"])
    return exported


def tensor_to_list(tensor: torch.Tensor) -> list[Any]:
    return tensor.detach().cpu().tolist()


if __name__ == "__main__":
    main()
