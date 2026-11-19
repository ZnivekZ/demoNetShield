"""Chat privado de investigación y trazas persistentes."""
import asyncio
import httpx
from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import defer

from database import async_session_factory
from models.fibot import FibotChat, FibotTurn, FibotView, now_iso
from models.user import User
from routers.auth import get_current_user
from services.fibot import compact, execute, first_request, investigate, provider_quota, public_error
from services.fibot_queries import ART, DIMENSIONS, Search, clean, compile_search, index_search, result
from config import get_settings
from services.groq_usage import get_usage_status

router = APIRouter(prefix="/api/fibot", tags=["Fibot"])
Actor = Annotated[User, Depends(get_current_user)]
AgentID = Annotated[str, StringConstraints(pattern=r"^[0-9]{1,10}$")]


class Scope(BaseModel):
    agents: list[AgentID] = Field(min_length=1, max_length=5000)


class NewTurn(Scope):
    request_id: UUID
    prompt: str = Field(min_length=1, max_length=2000)


async def owned(db, chat_id, owner):
    chat = await db.scalar(select(FibotChat).where(FibotChat.id == chat_id, FibotChat.owner_id == owner))
    if not chat:
        raise HTTPException(404, "Conversación no encontrada")
    return chat


def display(turn):
    return {key: getattr(turn, key) for key in
            ("id", "request_id", "prompt", "agents", "created", "answer", "status", "results")}


async def stale(db, chat_id):
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    await db.execute(update(FibotTurn).where(FibotTurn.chat_id == chat_id,
                     FibotTurn.status == "running", FibotTurn.created < cutoff)
                     .values(status="partial", answer="Turno interrumpido. Podés volver a preguntar."))
    await db.commit()


@router.get("/chats")
async def chats(user: Actor):
    async with async_session_factory() as db:
        items = await db.scalars(select(FibotChat).where(FibotChat.owner_id == user.id)
                                 .order_by(FibotChat.id.desc()))
        return [{"id": c.id, "title": c.title} for c in items]


@router.post("/chats", status_code=201)
async def new_chat(user: Actor):
    async with async_session_factory() as db:
        c = FibotChat(owner_id=user.id, title="Nueva investigación")
        db.add(c)
        await db.commit()
        return {"id": c.id, "title": c.title}


@router.get("/chats/{chat_id}")
async def read_chat(chat_id: int, user: Actor):
    async with async_session_factory() as db:
        await owned(db, chat_id, user.id)
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        interrupted = await db.scalar(select(FibotTurn.id).where(
            FibotTurn.chat_id == chat_id, FibotTurn.status == "running", FibotTurn.created < cutoff))
        if interrupted:
            await stale(db, chat_id)
        turns = await db.scalars(select(FibotTurn).options(defer(FibotTurn.steps)).where(FibotTurn.chat_id == chat_id).order_by(FibotTurn.id))
        return [display(turn) for turn in turns]


@router.get("/chats/{chat_id}/turns/{turn_id}/trace")
async def trace(chat_id: int, turn_id: int, user: Actor):
    async with async_session_factory() as db:
        await owned(db, chat_id, user.id)
        steps = await db.scalar(select(FibotTurn.steps).where(FibotTurn.id == turn_id, FibotTurn.chat_id == chat_id))
        if steps is None:
            raise HTTPException(404, "Turno no encontrado")
        return steps


async def recent_history(db, chat_id, agents, before=None):
    stmt = select(FibotTurn).options(defer(FibotTurn.steps)).where(FibotTurn.chat_id == chat_id)
    if before is not None:
        stmt = stmt.where(FibotTurn.id < before)
    previous = await db.scalars(stmt.order_by(FibotTurn.id.desc()).limit(3))
    return [{"turno": t.id, "pregunta": t.prompt, "respuesta": t.answer[:600],
             "resultados": [compact(r, 10) for r in t.results[-2:]]}
            for t in reversed(previous.all()) if t.agents == agents]


@router.post("/chats/{chat_id}/context")
async def context(chat_id: int, body: Scope, user: Actor):
    agents = sorted(set(body.agents))
    async with async_session_factory() as db:
        await owned(db, chat_id, user.id)
        recent = await recent_history(db, chat_id, agents)
    _, included, estimate = first_request("", agents, datetime.now(timezone.utc), recent)
    return {"included": len(included), "trimmed": len(included) < len(recent), "estimate": estimate}


async def run(turn_id: int, saved_query: dict | None = None):
    async with async_session_factory() as db:
        turn = await db.get(FibotTurn, turn_id)
        history = await recent_history(db, turn.chat_id, turn.agents, before=turn.id)

        async def step(label, data):
            safe = clean(data)
            if "devtools" in safe:
                path, body = safe["devtools"].split("\n", 1)
                safe["devtools"] = path + "?allow_no_indices=false&allow_partial_search_results=false\n" + body
            turn.steps = [*turn.steps, {"label": label, "at": now_iso(), "data": safe}]
            await db.commit()

        async def save(data):
            turn.results = [*turn.results, data]
            await db.commit()

        try:
            if saved_query:
                data = await execute("consultar_wazuh", saved_query, turn.agents,
                                     datetime.fromisoformat(turn.created), step, set())
                await save(clean(data))
                turn.status, turn.answer = "done", "Vista actualizada."
            else:
                turn.status, turn.answer = await asyncio.wait_for(investigate(
                    turn.prompt, turn.agents, datetime.fromisoformat(turn.created), history, step, save), timeout=240)
        except Exception as exc:
            turn.status, turn.answer = "partial" if turn.results else "failed", public_error(exc)
            await step("Interrumpido", {"error": turn.answer})
        await step("Fin del turno", {"estado": turn.status})


@router.post("/chats/{chat_id}/turns", status_code=202)
async def send(chat_id: int, body: NewTurn, tasks: BackgroundTasks, user: Actor):
    prompt = clean(body.prompt.strip())
    if not prompt:
        raise HTTPException(422, "Escribí una pregunta")
    async with async_session_factory() as db:
        chat = await owned(db, chat_id, user.id)
        await stale(db, chat_id)
        if chat.title == "Nueva investigación":
            chat.title = prompt[:85]
        turn = FibotTurn(chat_id=chat_id, request_id=str(body.request_id), prompt=prompt,
                         agents=sorted(set(body.agents)))
        db.add(turn)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            old = await db.scalar(select(FibotTurn).where(FibotTurn.chat_id == chat_id,
                                  FibotTurn.request_id == str(body.request_id)))
            if old:
                return {"id": old.id}
            raise HTTPException(409, "Ya hay una pregunta en curso en este chat")
        tasks.add_task(run, turn.id)
        return {"id": turn.id}


@router.get("/quota")
async def quota(user: Actor):
    settings = get_settings()
    status = await get_usage_status()
    estimates = next((m for m in status["models"] if m["model"] == settings.fibot_model), {})
    return {"model": settings.fibot_model, "configured": bool(settings.groq_api_key),
            "turn_budget": settings.fibot_turn_tokens, "provider": provider_quota.get(settings.fibot_model), **estimates}


@router.post("/chats/{chat_id}/turns/{turn_id}/views/{position}")
async def save_view(chat_id: int, turn_id: int, position: int, user: Actor):
    async with async_session_factory() as db:
        await owned(db, chat_id, user.id)
        t = await db.get(FibotTurn, turn_id)
        if not t or t.chat_id != chat_id or not 0 <= position < len(t.results) or "query" not in t.results[position]:
            raise HTTPException(404, "Resultado no encontrado")
        db.add(FibotView(turn_id=t.id, owner_id=user.id, result_index=position,
                         title=f"{t.prompt[:90]} · {t.results[position]['source']}"))
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
        return {"saved": True}


@router.get("/views")
async def views(user: Actor):
    async with async_session_factory() as db:
        items = await db.scalars(select(FibotView).where(FibotView.owner_id == user.id).order_by(FibotView.id.desc()))
        return [{"id": v.id, "title": v.title} for v in items]


@router.post("/views/{view_id}/refresh", status_code=202)
async def refresh_view(view_id: int, request_id: UUID, tasks: BackgroundTasks, user: Actor):
    async with async_session_factory() as db:
        v = await db.get(FibotView, view_id)
        if not v or v.owner_id != user.id:
            raise HTTPException(404, "Vista no encontrada")
        origin = await db.get(FibotTurn, v.turn_id)
        await stale(db, origin.chat_id)
        chat_id = origin.chat_id
        t = FibotTurn(chat_id=chat_id, request_id=str(request_id), agents=origin.agents,
                      prompt=f"Actualizar vista · {v.title}")
        db.add(t)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            existing = await db.scalar(select(FibotTurn.id).where(
                FibotTurn.chat_id == chat_id, FibotTurn.request_id == str(request_id)))
            if existing:
                return {"chat_id": chat_id}
            raise HTTPException(409, "El chat tiene una pregunta en curso")
        tasks.add_task(run, t.id, origin.results[v.result_index]["query"])
        return {"chat_id": origin.chat_id}


async def load_result(owner, chat_id, turn_id, position):
    async with async_session_factory() as db:
        await owned(db, chat_id, owner)
        turn = await db.get(FibotTurn, turn_id)
        if not turn or turn.chat_id != chat_id or not 0 <= position < len(turn.results):
            raise HTTPException(404, "Resultado no encontrado")
        saved = turn.results[position]
        if "query" not in saved:
            raise HTTPException(422, "Este resultado no corresponde al Indexer")
        return saved, turn.agents, datetime.fromisoformat(turn.created)


@router.get("/chats/{chat_id}/turns/{turn_id}/results/{position}/evidence/{row}")
async def evidence(chat_id: int, turn_id: int, position: int, row: int, user: Actor):
    saved, agents, anchor = await load_result(user.id, chat_id, turn_id, position)
    group = saved["group"]
    if group == "documents" or not 0 <= row < len(saved["rows"]):
        raise HTTPException(404, "Fila de agrupación no encontrada")
    key = saved["rows"][row][group]
    query = Search.model_validate({**saved["query"], "group": "documents", "limit": 10})
    index, body = compile_search(query, agents, anchor, get_settings().fibot_alert_time_field)
    filters = body["query"]["bool"]["filter"]
    if group in ("hour", "day"):
        start = datetime.fromtimestamp(key / 1000, ART) if isinstance(key, int) else datetime.fromisoformat(key)
        duration = timedelta(hours=1) if group == "hour" else timedelta(days=1)
        filters.append({"range": {next(iter(saved["window"])): {"gte": start.isoformat(),
                                                                "lt": (start + duration).isoformat()}}})
    elif group == "proxy_host":
        filters.extend([{"term": {"agent.id": key[0]}}, {"term": {"location": key[1]}}])
    else:
        field = "data.upstream_status" if group == "status" and query.upstream else DIMENSIONS[group]
        filters.append({"term": {field: key}})
    try:
        raw = await index_search(index, body)
    except (ValueError, httpx.HTTPError) as exc:
        raise HTTPException(503, public_error(exc)) from exc
    return result(query, raw)


@router.get("/chats/{chat_id}/turns/{turn_id}/results/{position}/coverage")
async def coverage(chat_id: int, turn_id: int, position: int, user: Actor):
    saved, agents, anchor = await load_result(user.id, chat_id, turn_id, position)
    original = Search.model_validate(saved["query"])
    baseline = Search(source=original.source, period=original.period, start=original.start, end=original.end, group="agent")
    index, body = compile_search(baseline, agents, anchor, get_settings().fibot_alert_time_field)
    body.update(size=0, track_total_hits=False)
    body["aggs"]["groups"]["terms"]["size"] = len(agents)
    try:
        raw = await index_search(index, body)
    except (ValueError, httpx.HTTPError) as exc:
        raise HTTPException(503, public_error(exc)) from exc
    counts = {b["key"]: b["doc_count"] for b in raw["aggregations"]["groups"]["buckets"]}
    return [{"agente": a, "documentos": counts.get(a, 0),
             "cobertura": "Datos observados" if a in counts else "Sin datos observados"} for a in agents]
