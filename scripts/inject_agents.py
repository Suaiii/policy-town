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


def gen_scratch(p):
    name = p["name"]
    words = name.split()
    first_name = words[0]
    last_name = " ".join(words[1:]) if len(words) > 1 else ""
    employer = p.get("employer") or "待业"
    return {
        "vision_r": 8,
        "att_bandwidth": 8,
        "retention": 8,
        "curr_time": None,
        "curr_tile": None,
        "daily_plan_req": p["daily_plan_req"],
        "name": name,
        "first_name": first_name,
        "last_name": last_name,
        "age": p["age"],
        "innate": p["innate"],
        "learned": p["learned"],
        "currently": f"{name} 正在 {employer} 工作/生活。",
        "lifestyle": p["lifestyle"],
        "living_area": p.get("living_area", "星河市:市民广场:中央广场:长椅"),
        "concept_forget": 100,
        "daily_reflection_time": 180,
        "daily_reflection_size": 5,
        "overlap_reflect_th": 4,
        "kw_strg_event_reflect_th": 10,
        "kw_strg_thought_reflect_th": 9,
        "recency_w": 1,
        "relevance_w": 1,
        "importance_w": 1,
        "recency_decay": 0.995,
        "importance_trigger_max": 150,
        "importance_trigger_curr": 150,
        "importance_ele_n": 0,
        "thought_count": 5,
        "daily_req": [],
        "f_daily_schedule": [],
        "f_daily_schedule_hourly_org": [],
        "act_address": None,
        "act_start_time": None,
        "act_duration": None,
        "act_description": None,
        "act_pronunciatio": None,
        "act_event": None,
        "act_obj_description": None,
        "act_obj_pronunciatio": None,
        "act_obj_event": None,
        "chatting_with": None,
        "chat": None,
        "chatting_with_buffer": None,
        "chatting_end_time": None,
        "act_path_set": False,
        "planned_path": [],
        "segment": p["segment"],
        "education_tier": p["education_tier"],
        "major_type": p["major_type"],
        "employer": p.get("employer"),
        "salary": p["salary"],
        "savings_months": p["savings_months"],
        "risk_aversion": p["risk_aversion"],
        "family_tie": p["family_tie"],
        "job_searching": p.get("job_searching", False),
        "offer": None,
    }


def _embedding(name, i, seed):
    out = []
    for j in range(128):
        h = hashlib.sha256(f"{seed+i}:{j}".encode()).digest()
        v = (h[j % 32] + h[(j * 7 + 3) % 32]) / 512.0
        out.append(round(v, 6))
    return out


def gen_memory_files(p, seed=0):
    name = p["name"]
    memories = p.get("initial_memories") or []
    nodes = {}
    embeddings = {}
    kw_events = {}
    for i, desc in enumerate(memories, start=1):
        key = f"{name}_{i}"
        embeddings[key] = _embedding(name, i, seed)
        nodes[f"node_{i}"] = {
            "node_count": i,
            "type_count": i,
            "type": "event",
            "depth": 0,
            "created": "2026-01-01 00:00:00",
            "expiration": None,
            "subject": name,
            "predicate": "记得",
            "object": desc,
            "description": f"{name} 记得：{desc}",
            "embedding_key": key,
            "poignancy": 5,
            "keywords": [desc[:4]],
            "filling": None,
        }
        kw_events[desc[:4]] = kw_events.get(desc[:4], 0) + 1
    kw_strength = {
        "kw_strength_event": kw_events,
        "kw_strength_thought": {},
    }
    return nodes, embeddings, kw_strength


def _write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def inject_persona(p, sim, idx):
    nodes, embeddings, kw = gen_memory_files(p)
    pdir = os.path.join(sim, "personas", p["name"], "bootstrap_memory")
    _write_json(os.path.join(pdir, "scratch.json"), gen_scratch(p))
    _write_json(os.path.join(pdir, "spatial_memory.json"), {"星河市": TREE})
    _write_json(os.path.join(pdir, "associative_memory", "nodes.json"), nodes)
    _write_json(os.path.join(pdir, "associative_memory", "embeddings.json"), embeddings)
    _write_json(os.path.join(pdir, "associative_memory", "kw_strength.json"), kw)


def inject_all(personas, firms, sim, start_step=0):
    firm_names = {f["name"] for f in firms}
    for p in personas:
        if p.get("employer") is not None and p["employer"] not in firm_names:
            raise ValueError(f"persona {p['name']} 的 employer '{p['employer']}' 不在 firms 中")

    for idx, p in enumerate(personas):
        inject_persona(p, sim, idx)

    meta_path = os.path.join(sim, "reverie", "meta.json")
    meta = json.load(open(meta_path, encoding="utf-8"))
    names = meta.setdefault("persona_names", [])
    for p in personas:
        if p["name"] not in names:
            names.append(p["name"])
    _write_json(meta_path, meta)

    env_path = os.path.join(sim, "environment", f"{start_step}.json")
    env = json.load(open(env_path, encoding="utf-8"))
    for idx, p in enumerate(personas):
        x, y = SPAWN_POOL[(start_step + idx) % len(SPAWN_POOL)]
        env[p["name"]] = {"x": x, "y": y}
    _write_json(env_path, env)

    st_path = os.path.join(sim, "policy", "state.json")
    st = json.load(open(st_path, encoding="utf-8"))
    st_profiles = st.setdefault("profiles", [])
    for p in personas:
        st_profiles.append({
            "name": p["name"],
            "segment": p["segment"],
            "employer": p.get("employer"),
            "salary": p["salary"],
            "savings_months": p["savings_months"],
            "risk_aversion": p["risk_aversion"],
            "family_tie": p["family_tie"],
            "job_searching": p.get("job_searching", False),
            "offer": None,
        })
    st_firms = st.setdefault("firms", [])
    for f in firms:
        entry = {
            "firm": f["name"],
            "stage": f.get("stage"),
            "headcount": {},
            "salary_level": f.get("salary_level", {}),
            "profit": f.get("profit", 0),
            "labor_cost": f.get("labor_cost", 0),
            "skills_needed": f.get("skills_needed", {}),
            "layoff_risk": f.get("layoff_risk", 0.0),
            "recruiting": f.get("recruiting", 0),
            "expected_future_firing_cost": 0.0,
        }
        existing = next((e for e in st_firms if e["firm"] == entry["firm"]), None)
        if existing:
            existing.update(entry)
        else:
            st_firms.append(entry)
    _write_json(st_path, st)
    return {"personas": len(personas), "firms": len(firms)}
