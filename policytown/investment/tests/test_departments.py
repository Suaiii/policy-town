"""四部门契约测试（产品文档 4.4 / 5.1）。

部门固定为：财政 fiscal / 经信 economy / 科技 sci_tech / 发改 development。
"""
from __future__ import annotations

import unittest

from ..agents.professional import KINDS, _ROLE_NAMES


class TestDepartmentIdentity(unittest.TestCase):
    def test_four_departments_named(self):
        self.assertEqual(KINDS, ("fiscal", "economy", "sci_tech", "development"))
        self.assertEqual(set(_ROLE_NAMES), set(KINDS))
        self.assertIn("财政", _ROLE_NAMES["fiscal"])
        self.assertIn("经信", _ROLE_NAMES["economy"])
        self.assertIn("科技", _ROLE_NAMES["sci_tech"])
        self.assertIn("发改", _ROLE_NAMES["development"])


if __name__ == "__main__":
    unittest.main()
