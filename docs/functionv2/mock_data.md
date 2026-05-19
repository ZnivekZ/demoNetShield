# Sistema Mock — Documentación Funcional

## Descripción General

NetShield implementa un **sistema de mock completo** que permite ejecutar el dashboard sin conexión a servicios externos (MikroTik, Wazuh, CrowdSec, Suricata, GLPI, GeoIP). El sistema tiene dos capas: **MockData** (datos estáticos) y **MockService** (facade CRUD en memoria para operaciones stateful).

---

## Configuración — `backend/config.py`

### Flags individuales

| Variable | Default | Servicio controlado |
|---|---|---|
| `MOCK_MIKROTIK` | `true` | MikroTik RouterOS (ARP, firewall, VLANs, hotspot, DNS) |
| `MOCK_WAZUH` | `true` | Wazuh SIEM (agentes, alertas, active response) |
| `MOCK_CROWDSEC` | `true` | CrowdSec LAPI (decisiones, alertas, bouncers) |
| `MOCK_SURICATA` | `true` | Suricata IDS/IPS (motor, stats, reglas) |
| `MOCK_GLPI` | `true` | GLPI ITSM (assets, tickets, usuarios) |
| `MOCK_GEOIP` | `true` | GeoLite2 (lookups geográficos) |
| `MOCK_AI` | `false` | Claude AI (reportes). Default false — siempre necesita API key. |
| `MOCK_TELEGRAM` | `true` | Bot Telegram. |
| `MOCK_PORTAL` | `true` | Portal Cautivo / Hotspot. |

### Flag global

```python
MOCK_ALL: bool = True  # Si true, overridea todos los flags a true
```

### Propiedad computed

```python
@property
def should_mock_mikrotik(self) -> bool:
    return self.MOCK_ALL or self.MOCK_MIKROTIK
```

Este patrón se repite para cada servicio: `should_mock_X`.

---

## MockData — Datos Estáticos

**Archivo:** `backend/services/mock_data.py` (139 KB)

Clase con propiedades estáticas que retornan datos ficticios consistentes. Los datos forman un "backbone" coherente donde las mismas IPs, MACs, y nombres aparecen en múltiples servicios.

### Backbone de Entidades Compartidas

| IP | MAC | Nombre | Módulos |
|---|---|---|---|
| `10.10.10.1` | `02:42:AC:11:00:01` | Gateway | ARP, Labels, VLAN 10 |
| `10.10.10.5` | `02:42:AC:11:00:05` | Ubuntu-PC | ARP, Wazuh Agent 003, GLPI, CrowdSec alerts |
| `10.10.20.3` | `02:42:AC:11:00:23` | Win-PC | ARP, Wazuh Agent 004, Phishing alerts |
| `45.12.34.5` | — | Atacante externo | CrowdSec decisions, Wazuh alerts, GeoIP (Russia) |
| `185.220.101.42` | — | Tor exit node | CrowdSec, GeoIP (Germany) |

### Namespaces de MockData

| Namespace | Métodos | Líneas aprox. |
|---|---|---|
| `MockData.mikrotik` | `interfaces()`, `arp_table()`, `firewall_rules()`, `vlans()`, `vlan_traffic()`, `vlan_addresses()`, `connections()`, `logs()`, `health()`, `dns_sinkhole()`, `hotspot_*()` | ~500 |
| `MockData.wazuh` | `agents()`, `alerts()`, `critical_alerts()`, `timeline()`, `top_agents()`, `agents_summary()`, `mitre_summary()`, `health()` | ~400 |
| `MockData.crowdsec` | `decisions()`, `alerts()`, `bouncers()`, `machines()`, `scenarios()`, `metrics()`, `hub()`, `ip_context(ip)`, `sync_status()` | ~300 |
| `MockData.suricata` | `status()`, `stats()`, `alerts()`, `rules_files()`, `nsm_*()` | ~200 |
| `MockData.glpi` | `computers()`, `tickets()`, `users()`, `locations()`, `asset_stats()` | ~300 |
| `MockData.geoip` | `lookup(ip)`, `top_countries()`, `suggestions()` | ~100 |
| `MockData.phishing` | `alerts()`, `sinkhole()`, `stats()` | ~100 |
| `MockData.websocket` | `vlan_traffic_tick(tick)`, `wazuh_alerts_tick(tick)`, `traffic_tick(tick)` | ~150 |

---

## MockService — Facade CRUD en Memoria

**Archivo:** `backend/services/mock_service.py`

Clase con estado en memoria para operaciones que necesitan persistencia temporal (whitelist, decisions, etc.):

| Método | Operación | Estado |
|---|---|---|
| `crowdsec_get_whitelist()` | Listar whitelist | `_whitelist: list[dict]` |
| `crowdsec_add_whitelist(ip, reason)` | Agregar a whitelist | Append con auto-increment ID |
| `crowdsec_delete_whitelist(id)` | Eliminar de whitelist | Filter by ID |
| `phishing_add_sinkhole(domain)` | Agregar sinkhole | `_sinkhole: list[dict]` |
| `phishing_delete_sinkhole(id)` | Eliminar sinkhole | Filter by ID |

> [!NOTE]
> MockService pierde estado al reiniciar el backend. Es intencional — está diseñado para desarrollo, no para producción.

---

## Mock Guard Pattern

Cada método de servicio implementa el guard al **inicio del método** (no en el router):

```python
# En services/mikrotik_service.py
async def get_vlans(self) -> list[dict]:
    if self._settings.should_mock_mikrotik:
        from services.mock_data import MockData
        return MockData.mikrotik.vlans()
    # ... código real con routeros-api
```

**Razón:** Los guards van en servicios (no en routers) para que los **WebSockets** también los respeten — los WebSockets llaman directamente a los servicios, no a los routers.

---

## WebSocket Mock Data

Los WebSockets usan `MockData.websocket.*_tick(tick)` para generar datos dinámicos:

```python
class MockWebsocketData:
    @staticmethod
    def vlan_traffic_tick(tick: int) -> dict:
        # tick 0-39 (ciclo de 40)
        base_rx = 4_200_000
        jitter = random.uniform(-0.12, 0.12)
        rx = base_rx * (1 + jitter)

        # VLAN 10 entra en alert entre tick 10-24
        status = "alert" if 10 <= (tick % 40) <= 24 else "ok"
        
        return {
            "type": "vlan_traffic",
            "data": {"vlans": [...], "timestamp": now()}
        }
```

---

## Archivos Involucrados

| Archivo | Rol |
|---|---|
| [config.py](file:///home/nivek/Documents/netShield2/backend/config.py) | 9 flags mock + `MOCK_ALL` + `should_mock_*` properties |
| [mock_data.py](file:///home/nivek/Documents/netShield2/backend/services/mock_data.py) | Datos estáticos (139 KB): 8 namespaces con backbone coherente |
| [mock_service.py](file:///home/nivek/Documents/netShield2/backend/services/mock_service.py) | Facade CRUD en memoria para whitelist, sinkhole |
