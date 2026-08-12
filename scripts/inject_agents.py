#!/usr/bin/env python3
"""P0 Agent 设定注入管线：解析 agents/*.yaml -> 校验 -> 生成 persona 三件套并写入模拟。
"""
import hashlib
import json
import os
import re
import sys

try:
    import yaml
except ImportError:
    sys.exit("PyYAML 未安装，请运行: pip install pyyaml")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AGENTS_DIR = os.path.join(REPO_ROOT, "agents")
PERSONAS_DIR = os.path.join(AGENTS_DIR, "personas")
FIRMS_FILE = os.path.join(AGENTS_DIR, "firms.yaml")
SIM_ROOT = os.path.join(REPO_ROOT, "environment", "frontend_server", "static_dirs", "assets", "the_ville")
SIM_CODE = os.path.join(REPO_ROOT, "reverie", "backend_server")
SIM_DIR = os.path.join(SIM_ROOT, "simulated_agent_series")

try:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from convert_spatial_memory import TREE
except ImportError:
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

SEGMENT_MAP = {
    ("名校", "紧缺"): "A型",
    ("普通", "紧缺"): "B型",
    ("名校", "一般"): "C型",
    ("普通", "一般"): "D型",
}

REQUIRED = [
    "name", "age", "education_tier", "major_type", "innate", "learned",
    "lifestyle", "daily_plan_req", "employer", "salary", "savings_months",
    "risk_aversion", "family_tie",
]

SPAWN_POOL = [
    (18, 20), (20, 20), (22, 21), (24, 21), (26, 21), (28, 21), (30, 21),
    (32, 21), (34, 21), (36, 21), (39, 21), (40, 21),
    (18, 23), (20, 23), (22, 23), (24, 23), (26, 23), (28, 23), (30, 23),
    (32, 23), (34, 23), (36, 23), (38, 23), (40, 23),
    (28, 19), (30, 19), (32, 19), (35, 18),
]


def derive_segment(education_tier, major_type):
    return SEGMENT_MAP[(education_tier, major_type)]


def validate_persona(p):
    missing = [f for f in REQUIRED if f not in p or p[f] is None]
    if missing:
        raise ValueError(f"persona 缺少必填字段: {missing}")
    if p["education_tier"] not in ("名校", "普通"):
        raise ValueError(f"education_tier 必须为 名校/普通，实际: {p['education_tier']}")
    if p["major_type"] not in ("紧缺", "一般"):
        raise ValueError(f"major_type 必须为 紧缺/一般，实际: {p['major_type']}")
    p["segment"] = derive_segment(p["education_tier"], p["major_type"])
    return p


def parse_persona(text):
    data = yaml.safe_load(text) or {}
    return validate_persona(data)


def load_firms(path=FIRMS_FILE):
    if not os.path.exists(path):
        raise FileNotFoundError(f"firms 文件不存在: {path}")
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return data.get("firms", [])


def load_personas(directory=PERSONAS_DIR):
    if not os.path.isdir(directory):
        return []
    out = []
    for fn in sorted(os.listdir(directory)):
        if not fn.endswith((".yaml", ".yml")):
            continue
        with open(os.path.join(directory, fn), encoding="utf-8") as f:
            out.append(parse_persona(f.read()))
    return out
