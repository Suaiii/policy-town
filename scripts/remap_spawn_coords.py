#!/usr/bin/env python3
"""把旧 the_ville 坐标重映射到星河市网格（60x34）的安全出生点。"""
import json
import os
import sys
from collections import deque

W, H = 60, 34
MAZE_PATH = os.path.join(
    os.path.dirname(__file__),
    "..",
    "environment/frontend_server/static_dirs/assets/the_ville/matrix/maze/collision_maze.csv",
)

SPAWNS = [  # (x, y) tile 坐标，分布在广场与各楼门口附近的可走区域
    (18, 20), (20, 20), (22, 20), (24, 20), (26, 20), (28, 20),
    (30, 20), (32, 20), (34, 20), (36, 20), (38, 20), (40, 20),
    (18, 22), (20, 22), (22, 22), (24, 22), (26, 22), (28, 22),
    (30, 22), (32, 22), (34, 22), (36, 22), (38, 22), (40, 22),
]


def load_maze():
    with open(MAZE_PATH) as f:
        vals = [v.strip() for v in f.read().replace(",", " ").split()]
    if len(vals) != W * H:
        raise SystemExit(f"collision_maze.csv: 期望 {W * H} 个值，实际 {len(vals)}")
    return vals


def nearest_walkable(maze, x, y):
    seen = {(x, y)}
    q = deque([(x, y, 0)])
    while q:
        cx, cy, d = q.popleft()
        if maze[cy * W + cx] == "0":
            return cx, cy, d
        for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
            if 0 <= nx < W and 0 <= ny < H and (nx, ny) not in seen:
                seen.add((nx, ny))
                q.append((nx, ny, d + 1))
    raise SystemExit(f"无法为 ({x}, {y}) 找到可走 tile")


def checked_spawns(maze):
    out = []
    for x, y in SPAWNS:
        if maze[y * W + x] == "0":
            out.append((x, y, None))
        else:
            nx, ny, d = nearest_walkable(maze, x, y)
            out.append((nx, ny, f"({x}, {y}) -> ({nx}, {ny}) 原坐标在碰撞块上，移动 {d} 格"))
    return out


def main(path):
    maze = load_maze()
    spawns = checked_spawns(maze)
    for _, _, note in spawns:
        if note:
            print("WARN:", note)
    with open(path) as f:
        data = json.load(f)
    for i, (name, info) in enumerate(data.items()):
        x, y, _ = spawns[i % len(spawns)]
        info["x"], info["y"] = x, y
        info["maze"] = "the_ville"
    with open(path, "w") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("remapped", len(data), "personas")


if __name__ == "__main__":
    main(sys.argv[1])
