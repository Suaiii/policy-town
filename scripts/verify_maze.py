#!/usr/bin/env python3
"""验证星河市 maze 数据可被 reverie 正确加载（不依赖 LLM）。

验证项：
1. Maze 实例化（60×34，world=星河市）
2. tiles 构建（碰撞/语义正确）
3. address_tiles 语义路径（sector/arena/game_object 中文地址）
4. 寻路：两点之间能找到路径且避开碰撞块
5. Persona 三件套装载（Isabella/Maria/Klaus）

说明：
- maze.py 无 maze.world 属性，世界名位于 tile dict 的 "world" 字段
  （读自 world_blocks.csv），故用 maze.tiles[0][0]["world"] 断言。
- path_finder 签名为 (maze, start, end, collision_block_char)，入参为
  maze.collision_maze 与 collision_block_id（见 persona/cognitive_modules/
  execute.py 的调用方式）。
- base_the_ville_isabella_maria_klaus 的环境 0.json 仍是旧 double studio
  坐标（越界 60×34），因此验证时先 fork 到临时目录并修正坐标为中央广场
  可走 tile，再实例化 ReverieServer，结束后清理临时目录。
"""
import sys
import os
import json
import shutil
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                "..", "reverie", "backend_server"))
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                      "..", "reverie", "backend_server"))

from maze import Maze
from path_finder import path_finder
from utils import collision_block_id, fs_storage
from reverie import ReverieServer


def check(cond, msg):
    print(("PASS" if cond else "FAIL"), "-", msg)
    return cond


def main():
    ok = True

    # 1) Maze 实例化
    maze = Maze("the_ville")
    ok &= check(maze.maze_width == 60 and maze.maze_height == 34,
                f"Maze 尺寸 {maze.maze_width}x{maze.maze_height}（期望 60x34）")
    ok &= check(maze.tiles[0][0]["world"] == "星河市",
                f"world={maze.tiles[0][0]['world']}")

    # 2) tiles 语义抽查（政府楼区域应属于 市民广场:市政府大楼）
    gov_tile = maze.tiles[15][29]
    ok &= check(gov_tile["sector"] == "市民广场",
                f"tile(29,15) sector={gov_tile['sector']}（期望 市民广场）")
    ok &= check(gov_tile["arena"] == "市政府大楼",
                f"tile(29,15) arena={gov_tile['arena']}（期望 市政府大楼）")

    # 广场开放区域应属于 中央广场
    plaza_tile = maze.tiles[19][29]
    ok &= check(plaza_tile["arena"] == "中央广场",
                f"tile(29,19) arena={plaza_tile['arena']}（期望 中央广场）")

    # 3) 碰撞块
    coll = maze.tiles[15][29]
    ok &= check(coll["collision"] is True,
                f"政府楼 tile(29,15) collision={coll['collision']}（期望 True）")
    walk = maze.tiles[19][29]
    ok &= check(walk["collision"] is False,
                f"广场 tile(29,19) collision={walk['collision']}（期望 False）")

    # 4) 寻路：广场区域 → 城市西侧 (10,20)，应找到路径且无碰撞
    start = (18, 20)
    goal = (10, 20)
    path = path_finder(maze.collision_maze, start, goal, collision_block_id)
    ok &= check(path is not None, f"寻路 {start}→{goal} 找到路径")
    if path:
        collision_on_path = any(
            maze.tiles[y][x]["collision"] for (x, y) in path
        )
        ok &= check(not collision_on_path,
                    f"路径 {len(path)} 步，无碰撞块")

    # 5) Persona 装载（fork 到临时 sim，不污染基类）
    tmp_fork = "verify_maze_tmp_fork"
    sim_code = "verify_maze_tmp"
    shutil.rmtree(f"{fs_storage}/{tmp_fork}", ignore_errors=True)
    shutil.rmtree(f"{fs_storage}/{sim_code}", ignore_errors=True)
    try:
        # base 环境 0.json 的 persona 坐标是旧 double studio 的（越界 60x34），
        # 在临时 fork 中修正为中央广场可走 tile。
        shutil.copytree(f"{fs_storage}/base_the_ville_isabella_maria_klaus",
                        f"{fs_storage}/{tmp_fork}")
        env_f = f"{fs_storage}/{tmp_fork}/environment/0.json"
        env = json.load(open(env_f))
        env["Isabella Rodriguez"]["x"], env["Isabella Rodriguez"]["y"] = 29, 19
        env["Klaus Mueller"]["x"], env["Klaus Mueller"]["y"] = 28, 19
        env["Maria Lopez"]["x"], env["Maria Lopez"]["y"] = 30, 19
        json.dump(env, open(env_f, "w"))

        server = ReverieServer(tmp_fork, sim_code)
        ok &= check(len(server.personas) >= 3,
                    f"personas 装载 {len(server.personas)} 个")
        isa = server.personas["Isabella Rodriguez"]
        ok &= check(isa.scratch.living_area == "星河市:市民广场:中央广场:长椅",
                    f"Isabella living_area={isa.scratch.living_area}")
        ok &= check("星河市" in isa.s_mem.tree.keys(),
                    f"Isabella 空间记忆顶层={list(isa.s_mem.tree.keys())}")
    except Exception as e:
        ok &= check(False, f"ReverieServer 装载异常: {e}")
    finally:
        for d in (f"{fs_storage}/{tmp_fork}", f"{fs_storage}/{sim_code}"):
            shutil.rmtree(d, ignore_errors=True)

    print("=== 总评:", "ALL PASS" if ok else "HAS FAILURES", "===")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
