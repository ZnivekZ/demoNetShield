"""Pruebas sin red del piloto. Las muestras existen únicamente en este módulo."""
import json
import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import httpx
from fastapi import FastAPI
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

os.environ.setdefault("JWT_SECRET_KEY", "local-test-fibot-32-characters-long")

from database import Base
from routers import fibot as router
from services import fibot
from services.fibot_queries import Search, bounds, clean, compile_search, index_search, result

ANCHOR = datetime(2026, 11, 18, 1, tzinfo=timezone.utc)  # Aún es 17 en Buenos Aires.
AGENT = "002"
IP = "10.0.0.8"


def search_response(hits=(), buckets=None, total=None):
    data = {"took": 1, "_shards": {"total": 1, "failed": 0}, "timed_out": False,
            "hits": {"total": {"value": len(hits) if total is None else total, "relation": "eq"},
                     "hits": [{"_index": "test", "_id": str(i), "_source": doc} for i, doc in enumerate(hits)]}}
    if buckets is not None:
        data["aggregations"] = {"groups": {"buckets": buckets}}
    return data


def call(args, name="consultar_wazuh"):
    return ({"role": "assistant", "content": None, "tool_calls": [{"type": "function", "id": str(uuid4()),
             "function": {"name": name, "arguments": json.dumps(args)}}]}, {"tokens": 500})


def answer(text):
    return {"role": "assistant", "content": text}, {"tokens": 300, "finish_reason": "stop"}


class Queries(TestCase):
    def test_yesterday_timezone_and_agent_scope(self):
        search = Search(source="archives", period="ayer", status="404", group="ip")
        index, body = compile_search(search, [AGENT], ANCHOR)
        self.assertEqual(index, "wazuh-archives-*")
        self.assertEqual(bounds(search, ANCHOR), {"gte": "2026-11-16T03:00:00+00:00", "lt": "2026-11-17T03:00:00+00:00"})
        filters = body["query"]["bool"]["filter"]
        self.assertIn({"terms": {"agent.id": [AGENT]}}, filters)
        self.assertIn({"term": {"data.http_status": "404"}}, filters)
        self.assertIn({"term": {"decoder.name": "npm-proxy-access"}}, filters)
        self.assertEqual(body["aggs"]["groups"]["terms"]["field"], "data.srcip")
        self.assertNotIn("full_log", body["_source"])

    def test_proxy_host_is_qualified_by_installation(self):
        _, body = compile_search(Search(source="archives", group="proxy_host"), ["002", "005"], ANCHOR)
        self.assertEqual(body["aggs"]["groups"]["multi_terms"]["terms"], [{"field": "agent.id"}, {"field": "location"}])
        query = Search(source="archives", group="proxy_host")
        keys = [["002", "/data/logs/proxy-host-7_access.log"], ["005", "/data/logs/proxy-host-7_access.log"]]
        data = result(query, search_response(buckets=[{"key": k, "key_as_string": "|".join(k), "doc_count": 2} for k in keys]))
        self.assertEqual([r["proxy_host"] for r in data["rows"]], keys)

    def test_reject_scope_override_raw_dsl_and_invalid_period(self):
        for key in ("agents", "index", "script"):
            with self.assertRaises(ValidationError):
                Search.model_validate({"source": "archives", key: "something"})
        with self.assertRaises(ValueError):
            compile_search(Search(source="alerts"), [], ANCHOR)
        with self.assertRaises(ValueError):
            compile_search(Search(source="packages", period="ayer"), [AGENT], ANCHOR)
        with self.assertRaises(ValueError):
            bounds(Search(source="alerts", start=ANCHOR - timedelta(days=32), end=ANCHOR), ANCHOR)
        with self.assertRaises(ValueError):
            compile_search(Search(source="cves", status="404"), [AGENT], ANCHOR)

    def test_jdk_inventory_capture_shape(self):
        s = Search(source="packages", package="jdk")
        index, body = compile_search(s, ["004"], ANCHOR)
        self.assertIn({"wildcard": {"package.name": "*jdk*"}}, body["query"]["bool"]["filter"])
        self.assertIn("inventory-packages", index)
        packages = [(f"openjdk-{major}-{suffix}", ver) for major, ver in
                    [(17, "17.0.17+10-1~deb12u1"), (21, "21.0.13+9-1~deb13u2")]
                    for suffix in ("jre", "jdk", "jre-headless", "jdk-headless")]
        packages.extend([(n, "2:1.21-76") for n in ("default-jdk", "default-jdk-headless")])
        data = result(s, search_response([{"agent": {"name": "fvacaninb"}, "package": {"name": n, "version": v}}
                                          for n, v in packages]))
        self.assertEqual(data["total_documents"], 10)
        self.assertEqual({r["agent.name"] for r in data["rows"]}, {"fvacaninb"})
        self.assertEqual([r["package.version"] for r in data["rows"]], [v for _, v in packages])

    def test_cve_filter_and_distinct_agent_buckets(self):
        index, body = compile_search(Search(source="cves", cve="CVE-2026-1234", group="agent"), ["004"], ANCHOR)
        self.assertEqual(body["aggs"]["affected_agents"]["terms"], {"field": "agent.id", "size": 1})
        self.assertIn("vulnerabilities", index)
        self.assertIn({"term": {"vulnerability.id": "CVE-2026-1234"}}, body["query"]["bool"]["filter"])
        self.assertEqual(body["aggs"]["groups"]["terms"]["field"], "agent.id")

    def test_clean_structured_and_embedded_secrets(self):
        safe = clean({"authorization": "secret-a", "message": json.dumps({"token": "secret-b"}),
                      "url": "/abc?cookie=secret-c", "line": "Bearer secret-d"})
        for secret in ("secret-a", "secret-b", "secret-c", "secret-d"):
            self.assertNotIn(secret, str(safe))
        self.assertEqual(json.loads(safe["message"])["token"], "[oculto]")


class ChatAPI(IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        self.addAsyncCleanup(engine.dispose)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.enterContext(patch.object(router, "async_session_factory", async_sessionmaker(engine, expire_on_commit=False)))
        self.settings = SimpleNamespace(fibot_model="openai/gpt-oss-20b", fibot_browser_search=False,
                                        fibot_turn_tokens=18000, fibot_alert_time_field="timestamp")
        self.enterContext(patch.object(fibot, "get_settings", return_value=self.settings))
        self.enterContext(patch.object(router, "get_settings", return_value=self.settings))
        self.llm = self.enterContext(patch.object(fibot, "ask_groq", new_callable=AsyncMock))
        self.index = self.enterContext(patch.object(fibot, "index_search", new_callable=AsyncMock))
        self.enterContext(patch.object(router, "index_search", self.index))
        self.owner = SimpleNamespace(id=1)
        app = FastAPI()
        app.include_router(router.router)
        app.dependency_overrides[router.get_current_user] = lambda: self.owner
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test/api/fibot/")
        self.addAsyncCleanup(self.client.aclose)
        chat = await self.client.post("chats")
        self.path = "chats/" + str(chat.json()["id"])

    async def send(self, question="Los 404 de ayer", scope=(AGENT,), request_id=None):
        response = await self.client.post(self.path + "/turns", json={
            "request_id": str(request_id or uuid4()), "prompt": question, "agents": list(scope)})
        self.assertEqual(response.status_code, 202, response.text)
        return response.json()["id"]

    async def read(self):
        return (await self.client.get(self.path)).json()

    async def test_two_queries_followup_and_reopened_evidence(self):
        query = {"source": "archives", "status": "404", "group": "ip", "period": "ayer"}
        alerts = {"source": "alerts", "ips": [IP], "group": "rule", "period": "ayer"}
        ranking = search_response([{"data": {"srcip": IP, "url": "/private?token=secret-test"}}],
                                  buckets=[{"key": IP, "doc_count": 8}], total=8)
        self.index.side_effect = [ranking, search_response(buckets=[], total=0)]
        async def model(payload):
            if self.llm.await_count == 1:
                return call(query)
            summary = json.loads(payload["messages"][-1]["content"])
            if self.llm.await_count == 2:
                self.assertEqual(summary["rows"], [{"ip": IP, "cantidad": 8}])
                return call(alerts)
            self.assertEqual(summary["total_documents"], 0)
            return answer("Ocho 404. Sin reglas atribuibles en el intervalo.")
        self.llm.side_effect = model
        rid = uuid4()
        turn_id = await self.send(request_id=rid)
        self.assertEqual(await self.send(request_id=rid), turn_id)
        turns = await self.read()
        self.assertEqual(len(turns), 1)
        self.assertEqual(turns[0]["status"], "done")
        self.assertEqual(turns[0]["agents"], [AGENT])
        first, second = [c.args[1] for c in self.index.await_args_list]
        self.assertIn({"terms": {"data.srcip": [IP]}}, second["query"]["bool"]["filter"])
        window = first["query"]["bool"]["filter"][1]["range"]["timestamp"]
        self.assertIn({"range": {"timestamp": window}}, second["query"]["bool"]["filter"])
        base = self.path + f"/turns/{turn_id}"
        trace = (await self.client.get(base + "/trace")).json()
        self.assertEqual(sum(s["label"] == "Consulta a Wazuh" for s in trace), 2)
        copy = next(s["data"]["devtools"] for s in trace if "devtools" in s["data"])
        self.assertEqual(json.loads(copy.split("\n", 1)[1]), first)
        self.assertNotIn("secret-test", str(trace) + str(turns) + str(self.llm.await_args_list))

        graph = {**query, "group": "hour", "start": window["gte"], "end": window["lt"]}
        self.llm.side_effect = [call(graph), answer("Ocho en una hora.")]
        self.index.side_effect = [search_response(buckets=[{"key": 0, "key_as_string": window["gte"], "doc_count": 8}], total=8)]
        await self.send("Graficame esos 404 por hora")
        msg = self.llm.await_args_list[-2].args[0]["messages"][1]["content"]
        self.assertEqual(json.loads(msg)["historial_resumido"][0]["resultados"][0]["window"]["timestamp"], window)
        self.assertEqual((await self.read())[1]["results"][0]["rows"][0]["cantidad"], 8)

        self.index.side_effect = [search_response(), search_response(buckets=[{"key": AGENT, "doc_count": 20}])]
        self.assertEqual((await self.client.get(base + "/results/0/evidence/0")).status_code, 200)
        self.assertIn({"term": {"data.srcip": IP}}, self.index.await_args.args[1]["query"]["bool"]["filter"])
        covered = (await self.client.get(base + "/results/0/coverage")).json()
        self.assertEqual(covered[0]["documentos"], 20)
        self.assertNotIn({"term": {"data.http_status": "404"}}, self.index.await_args.args[1]["query"]["bool"]["filter"])
        await self.client.post(base + "/views/0")
        views = (await self.client.get("views")).json()
        self.index.side_effect = [ranking]
        url = f"views/{views[0]['id']}/refresh?request_id={uuid4()}"
        self.assertEqual((await self.client.post(url)).status_code, 202)
        self.assertEqual((await self.read())[-1]["results"][0]["rows"][0]["cantidad"], 8)
        self.owner.id = 2
        for path in (self.path, base + "/trace", base + "/results/0/evidence/0", base + "/results/0/coverage"):
            self.assertEqual((await self.client.get(path)).status_code, 404)
        self.assertEqual((await self.client.post(url)).status_code, 404)
        self.assertEqual((await self.client.get("views")).json(), [])

    async def test_empty_index_and_unavailable_source_are_distinct(self):
        self.index.side_effect = [search_response(), httpx.ReadTimeout("timeout")]
        self.llm.side_effect = [call({"source": "alerts"}), answer("Sin coincidencias."),
                                call({"source": "alerts"}), answer("No se pudo verificar.")]
        await self.send()
        await self.send(scope=("004",))
        empty, failed = await self.read()
        self.assertEqual(empty["results"][0]["total_documents"], 0)
        self.assertEqual(empty["status"], "done")
        self.assertEqual(failed["status"], "partial")
        self.assertEqual(failed["results"], [])
        context = json.loads(self.llm.await_args_list[2].args[0]["messages"][1]["content"])
        self.assertEqual(context["historial_resumido"], [])

    async def test_low_budget_and_duplicate_tool_stop(self):
        self.settings.fibot_turn_tokens = 20
        await self.send()
        self.llm.assert_not_awaited()
        self.assertEqual((await self.read())[0]["status"], "partial")
        self.settings.fibot_turn_tokens = 18000
        same = call({"source": "alerts"})
        self.llm.side_effect = [same, same]
        self.index.return_value = search_response()
        await self.send()
        self.index.assert_awaited_once()
        self.assertEqual((await self.read())[1]["status"], "partial")

    async def test_groq_rate_limit_saved(self):
        from openai import RateLimitError
        self.llm.side_effect = RateLimitError("quota", response=httpx.Response(429,
            request=httpx.Request("POST", "https://example.invalid"), headers={"retry-after": "30"}), body=None)
        await self.send()
        turn = (await self.read())[0]
        self.assertEqual(turn["status"], "failed")
        self.assertIn("30 s", turn["answer"])
        self.index.assert_not_awaited()


class Providers(IsolatedAsyncioTestCase):
    async def test_reputation_only_on_observed_public_ips(self):
        service = SimpleNamespace(lookup_abuse=AsyncMock(return_value={"ok": True, "abuse_confidence_score": 75}))
        ips = ["8.8.8.8", IP]
        with patch.object(fibot, "get_reputation_service", return_value=service):
            data = await fibot.execute("reputacion_ip", {"ips": ips}, [AGENT], ANCHOR, AsyncMock(), set(ips))
            self.assertEqual([r["ip"] for r in data["rows"]], ips)
            self.assertEqual(data["rows"][0]["puntuación"], 75)
            self.assertEqual(data["rows"][1]["estado"], "No aplica")
            service.lookup_abuse.assert_awaited_once_with(ips[0])
            with self.assertRaises(ValueError):
                await fibot.execute("preparar_lista", {"ips": ["1.1.1.1"]}, [AGENT], ANCHOR, AsyncMock(), set(ips))

    async def test_preview_checks_networks_and_disabled_entries(self):
        entries = [{"ip": "8.8.8.0/24", "enabled": True}, {"ip": IP, "enabled": False}]
        with patch.object(fibot.blocklist_store, "entries", return_value=entries):
            data = await fibot.execute("preparar_lista", {"ips": ["8.8.8.8", IP]}, [AGENT], ANCHOR,
                                       AsyncMock(), {IP, "8.8.8.8"})
        self.assertEqual([row["lista_local"] for row in data["rows"]], ["Incluida", "Entrada deshabilitada"])

    async def test_indexer_incomplete_results_rejected(self):
        import asyncio
        for flags in ({"timed_out": True}, {"_shards": {"failed": 1}}, {"_shards": {"total": 0}}):
            client = httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(200,
                json={**search_response(), **flags})), base_url="http://test")
            async with client:
                indexer = SimpleNamespace(is_configured=lambda: True, _get_client=lambda: client,
                                          _get_request_lock=asyncio.Lock)
                with patch("services.fibot_queries.get_indexer_client", return_value=indexer), self.assertRaises(ValueError):
                    await index_search("test", {})

    async def test_public_lookup_verifies_publication_and_omits_lab_context(self):
        provider = AsyncMock(return_value=answer("CVE-2026-1234 y CVE-2026-8888"))
        current = {"kind": "nvd", "published": "2026-11-17T04:00:00", "text": "PHP",
                   "url": "https://nvd.nist.gov/vuln/detail/CVE-2026-1234"}
        old = {**current, "published": "2025-10-02T12:00:00"}
        settings = SimpleNamespace(fibot_model="test", fibot_browser_search=True)
        with patch.object(fibot, "get_settings", return_value=settings), patch.object(
                fibot, "get_remediation_context", new_callable=AsyncMock, side_effect=[{"sources": [current]}, {"sources": [old]}]):
            data = await fibot.execute("buscar_aviso", {"product": "PHP", "days": 2}, ["internal-agent"],
                                       ANCHOR, AsyncMock(), set(), provider)
        self.assertEqual([r["cve"] for r in data["rows"]], ["CVE-2026-1234"])
        public_prompt = provider.await_args.args[0]["messages"][0]["content"]
        self.assertNotIn("internal-agent", public_prompt)
        self.assertIn("2026-11-17", public_prompt)

    async def test_groq_sdk_decodes_tool_calls_and_provider_quota(self):
        from openai import AsyncOpenAI
        captured = []

        def respond(request):
            captured.append(json.loads(request.content))
            message = call({"source": "archives", "group": "ip"})[0]
            return httpx.Response(200, headers={"x-ratelimit-remaining-tokens": "7900"}, json={
                "id": "chat-test", "object": "chat.completion", "model": "test", "created": 0,
                "choices": [{"index": 0, "finish_reason": "tool_calls", "message": message}],
                "usage": {"prompt_tokens": 80, "completion_tokens": 20, "total_tokens": 100}})

        client = AsyncOpenAI(api_key="test", base_url="https://example.invalid/v1",
                             http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond)))
        settings = SimpleNamespace(groq_api_key="test", fibot_turn_tokens=18000, fibot_browser_search=False,
                                   fibot_model="test")
        with patch("openai.AsyncOpenAI", return_value=client), patch.object(fibot, "get_settings", return_value=settings), \
             patch.object(fibot, "model_rate_wait", new_callable=AsyncMock, return_value=0), \
             patch.object(fibot, "record_usage", new_callable=AsyncMock) as ledger, patch.dict(fibot.provider_quota, clear=True):
            body, _, _ = fibot.first_request("Top IP", [AGENT], ANCHOR, [])
            reply, metadata = await fibot.ask_groq(body)
            self.assertEqual(captured[0]["tools"], body["tools"])
            self.assertEqual(reply["tool_calls"][0]["function"]["name"], "consultar_wazuh")
            self.assertEqual(metadata["tokens"], 100)
            self.assertEqual(fibot.provider_quota["test"]["remaining_tokens"], "7900")
            ledger.assert_awaited_once()
