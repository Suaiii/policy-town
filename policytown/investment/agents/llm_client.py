"""OpenCode Go（OpenAI 兼容）客户端 — 真实 LLM 的 llm_fn 注入源。

- 端点：https://opencode.ai/zen/go/v1/chat/completions
- 密钥优先级：环境变量 OPENCODE_GO_API_KEY > policytown/investment/.secrets.json（gitignored）
- 缓存：.cache/llm_cache.json，同一 prompt 幂等（配合固定 seed，重复运行输出一致）
- 失败：抛异常 → BaseAgent 自动重试 → fallback（断网也能走完整演示）
"""
from __future__ import annotations

import hashlib
import json
import os
import time
import urllib.request
from typing import Callable, Dict, Optional, Union

BASE_URL = "https://opencode.ai/zen/go/v1"
DEFAULT_MODEL = "deepseek-v4-flash"  # 网关模型 ID 不带 opencode-go/ 前缀
_HERE = os.path.dirname(os.path.abspath(__file__))


def load_api_key() -> str:
    key = os.environ.get("OPENCODE_GO_API_KEY", "").strip()
    if key:
        return key
    secrets_path = os.path.abspath(os.path.join(_HERE, "..", ".secrets.json"))
    if os.path.exists(secrets_path):
        data = json.load(open(secrets_path, encoding="utf-8"))
        key = (data.get("api_key") or data.get("OPENCODE_GO_API_KEY") or "").strip()
    if not key:
        raise RuntimeError("缺少 API key：设置环境变量 OPENCODE_GO_API_KEY，"
                           "或写入 policytown/investment/.secrets.json（gitignored）")
    return key


def make_llm_fn(model: str = DEFAULT_MODEL, temperature: float = 0.2,
                timeout: int = 90, max_retries: int = 1,
                use_cache: bool = True, progress: bool = False,
                reasoning_effort: str = "low",
                trace_log: Optional[list] = None) -> Callable[[str], dict]:
    """返回 llm_fn(prompt: str) -> dict。

    参数校验：返回的 dict 必须包含该 Agent 的必需键（BaseAgent.validate 负责）。
    progress=True 时每次调用打印一个 '.'（长任务进度可见）。
    reasoning_effort=low：大幅缩短推理模型的思考时间（实测 69s → 7s）。
    trace_log：传入 list 时，每次调用（含缓存命中与失败）追加一条轨迹记录。
    """
    api_key = load_api_key()
    memo: Dict[str, dict] = {}
    cache_path = os.path.abspath(os.path.join(_HERE, "..", ".cache", "llm_cache.json"))
    if use_cache and os.path.exists(cache_path):
        try:
            memo = json.load(open(cache_path, encoding="utf-8"))
        except Exception:
            memo = {}

    def _chat(payload: dict) -> dict:
        req = urllib.request.Request(
            BASE_URL + "/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json",
                     "Authorization": "Bearer " + api_key,
                     "User-Agent": "investment-simulation/0.1"},  # 网关拒绝 Python-urllib 默认 UA
            method="POST")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def llm_fn(prompt: str, validator: Optional[Callable[[dict], None]] = None) -> dict:
        """validator 通过才缓存：失败输出永不落盘，重试不会拿到同一个坏结果。"""
        t_start = time.time()
        h = hashlib.md5((model + "|" + prompt).encode("utf-8")).hexdigest()
        if h in memo and _passes(memo[h], validator):
            if progress:
                print(".", end="", flush=True)
            if trace_log is not None:
                trace_log.append(_trace_entry(t_start, prompt, memo[h], "cache",
                                              error=None))
            return memo[h]

        messages = [
            {"role": "system", "content":
             "你是产业投资推演系统的推理内核。只能输出一个 JSON 对象，"
             "禁止输出任何其他文字、禁止使用 markdown 代码块。"},
            {"role": "user", "content": prompt},
        ]
        last_err: Optional[Exception] = None
        attempts = 0
        for use_json_mode in (True, False):
            for use_effort in (True, False):
                payload: Dict = {"model": model, "messages": messages,
                                 "temperature": temperature, "max_tokens": 1600}
                if use_json_mode:
                    payload["response_format"] = {"type": "json_object"}
                if use_effort:
                    payload["reasoning_effort"] = reasoning_effort
                for _ in range(max_retries + 1):
                    attempts += 1
                    try:
                        data = _chat(payload)
                        content = data["choices"][0]["message"]["content"]
                        obj = _parse_json(content)
                        if obj is not None and _passes(obj, validator):
                            memo[h] = obj
                            if use_cache:
                                _save_cache(cache_path, memo)
                            if progress:
                                print(".", end="", flush=True)
                            if trace_log is not None:
                                trace_log.append(_trace_entry(t_start, prompt, obj,
                                                              "llm", error=None,
                                                              attempts=attempts))
                            return obj
                    except Exception as e:  # noqa: BLE001
                        last_err = e
                        time.sleep(1.0)
        if trace_log is not None:
            trace_log.append(_trace_entry(t_start, prompt, None, "llm",
                                          error=last_err, attempts=attempts))
        raise RuntimeError("LLM 调用失败: %s" % last_err)

    return llm_fn


def _trace_entry(t_start: float, prompt: str, output: Optional[dict],
                 source: str, error: Optional[Exception] = None,
                 attempts: int = 1) -> dict:
    return {
        "t": round(time.time() - t_start, 2),
        "prompt": prompt,
        "prompt_chars": len(prompt),
        "output": output,
        "source": source,          # llm | cache
        "attempts": attempts,
        "error": str(error)[:300] if error else None,
    }


def _passes(obj: dict, validator: Optional[Callable[[dict], None]]) -> bool:
    """validator 为 None 时恒通过；否则按校验结果（validate 会就地规范化）。"""
    if validator is None:
        return True
    try:
        validator(obj)
        return True
    except Exception:
        return False


def _parse_json(text: str) -> Optional[dict]:
    t = text.strip()
    if t.startswith("```"):
        t = t.strip("`")
        if t.startswith("json"):
            t = t[4:]
    start, end = t.find("{"), t.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        obj = json.loads(t[start:end + 1])
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        return None


def _save_cache(path: str, memo: Dict[str, dict]) -> None:
    """合并写：先读磁盘现状再合并，防止多进程互相覆盖（每个进程的内存快照不同）。"""
    disk: Dict[str, dict] = {}
    if os.path.exists(path):
        try:
            disk = json.load(open(path, encoding="utf-8"))
        except Exception:
            disk = {}
    disk.update(memo)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(disk, f, ensure_ascii=False)
    os.replace(tmp, path)
