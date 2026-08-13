# Stable Policy Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure a policy package shown to a player always settles using that same persisted LLM deliberation snapshot.

**Architecture:** The API parses the complete cached deliberation object and passes it to the stage engine as an override for the selected company. The engine skips its second `deliberate` call for that company while retaining the normal deterministic settlement rules.

**Tech Stack:** FastAPI, Pydantic, Python unittest.

---

### Task 1: Lock the production symptom with an API test

**Files:**
- Modify: `tests/test_api.py`

- [ ] **Step 1: Write the failing test**

```python
def test_select_proposal_settles_the_exact_cached_deliberation(self):
    # Cache a preview, then make a fresh engine deliberation disagree on amount.
    # POST select-proposal must still settle the cached amount with HTTP 200.
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_api.TestInvestmentApi.test_select_proposal_settles_the_exact_cached_deliberation -v`

Expected: FAIL because selection invokes a fresh deliberation path or rejects the cached amount.

### Task 2: Pass the snapshot into settlement

**Files:**
- Modify: `policytown/api.py`
- Modify: `policytown/investment/engine.py`
- Test: `tests/test_api.py`

- [ ] **Step 1: Add a parsed cached-deliberation helper**

```python
def _cached_deliberation(...):
    payload = _load_cached_deliberation(...)
    return Deliberation.model_validate(payload) if payload else None
```

- [ ] **Step 2: Extend `InvestmentEngine.run_stage` with an optional company-ID to deliberation override map**

```python
cached = deliberation_overrides.get(company.company_id)
if cached is not None:
    deliberation = cached
else:
    deliberation, ... = deliberate(...)
```

- [ ] **Step 3: Provide the cached selected-company snapshot from `select_proposal`**

```python
result = engine.run_stage(..., deliberation_overrides={request.company_id: cached})
```

- [ ] **Step 4: Run the regression test and API test module**

Run: `python -m unittest tests.test_api -v`

Expected: PASS; selection spends the cached proposal amount and never regenerates its deliberation.

### Task 3: Deploy and smoke-test

**Files:**
- Deploy changed backend source to `/opt/hefei-industrial-sandbox` on `43.138.247.131`

- [ ] **Step 1: Compile and run focused tests**

Run: `python -m compileall -q policytown && python -m unittest tests.test_api -v`

- [ ] **Step 2: Sync the backend and restart `hefei-investment.service`**

Run: `rsync -az -e "ssh -i ~/Downloads/codex.pem" policytown/ root@43.138.247.131:/opt/hefei-industrial-sandbox/policytown/ && ssh -i ~/Downloads/codex.pem root@43.138.247.131 "systemctl restart hefei-investment.service"`

- [ ] **Step 3: Verify health and repeat the API selection flow**

Run: `ssh -i ~/Downloads/codex.pem root@43.138.247.131 "curl -fsS http://127.0.0.1:8000/api/health"`

Expected: health JSON reports `status: ok` and the newly created run completes policy selection without amount-mismatch error.
