#!/usr/bin/env python3
"""Convert policy-town city-v3 manifest into Stanford reverie maze data."""
import json
import os
import sys

TILE = 32
COLLISION_ID = "32125"
WALKABLE = "0"
WORLD_NAME = "星河市"

SECTORS = {
    "A": ("33001", "星河市", "科技园区"),
    "B": ("33001", "星河市", "科技园区"),
    "C": ("33002", "星河市", "中央商务区"),
    "D": ("33002", "星河市", "中央商务区"),
    "GOV": ("33003", "星河市", "市民广场"),
}
ARENAS = {
    "A": ("33101", "星河市", "科技园区", "星云科技大厦"),
    "B": ("33102", "星河市", "科技园区", "华芯半导体大厦"),
    "C": ("33103", "星河市", "中央商务区", "智联软件大厦"),
    "D": ("33104", "星河市", "中央商务区", "星河重工大厦"),
    "GOV": ("33105", "星河市", "市民广场", "市政府大楼"),
    "PLAZA": ("33106", "星河市", "市民广场", "中央广场"),
}
GAME_OBJECTS = {
    "A": [("33201", "星河市", "科技园区", "星云科技大厦", "前台"),
          ("33202", "星河市", "科技园区", "星云科技大厦", "会议室"),
          ("33203", "星河市", "科技园区", "星云科技大厦", "茶水间")],
    "B": [("33204", "星河市", "科技园区", "华芯半导体大厦", "前台"),
          ("33205", "星河市", "科技园区", "华芯半导体大厦", "产线车间"),
          ("33206", "星河市", "科技园区", "华芯半导体大厦", "会议室")],
    "C": [("33207", "星河市", "中央商务区", "智联软件大厦", "前台"),
          ("33208", "星河市", "中央商务区", "智联软件大厦", "开放办公区"),
          ("33209", "星河市", "中央商务区", "智联软件大厦", "咖啡角")],
    "D": [("33210", "星河市", "中央商务区", "星河重工大厦", "前台"),
          ("33211", "星河市", "中央商务区", "星河重工大厦", "装配车间"),
          ("33212", "星河市", "中央商务区", "星河重工大厦", "食堂")],
    "GOV": [("33213", "星河市", "市民广场", "市政府大楼", "大厅"),
            ("33214", "星河市", "市民广场", "市政府大楼", "会议室"),
            ("33215", "星河市", "市民广场", "市政府大楼", "政策研究室")],
    "PLAZA": [("33216", "星河市", "市民广场", "中央广场", "喷泉"),
              ("33217", "星河市", "市民广场", "中央广场", "长椅")],
}
SPAWNS = {
    "A": ("33301", "星河市", "科技园区", "星云科技大厦", "大门"),
    "B": ("33302", "星河市", "科技园区", "华芯半导体大厦", "大门"),
    "C": ("33303", "星河市", "中央商务区", "智联软件大厦", "大门"),
    "D": ("33304", "星河市", "中央商务区", "星河重工大厦", "大门"),
    "GOV": ("33305", "星河市", "市民广场", "市政府大楼", "大门"),
    "PLAZA": ("33306", "星河市", "市民广场", "中央广场", "中心"),
}
# manifest ownerId → 语义层 key（ownerId 是小写英文名，直接 .upper() 无法得到 GOV/A）
OWNER_MAP = {
    "government": "GOV",
    "company-a": "A",
    "company-b": "B",
    "company-c": "C",
    "company-d": "D",
}


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


def tile_floor(px):
    """像素坐标 → tile 坐标（向下取整，clamp 到网格内）"""
    return max(0, int(px) // TILE)


def building_tiles(manifest):
    """返回 {building_id: set((x_tile, y_tile))}，用 collisionRects 的 rect 区域"""
    result = {}
    for rect in manifest["collisionRects"]:
        owner = rect["ownerId"]
        x0 = tile_floor(rect["x"]); y0 = tile_floor(rect["y"])
        x1 = tile_floor(rect["x"] + rect["width"]); y1 = tile_floor(rect["y"] + rect["height"])
        result[owner] = {(x, y) for x in range(x0, min(x1, 60)) for y in range(y0, min(y1, 34))}
    return result


def write_semantic_layers(manifest, out_dir, meta):
    tiles = building_tiles(manifest)
    h, w = meta["maze_height"], meta["maze_width"]
    sector = [["0"] * w for _ in range(h)]
    arena = [["0"] * w for _ in range(h)]
    gob = [["0"] * w for _ in range(h)]
    spawn = [["0"] * w for _ in range(h)]

    for owner, cells in tiles.items():
        key = OWNER_MAP.get(owner)
        if key is None:
            continue
        sid, _, _ = SECTORS[key]
        aid, *_ = ARENAS[key]
        for (x, y) in cells:
            sector[y][x] = sid
            arena[y][x] = aid

    # 出生点：每栋楼门口（portal 坐标）与广场中心
    for portal in manifest["portals"]:
        key = OWNER_MAP.get(portal["ownerId"])
        if key is not None and key in SPAWNS:
            spawn[tile_floor(portal["y"])][tile_floor(portal["x"])] = SPAWNS[key][0]

    # 广场中心出生点
    spawn[17][30] = SPAWNS["PLAZA"][0]

    def write(name, matrix):
        flat = []
        for row in matrix:
            flat += row
        with open(f"{out_dir}/{name}", "w", newline="") as f:
            f.write(", ".join(flat))

    write("sector_maze.csv", sector)
    write("arena_maze.csv", arena)
    write("game_object_maze.csv", gob)
    write("spawning_location_maze.csv", spawn)


def write_special_blocks(out_dir):
    os.makedirs(f"{out_dir}/special_blocks", exist_ok=True)
    with open(f"{out_dir}/special_blocks/world_blocks.csv", "w") as f:
        f.write("99999, 星河市")
    rows = {
        "sector_blocks.csv": list(dict.fromkeys(SECTORS.values())),
        "arena_blocks.csv": list(ARENAS.values()),
        "game_object_blocks.csv": [g for gs in GAME_OBJECTS.values() for g in gs],
        "spawning_location_blocks.csv": list(SPAWNS.values()),
    }
    for name, entries in rows.items():
        with open(f"{out_dir}/special_blocks/{name}", "w") as f:
            for e in entries:
                f.write(", ".join(e) + "\n")


def main():
    manifest_path = sys.argv[sys.argv.index("--manifest") + 1]
    out_dir = sys.argv[sys.argv.index("--out") + 1]
    manifest = load_manifest(manifest_path)
    meta = write_meta(manifest, out_dir)
    write_collision(manifest, out_dir)
    write_semantic_layers(manifest, out_dir, meta)
    write_special_blocks(out_dir)
    print("done:", out_dir)


if __name__ == "__main__":
    main()
