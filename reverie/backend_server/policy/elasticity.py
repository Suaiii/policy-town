"""弹性系数表：政策 → (人群 × 指标) 的影响系数。可随时人工校准。"""
import json
import os

_TABLE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           "elasticity_table.json")


class ElasticityTable:
    def __init__(self, path=None):
        with open(path or _TABLE_PATH) as f:
            self.table = json.load(f)

    def effect(self, policy_id, segment, metric):
        """返回政策对某人群某指标的弹性系数；缺省返回 0（安全默认）"""
        return self.table.get(policy_id, {}).get(metric, {}).get(segment, 0.0)

    def all_effects(self, policy_id):
        return self.table.get(policy_id, {})


def load_table():
    return ElasticityTable()
