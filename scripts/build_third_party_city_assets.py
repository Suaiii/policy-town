#!/usr/bin/env python3
"""Build small, traceable production sprites from the CC0 city asset catalog."""

from pathlib import Path
from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/third-party/city-assets"
OUTPUT = ROOT / "public/assets/city-v3/third-party"


def night_variant(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    rgb = Image.blend(rgba.convert("RGB"), Image.new("RGB", rgba.size, (46, 64, 118)), 0.38)
    rgb = ImageEnhance.Brightness(rgb).enhance(0.68)
    result = rgb.convert("RGBA")
    result.putalpha(alpha)
    return result


def save_pair(name: str, image: Image.Image, scale: int = 1) -> None:
    sprite = image.convert("RGBA")
    if scale != 1:
        sprite = sprite.resize((sprite.width * scale, sprite.height * scale), Image.Resampling.NEAREST)
    sprite.save(OUTPUT / f"{name}-day-v3.png")
    night_variant(sprite).save(OUTPUT / f"{name}-night-v3.png")


def crop(source: Path, box: tuple[int, int, int, int]) -> Image.Image:
    return Image.open(source).convert("RGBA").crop(box)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    lpc = SOURCE / "lpc-modern-streets/extracted"
    kenney = SOURCE / "kenney-rpg-urban/extracted/Tiles"

    save_pair("traffic-signal", crop(lpc / "decor/traffic_lights.png", (0, 0, 32, 64)), 2)
    save_pair("trash-bin", crop(lpc / "decor/trash_bins.png", (0, 0, 32, 32)), 2)
    save_pair("traffic-cone", crop(lpc / "decor/traffic_cones.png", (0, 0, 32, 32)), 2)
    save_pair("manhole", crop(lpc / "terrains/manhole_and_cover.png", (32, 0, 64, 32)))
    save_pair("road-crack", crop(lpc / "terrains/cracks_transparent.png", (0, 0, 64, 64)))
    save_pair("storm-drain", crop(lpc / "terrains/rain_gutter_drain.png", (64, 0, 96, 32)))
    save_pair("fire-hydrant", Image.open(kenney / "tile_0251.png"), 2)
    save_pair("mailbox", Image.open(kenney / "tile_0305.png"), 2)
    save_pair("vending-machine", Image.open(kenney / "tile_0277.png"), 2)
    save_pair("flower-box", Image.open(kenney / "tile_0304.png"), 2)

    (OUTPUT / "SOURCES.md").write_text(
        "# Production sprite sources\n\n"
        "All files are deterministic crops or 2× nearest-neighbor derivatives of CC0 assets.\n\n"
        "- `traffic-signal`, `trash-bin`, `traffic-cone`, `manhole`, `road-crack`, `storm-drain`: LPC Modern Streets by Faufilage, CC0 1.0.\n"
        "- `fire-hydrant`, `mailbox`, `vending-machine`, `flower-box`: Kenney RPG Urban Pack, CC0 1.0.\n\n"
        "Original archives, hashes and source URLs remain in `assets/third-party/city-assets/`.\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
