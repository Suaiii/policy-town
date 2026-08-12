#!/usr/bin/env python3
"""Normalize City V3 sprites and build perfectly aligned night/ground pairs."""

from __future__ import annotations

import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public" / "assets" / "city-v3"


def clean_alpha(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha < 64:
                pixels[x, y] = (red, green, blue, 0)
    return image


def trim_and_resize(path: Path, max_size: tuple[int, int], keep_canvas: bool = False) -> None:
    image = clean_alpha(Image.open(path))
    if keep_canvas:
        image = image.resize(max_size, Image.Resampling.NEAREST)
    else:
        bbox = image.getchannel("A").getbbox()
        if bbox is None:
            raise RuntimeError(f"No visible subject in {path}")
        padding = 6
        left = max(0, bbox[0] - padding)
        top = max(0, bbox[1] - padding)
        right = min(image.width, bbox[2] + padding)
        bottom = min(image.height, bbox[3] + padding)
        image = image.crop((left, top, right, bottom))
        scale = min(max_size[0] / image.width, max_size[1] / image.height, 1)
        image = image.resize(
            (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
            Image.Resampling.NEAREST,
        )
    image.save(path, optimize=True)


def nightify(day_path: Path, add_windows: bool = False) -> Path:
    image = Image.open(day_path).convert("RGBA")
    red, green, blue, alpha = image.split()
    red = red.point(lambda value: min(255, round(value * 0.24 + 5)))
    green = green.point(lambda value: min(255, round(value * 0.30 + 8)))
    blue = blue.point(lambda value: min(255, round(value * 0.52 + 27)))
    night = Image.merge("RGBA", (red, green, blue, alpha))
    night = ImageEnhance.Contrast(night).enhance(1.08)
    night.putalpha(alpha)

    if add_windows:
        draw = ImageDraw.Draw(night)
        randomizer = random.Random(day_path.name)
        for y in range(10, night.height - 8, 13):
            for x in range(8, night.width - 8, 11):
                if randomizer.random() > 0.17 or alpha.getpixel((x, y)) < 220:
                    continue
                source = image.getpixel((x, y))
                if max(source[:3]) < 35 or max(source[:3]) > 205:
                    continue
                draw.rectangle((x, y, x + 2, y + 2), fill=(244, 190, 92, 210))
        night.putalpha(alpha)

    night_path = day_path.with_name(day_path.name.replace("-day-v3.png", "-night-v3.png"))
    night.save(night_path, optimize=True)
    return night_path


def vertical_gradient(size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    width, height = size
    image = Image.new("RGBA", size)
    draw = ImageDraw.Draw(image)
    for y in range(height):
        ratio = y / max(1, height - 1)
        color = tuple(round(top[index] + (bottom[index] - top[index]) * ratio) for index in range(3))
        draw.line((0, y, width, y), fill=(*color, 255))
    return image


def make_sky() -> None:
    day = vertical_gradient((1920, 1080), (86, 148, 176), (208, 205, 160))
    night = vertical_gradient((1920, 1080), (11, 20, 55), (51, 46, 87))
    draw = ImageDraw.Draw(night)
    randomizer = random.Random(3107)
    for _ in range(92):
        x = randomizer.randrange(24, 1896)
        y = randomizer.randrange(18, 330)
        strength = randomizer.choice((110, 150, 190, 225))
        draw.point((x, y), fill=(strength, min(255, strength + 8), 255, 255))
        if strength > 200:
            draw.point((x + 1, y), fill=(120, 132, 185, 255))
    day.save(ASSETS / "background" / "sky-day-v3.png", optimize=True)
    night.save(ASSETS / "background" / "sky-night-v3.png", optimize=True)


def draw_ground_palette(night: bool) -> Image.Image:
    if night:
        colors = {
            "lot": (50, 66, 82, 255), "green": (38, 65, 61, 255), "road": (30, 36, 53, 255),
            "walk": (78, 86, 98, 255), "curb": (130, 124, 116, 255), "line": (176, 171, 147, 220),
            "plaza": (73, 78, 91, 255),
        }
    else:
        colors = {
            "lot": (132, 151, 148, 255), "green": (91, 126, 102, 255), "road": (55, 63, 75, 255),
            "walk": (174, 179, 173, 255), "curb": (211, 193, 143, 255), "line": (239, 235, 215, 235),
            "plaza": (178, 180, 170, 255),
        }

    image = Image.new("RGBA", (1920, 1080), colors["lot"])
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 735, 1919, 1079), fill=colors["green"])

    # Headquarters plots and civic plaza.
    for box in ((38, 430, 438, 545), (445, 430, 742, 545), (1178, 430, 1478, 545), (1490, 430, 1890, 545)):
        draw.rectangle(box, fill=colors["plaza"])
    draw.rectangle((748, 410, 1170, 545), fill=colors["plaza"])

    # Road, civic axis, sidewalks and curbs.
    draw.rectangle((0, 574, 1919, 721), fill=colors["road"])
    draw.rectangle((870, 470, 1050, 1079), fill=colors["road"])
    draw.rectangle((0, 546, 1919, 573), fill=colors["walk"])
    draw.rectangle((0, 722, 1919, 756), fill=colors["walk"])
    draw.rectangle((842, 470, 869, 1079), fill=colors["walk"])
    draw.rectangle((1051, 470, 1078, 1079), fill=colors["walk"])
    draw.rectangle((0, 546, 1919, 549), fill=colors["curb"])
    draw.rectangle((0, 753, 1919, 756), fill=colors["curb"])

    # Pixel asphalt texture.
    randomizer = random.Random(718 if night else 717)
    for _ in range(4800):
        x = randomizer.randrange(0, 1920)
        y = randomizer.randrange(574, 722)
        delta = randomizer.choice((-9, -5, 5, 8))
        base = colors["road"]
        draw.point((x, y), fill=tuple(max(0, min(255, channel + delta)) for channel in base[:3]) + (150,))

    # Lane dividers, crosswalks, parking bays and bus pocket.
    for x in range(18, 1920, 66):
        draw.rectangle((x, 645, x + 36, 650), fill=colors["line"])
    for y in range(775, 1080, 62):
        draw.rectangle((956, y, 962, y + 33), fill=colors["line"])
    for index in range(9):
        draw.rectangle((806 + index * 15, 583, 814 + index * 15, 638), fill=colors["line"])
        draw.rectangle((1058 + index * 15, 657, 1066 + index * 15, 714), fill=colors["line"])
    for x in range(498, 780, 58):
        draw.line((x, 583, x + 24, 625), fill=colors["line"], width=3)
    for x in range(1495, 1840, 58):
        draw.line((x, 673, x + 24, 716), fill=colors["line"], width=3)
    draw.rectangle((30, 758, 314, 838), outline=colors["line"], width=4)
    for x in range(45, 300, 64):
        draw.rectangle((x, 793, x + 40, 798), fill=colors["line"])

    # Life-district paving with subtle grid.
    for box in ((24, 782, 760, 1044), (786, 782, 1136, 1044), (1158, 782, 1892, 1044)):
        draw.rectangle(box, fill=colors["plaza"])
        for x in range(box[0] + 16, box[2], 32):
            draw.line((x, box[1], x, box[3]), fill=(*colors["walk"][:3], 45), width=1)
        for y in range(box[1] + 16, box[3], 32):
            draw.line((box[0], y, box[2], y), fill=(*colors["walk"][:3], 45), width=1)
    alpha = Image.new("L", image.size, 255)
    alpha_draw = ImageDraw.Draw(alpha)
    alpha_draw.rectangle((0, 0, 1919, 339), fill=0)
    for y in range(340, 501):
        alpha_draw.line((0, y, 1919, y), fill=round((y - 340) / 160 * 255))
    image.putalpha(alpha)
    return image


def make_ground() -> None:
    draw_ground_palette(False).save(ASSETS / "ground" / "city-ground-day-v3.png", optimize=True)
    draw_ground_palette(True).save(ASSETS / "ground" / "city-ground-night-v3.png", optimize=True)


def draw_axial_ground(night: bool) -> Image.Image:
    if night:
        colors = {
            "lot": (49, 64, 78, 255), "green": (35, 62, 57, 255), "road": (29, 35, 51, 255),
            "walk": (76, 84, 94, 255), "curb": (130, 123, 112, 255), "line": (183, 176, 151, 225),
            "plaza": (56, 69, 78, 255), "stone": (78, 82, 91, 255), "water": (45, 82, 103, 255),
        }
    else:
        colors = {
            "lot": (126, 145, 140, 255), "green": (82, 119, 94, 255), "road": (54, 61, 72, 255),
            "walk": (173, 178, 170, 255), "curb": (207, 190, 139, 255), "line": (239, 235, 214, 235),
            "plaza": (143, 154, 146, 255), "stone": (180, 181, 169, 255), "water": (79, 142, 162, 255),
        }

    image = Image.new("RGBA", (1920, 1080), colors["lot"])
    draw = ImageDraw.Draw(image)

    # Soft city green and five connected building plots. The government plot
    # owns the geometric center; the smaller public forecourt sits below it.
    draw.rectangle((0, 790, 1919, 1079), fill=colors["green"])
    plots = ((38, 405, 452, 604), (382, 584, 748, 718), (738, 358, 1182, 532),
             (1188, 405, 1552, 604), (1518, 584, 1882, 718))
    for box in plots:
        draw.rounded_rectangle(box, radius=12, fill=colors["plaza"])

    # Civic forecourt and pedestrian spine are deliberately below the center.
    draw.rounded_rectangle((820, 570, 1100, 690), radius=15, fill=colors["stone"])
    draw.rectangle((908, 500, 1012, 742), fill=colors["stone"])
    for x in range(836, 1098, 28):
        draw.line((x, 580, x, 682), fill=(*colors["walk"][:3], 90), width=1)
    for y in range(586, 690, 24):
        draw.line((824, y, 1096, y), fill=(*colors["walk"][:3], 90), width=1)

    # Main boulevard is lower than before so the central government remains
    # dominant, while the public forecourt meets the pedestrian crossing.
    draw.rectangle((0, 720, 1919, 850), fill=colors["road"])
    draw.rectangle((0, 690, 1919, 719), fill=colors["walk"])
    draw.rectangle((0, 851, 1919, 885), fill=colors["walk"])
    draw.rectangle((0, 690, 1919, 694), fill=colors["curb"])
    draw.rectangle((0, 851, 1919, 855), fill=colors["curb"])
    draw.rectangle((908, 500, 1012, 720), fill=colors["stone"])
    draw.rectangle((908, 850, 1012, 1079), fill=colors["walk"])

    # Asphalt grain and road markings.
    randomizer = random.Random(928 if night else 927)
    for _ in range(4200):
        x = randomizer.randrange(0, 1920)
        y = randomizer.randrange(720, 851)
        delta = randomizer.choice((-8, -4, 5, 8))
        base = colors["road"]
        draw.point((x, y), fill=tuple(max(0, min(255, channel + delta)) for channel in base[:3]) + (150,))
    for x in range(18, 1920, 70):
        draw.rectangle((x, 782, x + 38, 787), fill=colors["line"])
    for index in range(10):
        draw.rectangle((875 + index * 17, 728, 884 + index * 17, 776), fill=colors["line"])
        draw.rectangle((875 + index * 17, 795, 884 + index * 17, 843), fill=colors["line"])

    # Enterprise parking bays remain outside the civic foreground.
    for x in range(300, 640, 62):
        draw.line((x, 632, x + 22, 674), fill=colors["line"], width=3)
    for x in range(1440, 1780, 62):
        draw.line((x, 632, x + 22, 674), fill=colors["line"], width=3)
    draw.rounded_rectangle((1510, 870, 1845, 948), radius=8, outline=colors["line"], width=4)
    for x in range(1530, 1830, 68):
        draw.rectangle((x, 907, x + 43, 912), fill=colors["line"])

    # Two life blocks flank the open pedestrian axis instead of becoming one
    # continuous pasted strip across the bottom.
    for box in ((20, 890, 725, 1050), (1195, 890, 1900, 1050)):
        draw.rounded_rectangle(box, radius=10, fill=colors["plaza"], outline=colors["curb"], width=3)
        for x in range(box[0] + 16, box[2], 32):
            draw.line((x, box[1], x, box[3]), fill=(*colors["walk"][:3], 45), width=1)
        for y in range(box[1] + 16, box[3], 32):
            draw.line((box[0], y, box[2], y), fill=(*colors["walk"][:3], 45), width=1)

    alpha = Image.new("L", image.size, 255)
    alpha_draw = ImageDraw.Draw(alpha)
    alpha_draw.rectangle((0, 0, 1919, 319), fill=0)
    for y in range(320, 461):
        alpha_draw.line((0, y, 1919, y), fill=round((y - 320) / 140 * 255))
    image.putalpha(alpha)
    return image


def make_axial_ground() -> None:
    draw_axial_ground(False).save(ASSETS / "ground" / "city-ground-axial-day-v3.png", optimize=True)
    draw_axial_ground(True).save(ASSETS / "ground" / "city-ground-axial-night-v3.png", optimize=True)


def make_logic_tiles() -> None:
    """Five 32px tiles shared by Tiled and the future AI Town WorldMap."""
    image = Image.new("RGBA", (160, 32), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    palette = ((126, 145, 140, 255), (82, 119, 94, 255), (54, 61, 72, 255), (173, 178, 170, 255))
    for index, color in enumerate(palette):
        draw.rectangle((index * 32, 0, index * 32 + 31, 31), fill=color)
        for offset in range(2, 32, 8):
            draw.point((index * 32 + offset, (offset * 5) % 31), fill=tuple(max(0, channel - 8) for channel in color[:3]) + (110,))
    # Tile five is intentionally fully transparent and is used only as an
    # objmap collision sentinel. AI Town treats any non--1 index as blocked.
    image.save(ASSETS / "ground" / "city-logic-tiles-v3.png", optimize=True)


def validate_pair(day_path: Path, night_path: Path) -> None:
    day = Image.open(day_path).convert("RGBA")
    night = Image.open(night_path).convert("RGBA")
    if day.size != night.size:
        raise RuntimeError(f"Size mismatch: {day_path} {day.size} != {night.size}")
    if day.getchannel("A").tobytes() != night.getchannel("A").tobytes():
        raise RuntimeError(f"Alpha mismatch: {day_path}")


def main() -> None:
    for path in sorted((ASSETS / "buildings").glob("*-day-v3.png")):
        trim_and_resize(path, (520, 520))
    for path in sorted((ASSETS / "living").glob("*-day-v3.png")):
        maximum = (300, 300) if "bus-shelter" in path.name else (420, 420)
        trim_and_resize(path, maximum)
    for path in sorted((ASSETS / "background").glob("*-day-v3.png")):
        trim_and_resize(path, (1920, 360))
    trim_and_resize(ASSETS / "atlases" / "street-props-day-v3.png", (800, 800), keep_canvas=True)
    trim_and_resize(ASSETS / "atlases" / "vehicles-day-v3.png", (800, 800), keep_canvas=True)

    generated_pairs: list[tuple[Path, Path]] = []
    for folder in ("buildings", "living", "atlases"):
        for day_path in sorted((ASSETS / folder).glob("*-day-v3.png")):
            generated_pairs.append((day_path, nightify(day_path)))
    for day_path in sorted((ASSETS / "background").glob("*-day-v3.png")):
        if day_path.name == "sky-day-v3.png":
            continue
        generated_pairs.append((day_path, nightify(day_path, add_windows=True)))

    make_sky()
    make_ground()
    make_axial_ground()
    make_logic_tiles()
    generated_pairs.extend([
        (ASSETS / "background" / "sky-day-v3.png", ASSETS / "background" / "sky-night-v3.png"),
        (ASSETS / "ground" / "city-ground-day-v3.png", ASSETS / "ground" / "city-ground-night-v3.png"),
        (ASSETS / "ground" / "city-ground-axial-day-v3.png", ASSETS / "ground" / "city-ground-axial-night-v3.png"),
    ])
    for day_path, night_path in generated_pairs:
        validate_pair(day_path, night_path)
        image = Image.open(day_path).convert("RGBA")
        corners = [
            image.getpixel((0, 0))[3], image.getpixel((image.width - 1, 0))[3],
            image.getpixel((0, image.height - 1))[3], image.getpixel((image.width - 1, image.height - 1))[3],
        ]
        if "sky-" not in day_path.name and "ground-" not in day_path.name and any(corners):
            raise RuntimeError(f"Non-transparent sprite corner: {day_path} {corners}")
        print(f"validated {day_path.relative_to(ROOT)} {image.size}")


if __name__ == "__main__":
    main()
