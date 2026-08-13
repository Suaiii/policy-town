"""合肥产业投资推演系统内核。

该包与前端和具体 LLM 提供方解耦。推演入口集中在 :mod:`policytown.investment`：
确定性引擎结算财政点数与企业状态，真实数据经 ``information_available_date``
截止过滤后进入 Context，Historical Replay 仅用于后台盲测校准。
"""

from .investment import (
    HefeiContextBuilder,
    HefeiMvpLoader,
    HefeiRealDataRepository,
    InvestmentEngine,
)

__all__ = [
    "HefeiContextBuilder",
    "HefeiMvpLoader",
    "HefeiRealDataRepository",
    "InvestmentEngine",
]
