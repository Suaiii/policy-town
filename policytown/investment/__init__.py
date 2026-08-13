"""合肥产业投资推演系统 — InvestmentSimulation v0.1

架构：A 引擎（黑板模式：共享 State + 收件箱 + 规则引擎）+ B 图投影（只读视图）。
契约冻结于 contracts/（context / agent_output / message / graph_view）。
"""
