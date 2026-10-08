from functools import lru_cache

from langchain.chat_models import init_chat_model

from ..config import settings


@lru_cache
def structured(model: str, schema: type):
    """Model client for `schema`, built once and reused so documents share its HTTP connections."""
    return init_chat_model(model, temperature=0, api_key=settings.LLM_API_KEY or None, timeout=60,
                           max_retries=1, **settings.LLM_KWARGS).with_structured_output(schema)
