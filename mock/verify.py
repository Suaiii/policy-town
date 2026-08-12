import json, glob, collections
def load(r): return [json.load(open(f"data/run_{r}/round_{i}.json",encoding="utf-8")) for i in range(1,9)]
A,B=load("A"),load("B")
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
