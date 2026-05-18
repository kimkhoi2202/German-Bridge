#!/usr/bin/env python3
"""Regenerate the seamless poker felt texture used by the live table."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = Path(__file__).with_name("poker-table-felt-source.jpg")
DEFAULT_OUTPUT = ROOT / "public" / "textures" / "poker-table-felt.jpg"

# The source artwork's suit pattern repeats every 533 px. Exporting two
# periods keeps enough resolution while making the browser repeat boundary
# land on the actual pattern boundary instead of the arbitrary source edge.
PERIOD_PX = 533
PERIODS_PER_TILE = 2
CROP_LEFT = 230
CROP_TOP = 7
JPEG_QUALITY = 94


def generate(source: Path, output: Path) -> None:
    image = Image.open(source).convert("RGB")
    tile_size = PERIOD_PX * PERIODS_PER_TILE
    crop_box = (
        CROP_LEFT,
        CROP_TOP,
        CROP_LEFT + tile_size,
        CROP_TOP + tile_size,
    )

    if crop_box[2] > image.width or crop_box[3] > image.height:
        raise ValueError(
            f"Crop box {crop_box} exceeds source dimensions {image.width}x{image.height}"
        )

    output.parent.mkdir(parents=True, exist_ok=True)
    tile = image.crop(crop_box)
    tile.save(output, quality=JPEG_QUALITY, optimize=True, progressive=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    generate(args.source, args.output)


if __name__ == "__main__":
    main()
