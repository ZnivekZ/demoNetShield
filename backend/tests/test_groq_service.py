"""Groq model selection and failure reporting without external requests."""

import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("JWT_SECRET_KEY", "0123456789abcdef0123456789abcdef")

from services.groq_service import FALLBACK_MODELS, GroqService


class GroqServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_skips_models_not_available_to_the_key(self):
        attempted = []

        async def list_models():
            return SimpleNamespace(data=[SimpleNamespace(id=FALLBACK_MODELS[1])])

        async def create(**kwargs):
            attempted.append(kwargs["model"])
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content="Análisis real"))],
                usage=None,
            )

        class FakeClient:
            models = SimpleNamespace(list=list_models)
            chat = SimpleNamespace(completions=SimpleNamespace(create=create))

            async def close(self):
                pass

        service = GroqService.__new__(GroqService)
        service._api_key = "test-key"
        with patch("openai.AsyncOpenAI", return_value=FakeClient()):
            summary, model, is_mock = await service._call_with_fallback({})

        self.assertEqual(attempted, [FALLBACK_MODELS[1]])
        self.assertEqual((summary, model, is_mock), ("Análisis real", FALLBACK_MODELS[1], False))

    async def test_uses_available_production_model_after_first_failure(self):
        attempted = []

        class FakeModels:
            async def list(self):
                return SimpleNamespace(data=[SimpleNamespace(id=model) for model in FALLBACK_MODELS])

        class FakeCompletions:
            async def create(self, **kwargs):
                attempted.append(kwargs["model"])
                if len(attempted) == 1:
                    raise RuntimeError("temporary failure")
                return SimpleNamespace(
                    choices=[SimpleNamespace(message=SimpleNamespace(content="Análisis real"))],
                    usage=None,
                )

        class FakeClient:
            models = FakeModels()
            chat = SimpleNamespace(completions=FakeCompletions())

            def __init__(self):
                self.closed = False

            async def close(self):
                self.closed = True

        fake_client = FakeClient()
        service = GroqService.__new__(GroqService)
        service._api_key = "test-key"
        with patch("openai.AsyncOpenAI", return_value=fake_client):
            summary, model, is_mock = await service._call_with_fallback({"date": "2026-11-03"})

        self.assertEqual(attempted, FALLBACK_MODELS)
        self.assertEqual((summary, model, is_mock), ("Análisis real", FALLBACK_MODELS[1], False))
        self.assertTrue(fake_client.closed)

    async def test_all_models_failing_does_not_return_simulated_analysis(self):
        class FakeClient:
            async def close(self):
                pass

        class FakeCompletions:
            async def create(self, **_kwargs):
                raise RuntimeError("model unavailable")

        fake_client = FakeClient()
        async def list_models():
            return SimpleNamespace(data=[SimpleNamespace(id=model) for model in FALLBACK_MODELS])
        fake_client.models = SimpleNamespace(list=list_models)
        fake_client.chat = SimpleNamespace(completions=FakeCompletions())
        service = GroqService.__new__(GroqService)
        service._api_key = "test-key"
        with patch("openai.AsyncOpenAI", return_value=fake_client):
            summary, model, is_mock = await service._call_with_fallback({})

        self.assertEqual((summary, model, is_mock), (None, "groq_error", True))


if __name__ == "__main__":
    unittest.main()
