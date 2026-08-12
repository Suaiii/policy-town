#!/usr/bin/env python3
"""Rewrite persona spatial_memory.json for the Xinghe city tree."""
import json
import sys

# (sector, arena, game_objects[]) 结构，与 special_blocks 一致
TREE = {
    "科技园区": {
        "星云科技大厦": ["前台", "会议室", "茶水间"],
        "华芯半导体大厦": ["前台", "产线车间", "会议室"],
    },
    "中央商务区": {
        "智联软件大厦": ["前台", "开放办公区", "咖啡角"],
        "星河重工大厦": ["前台", "装配车间", "食堂"],
    },
    "市民广场": {
        "市政府大楼": ["大厅", "会议室", "政策研究室"],
        "中央广场": ["喷泉", "长椅"],
    },
}
OLD_WORLD = "the Ville"


def convert(path):
    with open(path) as f:
        data = json.load(f)
    new_tree = {"星河市": TREE}
    with open(path, "w") as f:
        json.dump(new_tree, f, ensure_ascii=False, indent=2)
    return data


def main():
    for path in sys.argv[1:]:
        convert(path)
        print("rewrote:", path)


if __name__ == "__main__":
    main()
