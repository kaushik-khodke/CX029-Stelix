"""
ai_config.py
Centralized AI Configuration, Client Management, and Safe API Execution Wrapper
for MyHealthChain.

Hybrid Model Architecture:
- MODEL_TEXT_FAST ("gemini-3.1-flash-lite"): Optimized for fast direct Q&A, OCR, Summaries, RAG, and Insights.
- MODEL_TOOL_AGENT ("gemini-2.5-flash"): Optimized for multi-turn Agent Tool Calling, Function Calling, and Database Operations.
- MODEL_EMBEDDING ("text-embedding-004"): Vector embedding generation.
"""

import os
import asyncio
import time
from typing import Any, Dict, List, Optional
from google import genai
from google.genai import types

# ── Model Registry Definitions ──────────────────────────────────────────────
MODEL_TEXT_FAST = "gemini-3.1-flash-lite"
MODEL_TEXT_FAST_FALLBACK = "gemini-2.5-flash"

MODEL_TOOL_AGENT = "gemini-2.5-flash"
MODEL_TOOL_AGENT_FALLBACK = "gemini-2.0-flash"

MODEL_EMBEDDING = "gemini-embedding-001"
MODEL_EMBEDDING_FALLBACK = "text-embedding-004"

_client_instance: Optional[genai.Client] = None

def get_ai_client() -> genai.Client:
    """Return singleton instance of Google GenAI Client."""
    global _client_instance
    api_key = os.getenv("GEMINI_API_KEY")
    if not _client_instance or getattr(_client_instance, '_api_key', None) != api_key:
        _client_instance = genai.Client(api_key=api_key)
        setattr(_client_instance, '_api_key', api_key)
    return _client_instance


async def safe_generate_content(
    contents: Any,
    task_type: str = "text_fast",
    config: Optional[types.GenerateContentConfig] = None,
    client: Optional[genai.Client] = None
) -> types.GenerateContentResponse:
    """
    Safely invoke client.models.generate_content with:
    1. Automatic model selection based on task_type ("text_fast" or "tool_agent")
    2. Model fallback if model is unavailable or throws 404 / 400
    3. Exponential backoff retry on 429 Rate Limit (RESOURCE_EXHAUSTED)
    """
    if client is None:
        client = get_ai_client()

    primary_model = MODEL_TEXT_FAST if task_type == "text_fast" else MODEL_TOOL_AGENT
    fallback_model = MODEL_TEXT_FAST_FALLBACK if task_type == "text_fast" else MODEL_TOOL_AGENT_FALLBACK

    models_to_try = [primary_model, fallback_model]
    last_exception = None

    for model_name in models_to_try:
        for attempt in range(3):
            try:
                response = await asyncio.to_thread(
                    client.models.generate_content,
                    model=model_name,
                    contents=contents,
                    config=config
                )
                return response
            except Exception as e:
                last_exception = e
                err_str = str(e)
                # 429 Rate Limit Retry
                if ("429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "quota" in err_str.lower()) and attempt < 2:
                    wait_time = (attempt + 1) * 2
                    print(f"⏳ [{model_name}] Rate limit hit, retrying in {wait_time}s (attempt {attempt + 1}/3)...")
                    await asyncio.sleep(wait_time)
                # Model unavailable / deprecated / 404 -> Switch to fallback model immediately
                elif "404" in err_str or "NOT_FOUND" in err_str or "no longer available" in err_str.lower() or "INVALID_ARGUMENT" in err_str:
                    print(f"⚠️ Model {model_name} failed with model error: {err_str[:120]}. Falling back to {fallback_model}...")
                    break
                else:
                    raise e

    if last_exception:
        raise last_exception
    raise RuntimeError("Failed to generate content after retries.")


async def safe_embed_content(
    contents: str,
    task_type: str = "RETRIEVAL_DOCUMENT",
    output_dimensionality: int = 768,
    client: Optional[genai.Client] = None
) -> Any:
    """
    Safely invoke client.models.embed_content with automatic fallback for embedding models.
    """
    if client is None:
        client = get_ai_client()

    models_to_try = [MODEL_EMBEDDING, MODEL_EMBEDDING_FALLBACK, "embedding-001"]
    last_exception = None

    for model_name in models_to_try:
        try:
            config = types.EmbedContentConfig(
                task_type=task_type,
                output_dimensionality=output_dimensionality
            )
            res = await asyncio.to_thread(
                client.models.embed_content,
                model=model_name,
                contents=contents,
                config=config
            )
            return res
        except Exception as e:
            last_exception = e
            err_str = str(e)
            if "404" in err_str or "NOT_FOUND" in err_str or "supported" in err_str.lower():
                print(f"⚠️ Embedding model {model_name} not found or not supported. Retrying with fallback...")
                continue
            else:
                # Try without output_dimensionality config if config rejected
                try:
                    res = await asyncio.to_thread(
                        client.models.embed_content,
                        model=model_name,
                        contents=contents
                    )
                    return res
                except Exception:
                    raise e

    if last_exception:
        raise last_exception
    raise RuntimeError("Failed to generate embedding after retries.")
