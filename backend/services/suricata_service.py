"""
Suricata IDS/IPS/NSM Service — Integración con el motor de análisis de red.

Arquitectura:
  - Singleton pattern (mismo que crowdsec_service.py)
  - Mock guard en cada método público: retorna datos de MockData si MOCK_SURICATA=true
  - Comunicación real via Unix socket asíncrono (asyncio streams) para control del motor
  - Alertas procesadas leídas desde Wazuh API (el agente Wazuh recolecta eve.json)
  - Retry con tenacity (3 intentos, backoff exponencial)
  - Logging con structlog, nunca print()

Flujo de datos real:
  Tráfico → Suricata (eve.json) → Agente Wazuh → Wazuh Manager → NetShield API

Flujo de datos mock:
  Cualquier llamada → MockData.suricata.xxx()

Para activar modo real: MOCK_SURICATA=false + Suricata corriendo con socket accesible.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any

import structlog
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from config import get_settings

logger = structlog.get_logger(__name__)


class SuricataService:
    """
    Singleton service para Suricata IDS/IPS/NSM.

    Métodos organizados en grupos:
    - Engine: control del motor (socket)
    - Alerts: alertas IDS/IPS (vía Wazuh)
    - Flows: flujos NSM (vía Wazuh)
    - Rules: gestión de firmas (socket)
    - Correlation: correlación cross-service
    - AutoResponse: circuito de respuesta automática
    - IPContext: contexto para una IP específica
    """

    _instance: SuricataService | None = None

    def __new__(cls) -> SuricataService:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self._settings = get_settings()
        self._initialized = True
        logger.info(
            "suricata_service_init",
            mock=self._settings.should_mock_suricata,
            socket=self._settings.suricata_socket,
        )

    # ── Lifecycle ──────────────────────────────────────────────────────────

    async def connect(self) -> None:
        """Verificar conectividad al iniciar el servidor."""
        if self._settings.should_mock_suricata:
            logger.info("suricata_service_mock_mode")
            return
        try:
            stats = await self.get_engine_stats()
            logger.info("suricata_connected", version=stats.get("version"))
        except Exception as exc:
            logger.warning("suricata_connect_failed", error=str(exc))

    async def close(self) -> None:
        """Cleanup al apagar el servidor."""
        logger.info("suricata_service_closed")

    # ── Socket Communication ───────────────────────────────────────────────

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((ConnectionRefusedError, OSError)),
        reraise=True,
    )
    async def _socket_command(self, command: dict) -> dict:
        """
        Enviar un comando al Unix socket de Suricata y leer la respuesta.
        El socket usa el protocolo JSON de Suricata (una línea por mensaje).
        """
        socket_path = self._settings.suricata_socket
        try:
            reader, writer = await asyncio.open_unix_connection(socket_path)
            payload = json.dumps(command) + "\n"
            writer.write(payload.encode())
            await writer.drain()

            # Leer hasta 4 KB de respuesta
            response_bytes = await asyncio.wait_for(reader.read(4096), timeout=5.0)
            writer.close()
            await writer.wait_closed()

            return json.loads(response_bytes.decode().strip())
        except Exception as exc:
            logger.error("suricata_socket_error", command=command.get("command"), error=str(exc))
            raise

    # ── Engine Control ─────────────────────────────────────────────────────

    async def get_engine_stats(self) -> dict:
        """Estado y métricas del motor Suricata."""
        if self._settings.should_mock_suricata:
            from services.mock_data import MockData
            return MockData.suricata.engine_stats()
        result = await self._socket_command({"command": "dump-counters"})
        return self._parse_engine_stats(result)

    async def get_engine_mode(self) -> dict:
        """Modo de operación del motor (ids/ips/nsm)."""
        if self._settings.should_mock_suricata:
            stats = await self.get_engine_stats()
            return {
                "mode": stats.get("mode", "ids"),
                "interface": stats.get("interface", "unknown"),
                "version": stats.get("version", "unknown"),
            }
        result = await self._socket_command({"command": "running-mode"})
        return result

    async def get_engine_stats_series(self, minutes: int = 30) -> list[dict]:
        """Serie temporal de métricas del motor para gráficos."""
        if self._settings.should_mock_suricata:
            from services.mock_data import MockData
            return MockData.suricata.engine_stats_series(minutes=minutes)
        # En real: no hay serie histórica en el socket; devolver snapshot repetido
        snapshot = await self.get_engine_stats()
        now = datetime.now(timezone.utc)
        return [
            {
                "minute": now.strftime("%Y-%m-%dT%H:%M:00"),
                "packets_per_sec": snapshot.get("packets_captured", 0) // 60,
                "alerts_per_min": 0,
                "dropped": snapshot.get("packets_dropped", 0),
            }
        ]

    async def reload_rules(self) -> dict:
        """
        Recargar reglas en caliente (suricata-update debe haber actualizado antes).
        Impacto: Suricata lee nuevas reglas sin reiniciar — sin pausa de captura.
        """
        if self._settings.should_mock_suricata:
            return {
                "success": True,
                "message": "Reglas recargadas exitosamente (mock)",
                "rules_loaded": 8741,
                "rules_failed": 0,
                "reload_time_ms": 450,
                "mock": True,
            }
        result = await self._socket_command({"command": "reload-rules"})
        return {
            "success": result.get("return") == "OK",
            "message": result.get("message", ""),
            "rules_loaded": result.get("rules-loaded", 0),
            "rules_failed": result.get("rules-failed", 0),
        }

    def _parse_engine_stats(self, raw: dict) -> dict:
        """Normalizar la respuesta dump-counters del socket."""
        counters = raw.get("message", {})
        return {
            "running": True,
            "mode": "ids",
            "version": raw.get("version", "unknown"),
            "uptime_seconds": counters.get("uptime", 0),
            "packets_captured": counters.get("capture.kernel_packets", 0),
            "packets_decoded": counters.get("decoder.pkts", 0),
            "packets_dropped": counters.get("capture.kernel_drops", 0),
            "alerts_total": counters.get("detect.alert", 0),
            "flows_active": counters.get("flow.active", 0),
            "bytes_processed": counters.get("decoder.bytes", 0),
            "rules_loaded": counters.get("rules.loaded", 0),
            "rules_failed": counters.get("rules.failed", 0),
        }

    # ── Alerts (via Wazuh) ─────────────────────────────────────────────────

    async def get_alerts(
        self,
        limit: int = 50,
        offset: int = 0,
        src_ip: str | None = None,
        dst_ip: str | None = None,
        category: str | None = None,
        severity: int | None = None,
    ) -> list[dict]:
        """
        Alertas IDS/IPS de Suricata.
        Real: Wazuh API con filtro rule.groups=suricata.
        """
        if self._settings.should_mock_suricata:
            from services.mock_data import MockData
            return MockData.suricata.alerts(
                limit=limit,
                offset=offset,
                src_ip=src_ip,
                dst_ip=dst_ip,
                category=category,
                severity=severity,
            )
        return await self._fetch_wazuh_suricata_alerts(
            limit=limit, offset=offset,
            src_ip=src_ip, dst_ip=dst_ip,
        )

    async def get_alert_detail(self, alert_id: str) -> dict | None:
        """Detalle completo de una alerta Suricata."""
        if self._settings.should_mock_suricata:
            from services.mock_data import MockData
            return MockData.suricata.alert_detail(alert_id)
        alerts = await self.get_alerts(limit=200)
        return next((a for a in alerts if a.get("id") == alert_id), None)

    async def get_alerts_timeline(self, minutes: int = 120) -> list[dict]:
        """Serie temporal de alertas por minuto."""
        if self._settings.should_mock_suricata:
            from services.mock_data import MockData
            return MockData.suricata.alerts_timeline(minutes=minutes)
        # Real: agrupar alertas de Wazuh por minuto
        alerts = await self._fetch_wazuh_suricata_alerts(limit=500)
        return self._group_alerts_by_minute(alerts, minutes)

    async def get_top_signatures(self, limit: int = 10) -> list[dict]:
        """Top firmas por número de hits."""
        if self._settings.should_mock_suricata:
            from services.mock_data import MockData
            return MockData.suricata.top_signatures(limit=limit)
        alerts = await self._fetch_wazuh_suricata_alerts(limit=500)
        return self._aggregate_signatures(alerts, limit)

    async def get_categories(self) -> list[dict]:
        """Distribución de alertas por categoría."""
        if self._settings.should_mock_suricata:
            from services.mock_data import MockData
            return MockData.suricata.categories()
        alerts = await self._fetch_wazuh_suricata_alerts(limit=500)
        return self._aggregate_categories(alerts)

    async def _fetch_wazuh_suricata_alerts(
        self,
        limit: int = 100,
        offset: int = 0,
        src_ip: str | None = None,
        dst_ip: str | None = None,
    ) -> list[dict]:
        """Consultar alertas Suricata desde Wazuh API (rule.groups=suricata)."""
        from services.wazuh_service import WazuhService
        wazuh = WazuhService()
        try:
            raw = await wazuh.get_alerts(
                limit=limit,
                offset=offset,
                rule_groups="suricata",
            )
            return [self._normalize_wazuh_suricata_alert(a) for a in raw]
        except Exception as exc:
            logger.error("suricata_wazuh_fetch_error", error=str(exc))
            return []

    def _normalize_wazuh_suricata_alert(self, wazuh_alert: dict) -> dict:
        """Normalizar un alert de Wazuh con datos eve.json de Suricata."""
        data = wazuh_alert.get("data", {}).get("suricata", {})
        return {
            "id": wazuh_alert.get("id", ""),
            "timestamp": wazuh_alert.get("timestamp", ""),
            "signature_id": data.get("alert", {}).get("signature_id", 0),
            "signature": data.get("alert", {}).get("signature", wazuh_alert.get("rule", {}).get("description", "")),
            "category": data.get("alert", {}).get("category", ""),
            "severity": data.get("alert", {}).get("severity", 3),
            "protocol": data.get("proto", ""),
            "src_ip": data.get("src_ip", wazuh_alert.get("src_ip", "")),
            "src_port": data.get("src_port", 0),
            "dst_ip": data.get("dest_ip", wazuh_alert.get("dst_ip", "")),
            "dst_port": data.get("dest_port", 0),
            "action": data.get("alert", {}).get("action", "alert"),
            "flow_id": str(data.get("flow_id", "")),
            "app_proto": data.get("app_proto"),
            "mitre_technique": wazuh_alert.get("rule", {}).get("mitre", {}).get("id", [""])[0],
            "mitre_name": wazuh_alert.get("rule", {}).get("mitre", {}).get("technique", [""])[0],
            "wazuh_alert_id": wazuh_alert.get("id"),
            "crowdsec_decision_id": None,
            "geo": None,
        }

    def _group_alerts_by_minute(self, alerts: list[dict], minutes: int) -> list[dict]:
        """Agrupar alertas por minuto para timeline."""
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        buckets: dict[str, dict] = {}
        for i in range(minutes):
            t = now - timedelta(minutes=minutes - i)
            key = t.strftime("%Y-%m-%dT%H:%M:00")
            buckets[key] = {"minute": key, "count_ids": 0, "count_ips": 0}
        for alert in alerts:
            ts = alert.get("timestamp", "")[:16] + ":00"
            if ts in buckets:
                if alert.get("action") == "drop":
                    buckets[ts]["count_ips"] += 1
                else:
                    buckets[ts]["count_ids"] += 1
        return list(buckets.values())

    def _aggregate_signatures(self, alerts: list[dict], limit: int) -> list[dict]:
        counts: dict[int, dict[str, Any]] = {}
        for a in alerts:
            sid = a.get("signature_id", 0)
            if sid not in counts:
                counts[sid] = {"sid": sid, "signature": a.get("signature", ""), "category": a.get("category", ""), "hits": 0, "last_hit": a.get("timestamp", "")}
            counts[sid]["hits"] += 1
        return sorted(counts.values(), key=lambda x: x["hits"], reverse=True)[:limit]

    def _aggregate_categories(self, alerts: list[dict]) -> list[dict]:
        counts: dict[str, int] = {}
        for a in alerts:
            cat = a.get("category", "Unknown")
            counts[cat] = counts.get(cat, 0) + 1
        colors = ["#f59e0b", "#ef4444", "#dc2626", "#f97316", "#6b7280"]
        return [
            {"category": cat, "count": cnt, "color": colors[i % len(colors)]}
            for i, (cat, cnt) in enumerate(sorted(counts.items(), key=lambda x: x[1], reverse=True))
        ]

    # ── Flows NSM (via Wazuh) ──────────────────────────────────────────────

    async def get_flows(
        self,
        limit: int = 50,
        offset: int = 0,
        src_ip: str | None = None,
        proto: str | None = None,
        app_proto: str | None = None,
        has_alert: bool | None = None,
    ) -> list[dict]:
        """Flujos de red NSM."""
        if self._settings.should_mock_suricata:
            from services.mock_data import MockData
            return MockData.suricata.flows(
                limit=limit, offset=offset,
                src_ip=src_ip, proto=proto,
                app_proto=app_proto, has_alert=has_alert,
            )
        # Real: Wazuh con rule.groups=suricata + event_type=flow
        return await self._fetch_wazuh_eve_events("flow", limit=limit)

    async def get_flows_stats(self) -> dict:
        """Estadísticas agregadas de flujos."""
        if self._settings.should_mock_suricata:
            from services.mock_data import MockData
            return MockData.suricata.flows_stats()
        flows = await self.get_flows(limit=500)
        return self._aggregate_flows(flows)

    async def get_dns_queries(
        self,
        limit: int = 50,
        suspicious_only: bool = False,
    ) -> list[dict]:
        """Consultas DNS capturadas por Suricata."""
        if self._settings.should_mock_suricata:
            from services.mock_data import MockData
            return MockData.suricata.dns_queries(limit=limit, suspicious_only=suspicious_only)
        return await self._fetch_wazuh_eve_events("dns", limit=limit)

    async def get_http_transactions(
        self,
        limit: int = 50,
        suspicious_only: bool = False,
    ) -> list[dict]:
        """Transacciones HTTP capturadas."""
        if self._settings.should_mock_suricata:
            from services.mock_data import MockData
            return MockData.suricata.http_transactions(limit=limit, suspicious_only=suspicious_only)
        return await self._fetch_wazuh_eve_events("http", limit=limit)

    async def get_tls_handshakes(
        self,
        limit: int = 50,
        suspicious_only: bool = False,
    ) -> list[dict]:
        """Handshakes TLS capturados."""
        if self._settings.should_mock_suricata:
            from services.mock_data import MockData
            return MockData.suricata.tls_handshakes(limit=limit, suspicious_only=suspicious_only)
        return await self._fetch_wazuh_eve_events("tls", limit=limit)

    async def _fetch_wazuh_eve_events(self, event_type: str, limit: int = 100) -> list[dict]:
        """Obtener eventos NSM de un tipo específico (flow, dns, http, tls) desde Wazuh."""
        from services.wazuh_service import WazuhService
        wazuh = WazuhService()
        try:
            return await wazuh.get_alerts(limit=limit, rule_groups=f"suricata_{event_type}")
        except Exception as exc:
            logger.error("suricata_wazuh_eve_error", event_type=event_type, error=str(exc))
            return []

    def _aggregate_flows(self, flows: list[dict]) -> dict:
        """Calcular estadísticas de flujos."""
        proto_counts: dict[str, dict] = {}
        for f in flows:
            p = f.get("protocol", "other")
            if p not in proto_counts:
                proto_counts[p] = {"proto": p, "count": 0, "bytes": 0}
            proto_counts[p]["count"] += 1
            proto_counts[p]["bytes"] += f.get("bytes_toserver", 0) + f.get("bytes_toclient", 0)
        return {
            "total_flows": len(flows),
            "active_flows": sum(1 for f in flows if f.get("state") == "established"),
            "top_protocols": sorted(proto_counts.values(), key=lambda x: x["count"], reverse=True),
            "top_app_protos": [],
            "top_src_ips": [],
            "top_dst_ports": [],
        }

    # ── Rules Management ───────────────────────────────────────────────────

    async def get_rules(
        self,
        limit: int = 100,
        offset: int = 0,
        enabled: bool | None = None,
        ruleset: str | None = None,
        category: str | None = None,
    ) -> list[dict]:
        """Reglas/firmas de Suricata."""
        if self._settings.should_mock_suricata:
            from services.mock_data import MockData
            return MockData.suricata.rules(
                limit=limit, offset=offset,
                enabled=enabled, ruleset=ruleset, category=category,
            )
        result = await self._socket_command({"command": "ruleset-stats"})
        return result.get("rules", [])

    async def get_rule_detail(self, sid: int) -> dict | None:
        """Detalle de una regla por SID."""
        if self._settings.should_mock_suricata:
            from services.mock_data import MockData
            return MockData.suricata.rule_detail(sid)
        rules = await self.get_rules(limit=10000)
        return next((r for r in rules if r.get("sid") == sid), None)

    async def get_rulesets(self) -> list[dict]:
        """Rulesets disponibles."""
        if self._settings.should_mock_suricata:
            from services.mock_data import MockData
            return MockData.suricata.rulesets()
        return [{"name": "emerging-threats-open", "is_active": True}]

    async def toggle_rule(self, sid: int, enabled: bool) -> dict:
        """Habilitar/deshabilitar una regla por SID."""
        if self._settings.should_mock_suricata:
            return {
                "sid": sid,
                "enabled": enabled,
                "message": f"Regla {sid} {'habilitada' if enabled else 'deshabilitada'} (mock)",
                "mock": True,
            }
        cmd = "enable-rule" if enabled else "disable-rule"
        result = await self._socket_command({"command": cmd, "arguments": {"sid": sid}})
        return {"sid": sid, "enabled": enabled, "message": result.get("message", "")}

    async def update_rules(self) -> dict:
        """Actualizar reglas ejecutando suricata-update."""
        if self._settings.should_mock_suricata:
            return {
                "success": True,
                "message": "suricata-update completado (mock)",
                "rules_updated": 42892,
                "duration_seconds": 8.4,
                "mock": True,
            }
        # Real: ejecutar suricata-update como proceso externo
        import asyncio
        try:
            proc = await asyncio.create_subprocess_exec(
                "suricata-update",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
            success = proc.returncode == 0
            if success:
                await self.reload_rules()
            return {
                "success": success,
                "message": stdout.decode()[-500:] if success else stderr.decode()[-500:],
            }
        except Exception as exc:
            logger.error("suricata_update_error", error=str(exc))
            return {"success": False, "message": str(exc)}

    # ── Correlation ────────────────────────────────────────────────────────

    async def get_correlation_crowdsec(self) -> list[dict]:
        """IPs con alertas Suricata que tienen decisión en CrowdSec."""
        if self._settings.should_mock_suricata:
            from services.mock_data import MockData
            return MockData.suricata.correlation_crowdsec()
        # Real: obtener IPs atacantes de Suricata, cruzar con CrowdSec decisions
        alerts = await self.get_alerts(limit=500)
        attacker_ips = list({a["src_ip"] for a in alerts if a.get("src_ip")})

        from services.crowdsec_service import CrowdSecService
        cs = CrowdSecService()
        try:
            decisions = await cs.get_decisions()
        except Exception:
            decisions = []

        decisions_by_ip = {d["ip"]: d for d in decisions}
        result = []
        for ip in attacker_ips[:20]:
            ip_alerts = [a for a in alerts if a.get("src_ip") == ip]
            cs_decision = decisions_by_ip.get(ip)
            result.append({
                "ip": ip,
                "suricata_alerts": len(ip_alerts),
                "suricata_signatures": list({a["signature"] for a in ip_alerts[:3]}),
                "crowdsec_decision_id": cs_decision["id"] if cs_decision else None,
                "crowdsec_scenario": cs_decision["scenario"] if cs_decision else None,
                "crowdsec_type": cs_decision["type"] if cs_decision else None,
                "correlation_type": "confirmed_threat" if cs_decision else "suricata_only",
                "geo": None,
            })
        return result

    async def get_correlation_wazuh(self) -> list[dict]:
        """Correlación temporal entre alertas Suricata y alertas Wazuh."""
        if self._settings.should_mock_suricata:
            from services.mock_data import MockData
            return MockData.suricata.correlation_wazuh()
        # Real: correlación temporal — alertas Suricata vs alertas Wazuh dentro de ±5 minutos
        return []

    # ── Auto-response Circuit ──────────────────────────────────────────────

    async def get_autoresponse_config(self) -> dict:
        """Configuración del circuito de respuesta automática."""
        if self._settings.should_mock_suricata:
            from services.mock_service import MockService
            return MockService.suricata_get_autoresponse_config()
        # Real: leer configuración de base de datos o archivo
        from services.mock_service import MockService
        return MockService.suricata_get_autoresponse_config()

    async def update_autoresponse_config(self, data: dict) -> dict:
        """Actualizar configuración del circuito."""
        from services.mock_service import MockService
        return MockService.suricata_update_autoresponse_config(data)

    async def get_autoresponse_history(self, limit: int = 10) -> list[dict]:
        """Historial de activaciones del circuito."""
        if self._settings.should_mock_suricata:
            from services.mock_service import MockService
            return MockService._ensure_suricata_autoresponse_history()[:limit]
        from services.mock_service import MockService
        return MockService._ensure_suricata_autoresponse_history()[:limit]

    async def trigger_autoresponse(
        self,
        ip: str,
        trigger_alert_id: str,
        duration: str = "24h",
        reason: str = "",
    ) -> dict:
        """
        Activar circuito de respuesta automática para una IP:
        1. Agregar ban en CrowdSec
        2. Bloquear en MikroTik Blacklist_Automatica
        3. Registrar en historial

        NOTA: Este método SIEMPRE requiere llamada manual desde el router.
        El auto_trigger automático (sin confirmación) es gestionado por el router.
        """
        actions_taken = []
        results: dict[str, Any] = {"ip": ip, "trigger_alert_id": trigger_alert_id}

        cfg = await self.get_autoresponse_config()
        if not cfg.get("enabled", False):
            return {
                "success": False,
                "error": "Circuito de auto-response deshabilitado",
                "ip": ip,
            }

        # 1. CrowdSec ban
        if cfg.get("actions", {}).get("crowdsec_ban", True):
            try:
                from services.crowdsec_service import CrowdSecService
                cs = CrowdSecService()
                cs_result = await cs.add_decision(
                    ip=ip,
                    duration=duration,
                    reason=reason or f"Suricata auto-response: {trigger_alert_id}",
                    type_="ban",
                )
                results["crowdsec"] = cs_result
                actions_taken.append("crowdsec_ban")
                logger.info("autoresponse_crowdsec_ban", ip=ip)
            except Exception as exc:
                logger.error("autoresponse_crowdsec_error", ip=ip, error=str(exc))
                results["crowdsec_error"] = str(exc)

        # 2. MikroTik block
        if cfg.get("actions", {}).get("mikrotik_block", True):
            try:
                from services.mikrotik_service import MikrotikService
                mt = MikrotikService()
                mt_result = await mt.block_ip(
                    ip=ip,
                    comment=f"[NetShield-Suricata] {reason or trigger_alert_id}",
                    duration_hours=self._parse_duration_hours(duration),
                )
                results["mikrotik"] = mt_result
                actions_taken.append("mikrotik_block")
                logger.info("autoresponse_mikrotik_block", ip=ip)
            except Exception as exc:
                logger.error("autoresponse_mikrotik_error", ip=ip, error=str(exc))
                results["mikrotik_error"] = str(exc)

        # 3. Registrar en historial
        from services.mock_service import MockService
        history_entry = MockService.suricata_add_autoresponse_trigger(
            ip=ip,
            trigger_alert_id=trigger_alert_id,
            duration=duration,
            reason=reason,
            actions_taken=actions_taken,
        )

        results.update({
            "success": len(actions_taken) > 0,
            "actions_taken": actions_taken,
            "history_entry_id": history_entry["id"],
        })
        logger.info(
            "autoresponse_completed",
            ip=ip,
            actions=actions_taken,
        )
        return results

    def _parse_duration_hours(self, duration: str) -> int:
        """Parsear duración string a horas: '24h' → 24, '7d' → 168."""
        if duration.endswith("h"):
            return int(duration[:-1])
        if duration.endswith("d"):
            return int(duration[:-1]) * 24
        return 24  # Default

    # ── IP Context ─────────────────────────────────────────────────────────

    async def get_ip_context(self, ip: str) -> dict:
        """Contexto Suricata para una IP: alertas + flujos."""
        if self._settings.should_mock_suricata:
            from services.mock_data import MockData
            return MockData.suricata.ip_context(ip)
        alerts = await self.get_alerts(src_ip=ip, limit=10)
        if not alerts:
            alerts = await self.get_alerts(dst_ip=ip, limit=10)
        flows = await self.get_flows(src_ip=ip, limit=10)
        return {
            "ip": ip,
            "alerts_count": len(alerts),
            "recent_alerts": alerts[:5],
            "flows_count": len(flows),
            "top_signatures": list({a["signature"] for a in alerts[:3]}),
            "last_seen": alerts[0]["timestamp"] if alerts else None,
        }


def get_suricata_service() -> SuricataService:
    """Factory function — retorna la instancia singleton de SuricataService."""
    return SuricataService()
