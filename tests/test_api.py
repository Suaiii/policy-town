import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import policytown.api as api_module
from policytown.api import app
from policytown.investment import InvestmentEngine


class TestInvestmentApi(unittest.TestCase):
    def setUp(self):
        api_module._ENGINE = InvestmentEngine(use_agent_api=False)
        self.client = TestClient(app)

    def test_create_settle_and_resume(self):
        created = self.client.post("/api/runs", json={"seed": 20260813})
        self.assertEqual(created.status_code, 201)
        stage = created.json()
        self.assertEqual(stage["stage_id"], "S1")
        self.assertEqual(len(stage["companies"]), 2)

        allocations = [
            {"company_id": company["company_id"], "capital_points": 40 if index == 0 else 0}
            for index, company in enumerate(stage["companies"])
        ]
        settled = self.client.post(
            f"/api/runs/{stage['run_id']}/settle",
            json={
                "stage_id": "S1",
                "idempotency_key": "test-api-idempotency",
                "allocations": allocations,
            },
        )
        self.assertEqual(settled.status_code, 200)
        result = settled.json()
        self.assertEqual(result["budget"]["before"] - result["budget"]["spent"], result["budget"]["after"])
        self.assertEqual(len(result["company_actions"]), 2)

        repeated = self.client.post(
            f"/api/runs/{stage['run_id']}/settle",
            json={
                "stage_id": "S1",
                "idempotency_key": "test-api-idempotency",
                "allocations": allocations,
            },
        )
        self.assertEqual(repeated.status_code, 200)
        self.assertEqual(repeated.json(), result)

        resumed = self.client.get(f"/api/runs/{stage['run_id']}")
        self.assertEqual(resumed.status_code, 200)
        self.assertEqual(resumed.json()["stage_id"], "S2")

    def test_requires_every_active_company(self):
        stage = self.client.post("/api/runs", json={"seed": 99}).json()
        response = self.client.post(
            f"/api/runs/{stage['run_id']}/settle",
            json={
                "stage_id": "S1",
                "idempotency_key": "test-missing-company",
                "allocations": [{"company_id": stage["companies"][0]["company_id"], "capital_points": 20}],
            },
        )
        self.assertEqual(response.status_code, 422)

    def test_deliberation_exposes_department_pages_and_compiled_packages(self):
        stage = self.client.post("/api/runs", json={"seed": 7}).json()
        company_id = stage["companies"][0]["company_id"]
        response = self.client.get(
            f"/api/runs/{stage['run_id']}/stages/S1/companies/{company_id}/deliberation"
        )
        self.assertEqual(response.status_code, 200)
        deliberation = response.json()
        self.assertEqual(len(deliberation["department_memos"]), 4)
        for memo in deliberation["department_memos"]:
            self.assertGreaterEqual(len(memo["key_page"]), 12)
            self.assertGreaterEqual(len(memo["independent_view"]), 60)
        proposals = deliberation["meeting"]["proposals"]
        self.assertEqual([item["label"] for item in proposals], ["稳健方案", "进取方案"])
        self.assertTrue(all(item["compiler_version"] == "policy-package-compiler-v1" for item in proposals))
        self.assertTrue(all(item["compile_basis"] for item in proposals))
        self.assertTrue(all(
            item["capital_points"] == item["package_parameters"]["funding_points"]
            for item in proposals
        ))

    def test_player_selects_proposal_id_only(self):
        stage = self.client.post("/api/runs", json={"seed": 8}).json()
        company_id = stage["companies"][0]["company_id"]
        preview = self.client.get(
            f"/api/runs/{stage['run_id']}/stages/S1/companies/{company_id}/deliberation"
        ).json()
        proposal = preview["meeting"]["proposals"][0]
        response = self.client.post(
            f"/api/runs/{stage['run_id']}/select-proposal",
            json={
                "stage_id": "S1",
                "company_id": company_id,
                "proposal_id": proposal["proposal_id"],
                "idempotency_key": "select-proposal-test",
            },
        )
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result["budget"]["spent"], proposal["capital_points"])
        selected = next(item for item in result["deliberations"] if item["company_id"] == company_id)
        self.assertEqual(selected["selected_proposal_id"], proposal["proposal_id"])
        self.assertEqual(4, len(result["settlement_trace"]))
        self.assertEqual("proposal_validation", result["settlement_trace"][0]["step"])
        self.assertTrue(result["comparison_available_at"].endswith("/compare-proposals"))

    def test_select_proposal_uses_the_previously_live_llm_preview_cache(self):
        stage = self.client.post("/api/runs", json={"seed": 18}).json()
        company_id = stage["companies"][0]["company_id"]
        preview = self.client.get(
            f"/api/runs/{stage['run_id']}/stages/S1/companies/{company_id}/deliberation"
        ).json()
        proposal = preview["meeting"]["proposals"][0]

        with patch.object(
            api_module._ENGINE,
            "preview_deliberation",
            side_effect=AssertionError("select must use the cached live preview"),
        ):
            response = self.client.post(
                f"/api/runs/{stage['run_id']}/select-proposal",
                json={
                    "stage_id": "S1",
                    "company_id": company_id,
                    "proposal_id": proposal["proposal_id"],
                    "idempotency_key": "select-cached-preview",
                },
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["budget"]["spent"], proposal["capital_points"])

    def test_select_proposal_never_regenerates_a_cached_deliberation_during_settlement(self):
        stage = self.client.post("/api/runs", json={"seed": 28}).json()
        company_id = stage["companies"][0]["company_id"]
        preview = self.client.get(
            f"/api/runs/{stage['run_id']}/stages/S1/companies/{company_id}/deliberation"
        ).json()
        proposal = preview["meeting"]["proposals"][0]

        import policytown.investment.engine as engine_module
        real_deliberate = engine_module.deliberate

        def reject_selected_company_regeneration(company, *args, **kwargs):
            if company.company_id == company_id:
                raise AssertionError("settlement must use the player-visible cached deliberation")
            return real_deliberate(company, *args, **kwargs)

        with patch(
            "policytown.investment.engine.deliberate",
            side_effect=reject_selected_company_regeneration,
        ):
            response = self.client.post(
                f"/api/runs/{stage['run_id']}/select-proposal",
                json={
                    "stage_id": "S1",
                    "company_id": company_id,
                    "proposal_id": proposal["proposal_id"],
                    "idempotency_key": "select-no-regeneration",
                },
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["budget"]["spent"], proposal["capital_points"])

    def test_two_policy_packages_form_a_controlled_ablation(self):
        stage = self.client.post("/api/runs", json={"seed": 9}).json()
        company_id = stage["companies"][0]["company_id"]
        preview = self.client.get(
            f"/api/runs/{stage['run_id']}/stages/S1/companies/{company_id}/deliberation"
        ).json()
        proposal_ids = [item["proposal_id"] for item in preview["meeting"]["proposals"]]
        response = self.client.post(
            f"/api/runs/{stage['run_id']}/compare-proposals",
            json={
                "stage_id": "S1",
                "company_id": company_id,
                "proposal_ids": proposal_ids,
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        comparison = response.json()
        self.assertEqual("proposal_id", comparison["independent_variable"])
        self.assertEqual(2, len(comparison["branches"]))
        self.assertEqual(proposal_ids, [item["proposal_id"] for item in comparison["branches"]])
        self.assertNotEqual(
            comparison["branches"][0]["company_state"],
            comparison["branches"][1]["company_state"],
        )
        self.assertNotEqual(
            comparison["branches"][0]["budget_after"],
            comparison["branches"][1]["budget_after"],
        )
        # Comparing branches must not settle or advance the player's real run.
        resumed = self.client.get(f"/api/runs/{stage['run_id']}").json()
        self.assertEqual("S1", resumed["stage_id"])

    def test_historical_replay_stays_sealed_before_four_stages(self):
        stage = self.client.post("/api/runs", json={"seed": 10}).json()
        response = self.client.get(f"/api/runs/{stage['run_id']}/historical-replay")
        self.assertEqual(response.status_code, 409)
