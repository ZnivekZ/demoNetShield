"""
Blocklist local — fuente de verdad de IPs a bloquear en el firewall.

Se guarda como JSON en disco (fuera del repo) y **no** se empuja sola al
router: primero pasa por revisión humana y luego un push manual (o el
scheduler, si se configuró un intervalo).

El archivo se exporta por HTTP sin autenticación (red interna) para que el
propio MikroTik o un script externo pueda hacer pull:

    GET /blocklist.txt   → ip,comentario,duración por línea (RouterOS)

Retención: las entradas se borran del archivo a las N horas de cargadas
(`BLOCKLIST_RETENTION_HOURS`, 24 por defecto) para que no crezca sin control.
    GET /blocklist.json  → mismo contenido que el archivo

Escritura atómica (tmp + replace) para que nunca se lea un JSON a medias.
"""

from __future__ import annotations

import ipaddress
import json
import re
import os
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

DEFAULT_LIST_NAME = "Blacklist_Automatica"
DEFAULT_INTERVAL = 0  # 0 = nunca (push sólo manual)
DEFAULT_RETENTION_HOURS = 24  # las líneas se borran del archivo a las 24 h

_lock = threading.RLock()


def _default_path() -> Path:
    base = os.getenv("LOCALAPPDATA") or os.getenv("XDG_DATA_HOME") or str(Path.home())
    return Path(base) / "NetShield" / "blocklist.json"


def retention_hours() -> int:
    """Horas que una entrada vive en el archivo. 0 = sin límite."""
    raw = os.getenv("BLOCKLIST_RETENTION_HOURS", "").strip()
    if not raw:
        return DEFAULT_RETENTION_HOURS
    try:
        return max(0, int(raw))
    except ValueError:
        return DEFAULT_RETENTION_HOURS


def _too_old(entry: dict[str, Any], now: datetime | None = None) -> bool:
    """¿Se cargó hace más de la retención configurada? (24 h por defecto)"""
    hours = retention_hours()
    if hours <= 0:
        return False
    raw = entry.get("added_at")
    if not raw:
        return False
    try:
        added = datetime.fromisoformat(raw)
    except ValueError:
        return False
    if added.tzinfo is None:
        added = added.replace(tzinfo=timezone.utc)
    return added + timedelta(hours=hours) <= (now or datetime.now(timezone.utc))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def path() -> Path:
    override = os.getenv("BLOCKLIST_PATH")
    return Path(override) if override else _default_path()


def normalize_ip(value: str) -> str:
    """Valida IPv4/IPv6 o red CIDR. Devuelve la forma canónica."""
    raw = (value or "").strip()
    if not raw:
        raise ValueError("IP vacía")
    try:
        if "/" in raw:
            return str(ipaddress.ip_network(raw, strict=False))
        return str(ipaddress.ip_address(raw))
    except ValueError as e:
        raise ValueError(f"IP inválida: {raw}") from e


def _blank() -> dict[str, Any]:
    return {
        "version": 1,
        "updated_at": _now(),
        "settings": {
            "push_interval_minutes": DEFAULT_INTERVAL,
            "list_name": DEFAULT_LIST_NAME,
            "remove_missing": False,
            # None = usar el valor de la env (MIKROTIK_API_WRITE_ENABLED)
            "api_write_enabled": None,
        },
        "last_push": None,
        "entries": [],
    }


def _read() -> dict[str, Any]:
    p = path()
    if not p.exists():
        return _blank()
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return _blank()
        data.setdefault("settings", _blank()["settings"])
        data.setdefault("entries", [])
        data.setdefault("last_push", None)
        return data
    except (json.JSONDecodeError, OSError):
        # Archivo corrupto: no lo pisamos a ciegas, arrancamos vacío en memoria.
        return _blank()


def _write(data: dict[str, Any]) -> None:
    data["updated_at"] = _now()
    p = path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(p)


def snapshot() -> dict[str, Any]:
    """Contenido completo (entradas + settings + último push)."""
    with _lock:
        data = _read()
    data["path"] = str(path())
    data["count"] = len(data["entries"])
    data["active"] = sum(1 for e in data["entries"] if e.get("enabled", True))
    return data


def entries(only_enabled: bool = False) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    with _lock:
        items = list(_read()["entries"])
    items = [e for e in items if not _is_expired(e, now) and not _too_old(e, now)]
    return [e for e in items if e.get("enabled", True)] if only_enabled else items


def normalize_duration(value: str | None) -> str:
    """
    Normaliza la duración del bloqueo al formato de RouterOS (`30m`, `24h`,
    `7d`) o "" = permanente. Acepta también minutos sueltos ("30").
    """
    raw = (value or "").strip().lower()
    if not raw or raw in {"0", "permanent", "permanente", "never", "siempre"}:
        return ""
    if raw.isdigit():
        return f"{int(raw)}m"
    if re.fullmatch(r"\d+[smhdw]", raw):
        return raw
    raise ValueError(f"Duración inválida: {value} (usá 30m, 24h, 7d o vacío)")


def duration_to_delta(duration: str | None) -> timedelta | None:
    """`24h` → timedelta. Vacío = permanente (None)."""
    dur = normalize_duration(duration)
    if not dur:
        return None
    unit = dur[-1]
    amount = int(dur[:-1])
    return {
        "s": timedelta(seconds=amount),
        "m": timedelta(minutes=amount),
        "h": timedelta(hours=amount),
        "d": timedelta(days=amount),
        "w": timedelta(weeks=amount),
    }[unit]


def _expiry(duration: str | None, base: datetime | None = None) -> str | None:
    delta = duration_to_delta(duration)
    if delta is None:
        return None
    return ((base or datetime.now(timezone.utc)) + delta).isoformat(timespec="seconds")


def _is_expired(entry: dict[str, Any], now: datetime | None = None) -> bool:
    exp = entry.get("expires_at")
    if not exp:
        return False
    try:
        return datetime.fromisoformat(exp) <= (now or datetime.now(timezone.utc))
    except ValueError:
        return False


def prune() -> int:
    """Borra las entradas vencidas (el archivo no crece sin control)."""
    now = datetime.now(timezone.utc)
    with _lock:
        data = _read()
        before = len(data["entries"])
        data["entries"] = [
            e for e in data["entries"] if not _is_expired(e, now) and not _too_old(e, now)
        ]
        removed = before - len(data["entries"])
        if removed:
            data["last_prune"] = {"at": _now(), "removed": removed}
            _write(data)
    return removed


def add(
    value: str,
    comment: str = "",
    source: str = "manual",
    added_by: str = "dashboard_user",
    duration: str | None = "",
) -> dict[str, Any]:
    """Agrega (o actualiza comentario/duración de) una IP. Idempotente."""
    ip = normalize_ip(value)
    dur = normalize_duration(duration)
    with _lock:
        data = _read()
        for entry in data["entries"]:
            if entry["ip"] == ip:
                if comment:
                    entry["comment"] = comment[:200]
                if dur or entry.get("duration"):
                    if entry.get("duration") != dur:
                        entry["expires_at"] = _expiry(dur)
                    entry["duration"] = dur
                if source:
                    entry["source"] = source
                entry["enabled"] = True
                _write(data)
                return entry
        entry = {
            "ip": ip,
            "comment": (comment or "")[:200],
            "duration": dur,
            "source": source,
            "added_by": added_by,
            "added_at": _now(),
            "expires_at": _expiry(dur),
            "enabled": True,
        }
        data["entries"].append(entry)
        _write(data)
        return entry


def remove(value: str) -> bool:
    ip = normalize_ip(value)
    with _lock:
        data = _read()
        before = len(data["entries"])
        data["entries"] = [e for e in data["entries"] if e["ip"] != ip]
        if len(data["entries"]) == before:
            return False
        _write(data)
        return True


def set_enabled(value: str, enabled: bool) -> dict[str, Any] | None:
    return update_entry(value, enabled=enabled)


def update_entry(
    value: str,
    enabled: bool | None = None,
    duration: str | None = None,
    comment: str | None = None,
) -> dict[str, Any] | None:
    """Actualiza estado, duración y/o comentario de una entrada."""
    ip = normalize_ip(value)
    dur = normalize_duration(duration) if duration is not None else None
    with _lock:
        data = _read()
        for entry in data["entries"]:
            if entry["ip"] == ip:
                if enabled is not None:
                    entry["enabled"] = bool(enabled)
                if dur is not None:
                    entry["duration"] = dur
                    entry["expires_at"] = _expiry(dur)
                if comment is not None:
                    entry["comment"] = comment[:200]
                _write(data)
                return entry
    return None


def settings() -> dict[str, Any]:
    with _lock:
        return dict(_read()["settings"])


def api_write_enabled() -> bool:
    """Flag efectivo: setting de la UI si está definido, si no la env."""
    s = settings()
    value = s.get("api_write_enabled")
    if value is None:
        from config import get_settings

        return bool(get_settings().mikrotik_api_write_enabled)
    return bool(value)


def update_settings(
    push_interval_minutes: int | None = None,
    list_name: str | None = None,
    remove_missing: bool | None = None,
    api_write_enabled: bool | None = None,
) -> dict[str, Any]:
    with _lock:
        data = _read()
        s = data["settings"]
        if push_interval_minutes is not None:
            s["push_interval_minutes"] = max(0, int(push_interval_minutes))
        if list_name:
            s["list_name"] = list_name.strip()[:64] or DEFAULT_LIST_NAME
        if remove_missing is not None:
            s["remove_missing"] = bool(remove_missing)
        if api_write_enabled is not None:
            s["api_write_enabled"] = bool(api_write_enabled)
        _write(data)
        return dict(s)


def mark_pushed(added: int, removed: int, total: int, error: str | None = None) -> None:
    with _lock:
        data = _read()
        data["last_push"] = {
            "at": _now(),
            "added": added,
            "removed": removed,
            "total": total,
            "ok": error is None,
            "error": error,
        }
        _write(data)


def export_txt() -> str:
    """Formato para RouterOS: `ip,comentario,duración` por línea (duración "" = permanente)."""
    lines = []
    for e in entries(only_enabled=True):
        comment = (e.get("comment") or e.get("source") or "").replace(",", " ")
        dur = e.get("duration") or "permanent"
        lines.append(f"{e['ip']},{comment},{dur}")
    return "\n".join(lines) + ("\n" if lines else "")
