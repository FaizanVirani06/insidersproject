from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

import requests


@dataclass
class GeminiError(Exception):
    message: str


def generate_content(
    api_key: str,
    base_url: str,
    model: str,
    prompt: str,
    temperature: float = 0.2,
    max_output_tokens: int = 2048,
    retries: int = 3,
    timeout_seconds: int = 60,
) -> str:
    """Call Gemini generateContent with responseMimeType=application/json.

    Returns the model text (which should be JSON, but callers should still guard against
    code fences or stray prose).
    """
    if not api_key:
        raise GeminiError("Missing API key")
    if not base_url:
        raise GeminiError("Missing base_url")
    if not model:
        raise GeminiError("Missing model")
    if not prompt:
        raise GeminiError("Missing prompt")

    base = base_url.rstrip("/")
    if base.endswith("/v1beta"):
        url = f"{base}/models/{model}:generateContent?key={api_key}"
    else:
        url = f"{base}/v1beta/models/{model}:generateContent?key={api_key}"

    payload: Dict[str, Any] = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
        "generationConfig": {
            "temperature": float(temperature),
            "maxOutputTokens": int(max_output_tokens),
            "responseMimeType": "application/json",
        },
    }

    last_err: Optional[str] = None
    for attempt in range(retries):
        try:
            r = requests.post(url, json=payload, timeout=timeout_seconds)
            if r.status_code != 200:
                last_err = f"HTTP {r.status_code}: {r.text}"
                # Retry on 5xx
                if 500 <= r.status_code < 600 and attempt < retries - 1:
                    time.sleep(1.5 * (attempt + 1))
                    continue
                raise GeminiError(last_err)

            data = r.json()
            # Expected: candidates[0].content.parts[0].text
            candidates = data.get("candidates") or []
            if not candidates:
                raise GeminiError(f"No candidates in response: {data}")
            content = (candidates[0] or {}).get("content") or {}
            parts = content.get("parts") or []
            if not parts or "text" not in parts[0]:
                raise GeminiError(f"No text in response: {data}")
            return str(parts[0]["text"])
        except GeminiError:
            raise
        except Exception as e:
            last_err = str(e)
            if attempt < retries - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise GeminiError(f"Failed to call Gemini: {last_err}")

    raise GeminiError(f"Failed to call Gemini: {last_err}")
