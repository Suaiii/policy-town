#!/usr/bin/env python3
"""Convert policy-town city-v3 manifest into Stanford reverie maze data."""
import csv
import json
import os
import sys

MANIFEST = "city-v3-manifest.json"   # 完整路径由 --manifest 传入
OUT_DIR = "maze_out"                 # 输出目录，由 --out 传入
TILE = 32
COLLISION_ID = "32125"
WALKABLE = "0"
WORLD_NAME = "星河市"


def load_manifest(path):
    with open(path) as f:
        return json.load(f)


def write_meta(manifest, out_dir):
    grid_h = len(manifest["collisionGrid"])
    grid_w = len(manifest["collisionGrid"][0])
    meta = {
        "world_name": WORLD_NAME,
        "maze_width": grid_w,
        "maze_height": grid_h,
        "sq_tile_size": TILE,
        "special_constraint": "",
    }
    os.makedirs(out_dir, exist_ok=True)
    with open(f"{out_dir}/maze_meta_info.json", "w") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    return meta


def write_collision(manifest, out_dir):
    flat = []
    for row in manifest["collisionGrid"]:   # 每行 = grid[y]
        for val in row:                     # 每格 = grid[y][x]
            flat.append(COLLISION_ID if val == 4 else WALKABLE)
    with open(f"{out_dir}/collision_maze.csv", "w", newline="") as f:
        f.write(", ".join(flat))


def main():
    manifest_path = sys.argv[sys.argv.index("--manifest") + 1]
    out_dir = sys.argv[sys.argv.index("--out") + 1]
    manifest = load_manifest(manifest_path)
    write_meta(manifest, out_dir)
    write_collision(manifest, out_dir)
    print(f"collision tiles: {sum(1 for r in manifest['collisionGrid'] for v in r if v == 4)}")


if __name__ == "__main__":
    main()
