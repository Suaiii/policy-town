import json, glob, collections, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from contracts.schema import Snapshot
def load(r): return [json.load(open(f"data/run_{r}/round_{i}.json",encoding="utf-8")) for i in range(1,9)]
A,B=load("A"),load("B")
for snapshot in A + B:
    parsed = Snapshot(**snapshot)
    assert parsed.contract_version == "1.2"
    assert sum(worker.cohort_weight for worker in parsed.workers) == 8500
assert sum(1 for s in B for f in s["firms"] for batch in f["layoff_batches"] if batch == 19) >= 10
assert not any(sum(1 for f in s["firms"] for batch in f["layoff_batches"] if batch == 19) >= 4 for s in A)
assert [s["firms"][1]["hiring_campus"] + s["firms"][1]["hiring_social"] for s in B][1:] == [95, 86, 60, 46, 42, 41, 43]
market_c = [f for f in B[5]["flows"] if f["from"] == "market" and f["to"] == "C"]
assert sum(f["count"] for f in market_c if f["skill"] == "ai") == 12
assert sum(f["count"] for f in market_c if f["skill"] == "traditional") <= 2
print("=== ① 裁员批次直方图（尖峰应卡在 19）===")
for r,S in (("A",A),("B",B)):
    c=collections.Counter(b for s in S for f in s["firms"] for b in f["layoff_batches"])
    print(f" run_{r}:", " ".join(f"{k}人×{v}" for k,v in sorted(c.items())))
print("\n=== ② B厂招聘（校招+社招）===")
print(" run_A:", [s["firms"][1]["hiring_campus"]+s["firms"][1]["hiring_social"] for s in A])
print(" run_B:", [s["firms"][1]["hiring_campus"]+s["firms"][1]["hiring_social"] for s in B])
print(" B厂 expected_future_firing_cost:", [s["firms"][1]["expected_future_firing_cost"] for s in B])
print("\n=== ③ 关键指标 A vs B（R8）===")
h=["employment_total","formal_layoff","outsource_share","unemployment_rate","hidden_unemployment","skill_mismatch_gap"]
for k in h: print(f" {k:22} A={A[-1]['metrics'][k]:<10} B={B[-1]['metrics'][k]}")
print("\n 人社KPI  A:",[s["metrics"]["kpi"]["人社"] for s in A])
print(" 人社KPI  B:",[s["metrics"]["kpi"]["人社"] for s in B])
print(" 产业KPI  B:",[s["metrics"]["kpi"]["产业"] for s in B])
print(" 财政KPI  B:",[s["metrics"]["kpi"]["财政"] for s in B])
print("\n 总就业 A:",[s["metrics"]["employment_total"] for s in A])
print(" 总就业 B:",[s["metrics"]["employment_total"] for s in B])
print(" 隐性失业 B:",[s["metrics"]["hidden_unemployment"] for s in B])
