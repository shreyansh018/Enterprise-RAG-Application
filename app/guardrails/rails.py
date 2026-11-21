import os
import shutil
import threading
from pathlib import Path

import logfire
from langchain_groq import ChatGroq
from nemoguardrails import RailsConfig, LLMRails

from app.config import settings
from app.guardrails.colang_rules import COLANG_CONTENT, YAML_CONTENT, RAIL_INDICATORS


# NeMo's semantic intent matching uses fastembed with all-MiniLM-L6-v2 (87 MB).
# Vercel's filesystem is read-only except /tmp, and downloading the model at
# cold start costs ~30s. Bundle the model in the repo and copy it into the
# writable /tmp cache once per instance so cold starts stay fast.
_PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _seed_cache(bundled_dir: Path, target_dir: Path, folder: str) -> None:
    """Copy one bundled model folder into a writable /tmp cache."""
    target = target_dir / folder
    if target.exists():
        return
    source = bundled_dir / folder
    if not source.exists():
        logfire.warning(f"⚠️ Bundled model not found at {source}")
        return
    try:
        target_dir.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source, target, dirs_exist_ok=True)
        logfire.info(f"✅ Seeded {folder} into {target_dir}.")
    except Exception as exc:
        logfire.warning(f"⚠️ Could not seed {folder}: {exc}")


def _prepare_model_caches() -> None:
    """Seed NeMo's fastembed model and FlashRank's reranker into /tmp."""
    if not os.environ.get("VERCEL"):
        # Local dev: let the libraries use their normal temp caches.
        return
    _seed_cache(
        _PROJECT_ROOT / "models" / "fastembed",
        Path("/tmp/fastembed"),
        "models--Qdrant--all-MiniLM-L6-v2-onnx",
    )
    _seed_cache(
        _PROJECT_ROOT / "models" / "flashrank",
        Path("/tmp/flashrank"),
        "ms-marco-TinyBERT-L-2-v2",
    )


_prepare_model_caches()

os.environ.setdefault("FASTEMBED_CACHE_PATH", "/tmp/fastembed")
os.environ.setdefault("HF_HOME", "/tmp/huggingface")
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")


_rails: LLMRails | None = None
_rails_lock = threading.Lock()


def initialize_rails() -> None:
    """
    Build the NeMo LLMRails singleton at app startup.
    Uses openai/gpt-oss-20b for fast intent classification at the gate —
    the heavier llama-3.3-70b-versatile is reserved for the RAG pipeline.
    """
    global _rails

    guard_llm = ChatGroq(
        api_key=settings.GROQ_API_KEY,
        model="openai/gpt-oss-20b",
        temperature=0
    )

    config = RailsConfig.from_content(
        colang_content=COLANG_CONTENT,
        yaml_content=YAML_CONTENT
    )

    _rails = LLMRails(config, llm=guard_llm)
    logfire.info("🛡️ NeMo Guardrails initialised (openai/gpt-oss-20b).")


def ensure_rails() -> None:
    """Build the rails singleton on first use (serverless-friendly lazy init)."""
    global _rails
    if _rails is None:
        with _rails_lock:
            if _rails is None:
                initialize_rails()


def guard(message: str) -> tuple[bool, str | None]:
    """
    Run a user message through the NeMo rails gate.

    Returns:
        (True,  rail_response) — a rail fired; return this response immediately,
                                skip the RAG pipeline entirely.
        (False, None)          — message is clean; proceed to LangGraph.
    """
    ensure_rails()
    if _rails is None:
        logfire.warning("⚠️ Guardrails not initialised — skipping gate.")
        return False, None

    with logfire.span("🛡️ Guardrails Check"):
        result = _rails.generate(messages=[{"role": "user", "content": message}])

        # NeMo returns {'role': 'assistant', 'content': '...'} — extract text
        content = result.get("content", "") if isinstance(result, dict) else str(result)

        fired = any(indicator in content for indicator in RAIL_INDICATORS)

        if fired:
            logfire.info(f"🛡️ Guardrails fired | query='{message[:80]}'")
            return True, content

        logfire.info("✅ Guardrails passed.")
        return False, None
