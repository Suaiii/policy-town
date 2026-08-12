"""政策库：7 条有现实出处的城市人才政策。"""

ALL_SEGMENTS = ["A型", "B型", "C型", "D型"]

POLICY_LIBRARY = {
    "housing_subsidy": {
        "name": "人才安居购房补贴",
        "type": "talent_cash",
        "source": "杭州/深圳人才安居政策",
        "target_segments": ["A型", "B型", "C型"],
        "params": {"amount_wan": 30, "duration_months": 12},
        "description": "对人才购房提供一次性安居补贴，缓解房价压力。",
    },
    "relocation_subsidy": {
        "name": "应届生一次性生活补贴",
        "type": "talent_cash",
        "source": "上海/成都应届生补助政策",
        "target_segments": ALL_SEGMENTS,
        "params": {"amount_wan": 1.5, "duration_months": 1, "fresh_only": True},
        "description": "应届毕业生落户后发放一次性生活补贴。",
    },
    "shortage_reward": {
        "name": "紧缺人才目录奖励",
        "type": "talent_cash",
        "source": "苏州紧缺人才薪酬补贴",
        "target_segments": ["A型", "B型"],
        "params": {"amount_wan": 5, "duration_months": 12, "annual_decay": 0.8},
        "description": "对紧缺目录内人才给予年度薪酬补贴，逐年递减。",
    },
    "hukou_relax": {
        "name": "落户政策放宽",
        "type": "regulation",
        "source": "深圳/杭州零门槛落户、上海应届硕博直接落户",
        "target_segments": ["A型", "B型", "C型"],
        "params": {"edu_threshold": "本科", "shortage_exempt": True},
        "description": "降低落户门槛，紧缺人才与本科以上学历直接落户。",
    },
    "ai_talent_special": {
        "name": "AI人才专项补贴",
        "type": "talent_cash",
        "source": "上海AI规划/北京智源",
        "target_segments": ["A型", "B型"],
        "params": {"amount_wan": 10, "duration_months": 24, "employer_match": 0.5},
        "description": "AI 专项人才补贴，企业按比例配套。",
    },
    "layoff_control": {
        "name": "稳就业裁员管制",
        "type": "regulation",
        "source": "劳动合同法/稳岗补贴",
        "target_segments": ALL_SEGMENTS,
        "params": {"layoff_threshold": 20, "compensation": "N+1", "enforcement": 0.6},
        "description": "规模裁员需报备并支付补偿，配套稳岗补贴。",
    },
    "hiring_subsidy": {
        "name": "企业吸纳就业补贴",
        "type": "firm_cash",
        "source": "国办扩岗补助政策",
        "target_segments": ["B型", "D型"],
        "params": {"amount_wan_per_head": 0.5, "duration_months": 6},
        "description": "企业吸纳重点群体就业，按人头给予扩岗补助。",
    },
}

def activate(policy_id, months_left=None):
    """把政策库条目转换为引擎消费形状（type/target_segments 并入 params）。

    返回 {"months_left": int, "params": {...}}（settle_month 消费的形状）。
    months_left 缺省取 params.duration_months。
    """
    entry = POLICY_LIBRARY[policy_id]
    params = dict(entry["params"])
    params["type"] = entry["type"]
    params["target_segments"] = list(entry["target_segments"])
    months = months_left if months_left is not None else params.get("duration_months", 12)
    return {"months_left": months, "params": params}


def get_policy(policy_id):
    """按 id 取政策；不存在返回 None。"""
    return POLICY_LIBRARY.get(policy_id)
