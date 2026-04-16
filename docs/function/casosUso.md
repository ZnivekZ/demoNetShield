# Casos de Uso — NetShield Dashboard

> **Fuente de verdad:** Código de routers en `backend/routers/*.py`.  
> Si existe discrepancia entre este documento y un `.md` anterior, prevalece este documento.  
> Los datos de ejemplo usan los valores reales de `backend/services/mock_data.py`.

---

## Tabla de Referencia Rápida

| # | Caso de uso | Herramienta | Método | Ruta | APIs involucradas |
|---|-------------|-------------|--------|------|-------------------|
| 1 | Ver estado de interfaces en tiempo real | MikroTik | GET | `/api/mikrotik/interfaces` | MikroTik API |
| 2 | Bloquear IP manualmente desde el dashboard | MikroTik | POST | `/api/mikrotik/firewall/block` | MikroTik API + DB |
| 3 | Desbloquear IP de la blacklist | MikroTik | DELETE | `/api/mikrotik/firewall/block` | MikroTik API + DB |
| 4 | Ver conexiones activas y detectar una sospechosa | MikroTik | GET | `/api/mikrotik/connections` | MikroTik API |
| 5 | Consultar tabla ARP para identificar un dispositivo | MikroTik | GET | `/api/mikrotik/arp` | MikroTik API |
| 6 | Ver salud del sistema MikroTik | MikroTik | GET | `/api/mikrotik/health` | MikroTik API |
| 7 | Crear VLAN nueva para un grupo de usuarios | VLANs | POST | `/api/mikrotik/vlans/` | MikroTik API |
| 8 | Ver tráfico en tiempo real de una VLAN específica | VLANs | GET + WS | `/api/mikrotik/vlans/{id}/traffic` + `/ws/vlans/traffic` | MikroTik API |
| 9 | Detectar VLAN con alerta activa | VLANs | GET | `/api/mikrotik/vlans/{id}/alerts` | MikroTik API + Wazuh API |
| 10 | Eliminar VLAN obsoleta | VLANs | DELETE | `/api/mikrotik/vlans/{vlan_id}` | MikroTik API |
| 11 | Ver alertas críticas de las últimas 24 horas | Wazuh | GET | `/api/wazuh/alerts/critical` | Wazuh API |
| 12 | Identificar el agente más atacado | Wazuh | GET | `/api/wazuh/agents/top` | Wazuh API |
| 13 | Ver técnica MITRE de un ataque en curso | Wazuh | GET | `/api/wazuh/mitre/summary` | Wazuh API |
| 14 | Consultar el último incidente crítico | Wazuh | GET | `/api/wazuh/alerts/last-critical` | Wazuh API |
| 15 | Filtrar alertas por agente específico | Wazuh | GET | `/api/wazuh/alerts/agent/{agent_id}` | Wazuh API |
| 16 | Ejecutar active response sobre un agente | Wazuh | POST | `/api/wazuh/active-response` | Wazuh API + DB |
| 17 | Detectar campaña de phishing activa en el timeline | Phishing | GET | `/api/phishing/urls/timeline` | Wazuh API |
| 18 | Agregar dominio malicioso al sinkhole | Phishing | POST | `/api/phishing/domains/sinkhole` | MikroTik API + DB |
| 19 | Ver qué usuarios hicieron clic en un link malicioso | Phishing | GET | `/api/phishing/victims` | Wazuh API |
| 20 | Bloquear IP origen de campaña de phishing | Phishing | POST | `/api/phishing/ip/block` | MikroTik API + DB |
| 21 | Simular alerta de phishing en lab | Phishing | POST | `/api/phishing/simulate` | Internal |
| 22 | Ver sesiones activas y detectar consumo excesivo | Portal Cautivo | GET + WS | `/api/portal/sessions/active` + `/ws/portal/sessions` | MikroTik API |
| 23 | Registrar usuario nuevo en el Hotspot | Portal Cautivo | POST | `/api/portal/users` | MikroTik API + DB |
| 24 | Desconectar usuario manualmente | Portal Cautivo | POST | `/api/portal/users/{username}/disconnect` | MikroTik API + DB |
| 25 | Cambiar velocidad de usuarios no registrados | Portal Cautivo | PUT | `/api/portal/config/unregistered-speed` | MikroTik API + DB |
| 26 | Configurar horario de acceso al Hotspot | Portal Cautivo | PUT | `/api/portal/config/schedule` | MikroTik API + DB |
| 27 | Buscar ficha técnica de un equipo por IP | GLPI | GET | `/api/glpi/assets/search` | GLPI API |
| 28 | Registrar equipo nuevo en el inventario | GLPI | POST | `/api/glpi/assets` | GLPI API + DB |
| 29 | Ver equipos asignados a un docente específico | GLPI | GET | `/api/glpi/users/{user_id}/assets` | GLPI API |
| 30 | Crear ticket de mantenimiento desde el dashboard | GLPI | POST | `/api/glpi/tickets` | GLPI API + DB |
| 31 | Ver mapa de ubicación y listar equipos de un aula | GLPI | GET | `/api/glpi/assets/by-location/{location_id}` | GLPI API |
| 32 | Ver salud cruzada de activos (GLPI+Wazuh+ARP) | GLPI | GET | `/api/glpi/assets/health` | GLPI + Wazuh + MikroTik |
| 33 | Bloqueo coordinado: Wazuh detecta → MikroTik bloquea | Seg. Híbrida | POST | `/api/security/auto-block` | MikroTik API + Wazuh API + DB |
| 34 | Poner equipo en cuarentena (MikroTik + GLPI) | Seg. Híbrida | POST | `/api/security/quarantine` + `/api/glpi/assets/{id}/quarantine` | Wazuh + MikroTik + GLPI + DB |
| 35 | Geo-blocking de un país con múltiples alertas | Seg. Híbrida | POST | `/api/security/geo-block` | MikroTik API + DB |
| 36 | Buscar IP y ver contexto en MikroTik+Wazuh+GLPI | Seg. Híbrida | GET | `/api/network/search` | MikroTik + Wazuh + GLPI |
| 37 | Sincronizar blacklist entre MikroTik y el sistema | Seg. Híbrida | GET + POST | `/api/crowdsec/sync/status` + `/api/crowdsec/sync/apply` | CrowdSec + MikroTik |
| 38 | Ver decisiones activas y score de reputación global | CrowdSec | GET | `/api/crowdsec/decisions` | CrowdSec LAPI |
| 39 | Bloqueo completo en todas las capas para una IP | CrowdSec | POST | `/api/crowdsec/remediation/full` | CrowdSec + MikroTik + DB |
| 40 | Detectar desincronización entre CrowdSec y MikroTik | CrowdSec | GET | `/api/crowdsec/sync/status` | CrowdSec + MikroTik |
| 41 | Agregar IP a whitelist para evitar falsos positivos | CrowdSec | POST | `/api/crowdsec/whitelist` | Local DB |
| 42 | Ver contexto completo de una IP | CrowdSec | GET | `/api/crowdsec/context/ip/{ip}` | CrowdSec + MikroTik + Wazuh |
| 43 | Generar reporte ejecutivo de incidentes del día | Reportes IA | POST | `/api/reports/generate` | Anthropic API + Wazuh + MikroTik |
| 44 | Generar reporte técnico para el equipo de IT | Reportes IA | POST | `/api/reports/generate` | Anthropic API + Wazuh + MikroTik |
| 45 | Exportar reporte a PDF con datos seleccionados | Reportes IA | POST | `/api/reports/export-pdf` | Internal (WeasyPrint) |
| 46 | Buscar una IP y ver todos sus datos unificados | Buscador Global | GET | `/api/network/search` | MikroTik + Wazuh + GLPI |
| 47 | Buscar una MAC y encontrar el equipo en inventario | Buscador Global | GET | `/api/network/search` + `/api/mikrotik/arp/search` | MikroTik + GLPI |
| 48 | Ejecutar comando de consulta en RouterOS desde web | CLI | POST | `/api/cli/mikrotik` | MikroTik API |
| 49 | Ver estado o reiniciar un agente Wazuh desde web | CLI | POST | `/api/cli/wazuh-agent` | Wazuh API |

---

# MikroTik

## Caso de uso 1: Ver estado de interfaces en tiempo real

**Situación:**
El técnico quiere verificar si todas las interfaces del router están activas y sin errores antes de iniciar una jornada de soporte.

**Actor:** Técnico de redes

**Precondiciones:**
- Backend corriendo con acceso al MikroTik CHR (`192.168.100.118:8728`) o en modo `MOCK_MIKROTIK=true`

**Pasos:**

1. El usuario navega a **Red e IPs → Interfaces**
2. El frontend realiza una petición al backend:
   - Método: `GET`
   - Ruta: `/api/mikrotik/interfaces`
   - API externa: MikroTik API (`/interface print`)
3. El backend ejecuta `service.get_interfaces()` → llama a RouterOS en un `run_in_executor` para no bloquear el event loop
4. La API responde con lista de interfaces con estado, bytes RX/TX y contadores de errores
5. El frontend muestra una tabla: nombre, tipo, estado (running/disabled), RX, TX, errores, comentario

**Resultado:**
El técnico ve que `ether1` (WAN uplink) está activa, y que `ether3` (LAN – Aula 3) tiene `rx_error: 3` y `tx_error: 1`, lo que indica un posible problema de cable físico en esa interfaz.

**Datos de ejemplo (usando mock):**
```json
[
  {"id": "*1", "name": "ether1", "type": "ether", "running": true,
   "rx_byte": 8543210000, "tx_byte": 2100000000, "rx_error": 0, "comment": "WAN uplink"},
  {"id": "*3", "name": "ether3", "type": "ether", "running": true,
   "rx_byte": 1400000000, "rx_error": 3, "tx_error": 1, "comment": "LAN – Aula 3"}
]
```

**Casos de error posibles:**
- `"Failed to fetch interfaces: timed out"` → CHR no alcanzable → Verificar Tailscale y que el CHR esté encendido
- Badge de conexión en topbar en rojo → Reconexión automática con tenacity (3 intentos, backoff exponencial)

---

## Caso de uso 2: Bloquear IP manualmente desde el dashboard

**Situación:**
El técnico detecta conexiones repetidas desde `203.0.113.45` y decide bloquearla inmediatamente desde el panel Firewall.

**Actor:** Técnico de redes

**Precondiciones:**
- Panel Firewall visible, `ConfirmModal` aceptado por el usuario
- MikroTik conectado o modo mock

**Pasos:**

1. El usuario navega a **Firewall**
2. Escribe la IP `203.0.113.45` en el campo de bloqueo y un comentario `"Brute-force detectado — manual block"`
3. Hace clic en **Bloquear** → aparece `ConfirmModal`
4. Confirma la acción
5. El frontend llama:
   - Método: `POST`
   - Ruta: `/api/mikrotik/firewall/block`
   - API externa: MikroTik API (`/ip/firewall/filter add`)
   - Body:
```json
{"ip": "203.0.113.45", "comment": "Brute-force detectado — manual block", "duration": null}
```
6. El backend agrega regla `chain=forward, action=drop, src-address=203.0.113.45`
7. Guarda en `ActionLog`: `action_type="block"`, `target_ip="203.0.113.45"`
8. El frontend recarga la tabla de reglas

**Resultado:**
La IP `203.0.113.45` queda bloqueada. Aparece en la tabla de reglas con el comentario `[NetShield] Brute-force detectado — manual block`.

**Datos de ejemplo (usando mock):**
```json
{"id": "*1", "chain": "forward", "action": "drop",
 "comment": "[NetShield] Auto-block 203.0.113.45",
 "src_address": "203.0.113.45", "disabled": false, "bytes": 1024, "packets": 8}
```

**Casos de error posibles:**
- IP ya bloqueada → `"Failed to block IP: duplicate entry"` → La IP ya estaba en el firewall
- Formato inválido (ej. `"203.0.113"`) → Pydantic rechaza → `422 Unprocessable Entity`
- MikroTik desconectado → Reconexión automática con tenacity → Si persiste: error visible en frontend

---

## Caso de uso 3: Desbloquear IP de la blacklist

**Situación:**
Una IP fue bloqueada por error o el incidente se resolvió. El técnico necesita levantarle la restricción.

**Actor:** Técnico de redes

**Precondiciones:**
- La IP tiene al menos una regla `action=drop` en el firewall de MikroTik
- `ConfirmModal` aceptado

**Pasos:**

1. El usuario navega a **Firewall → Tabla de reglas**
2. Localiza la regla de `203.0.113.45` (identificable por el prefijo `[NetShield]` en el comentario)
3. Hace clic en **Desbloquear** → aparece `ConfirmModal`
4. Confirma
5. El frontend llama:
   - Método: `DELETE`
   - Ruta: `/api/mikrotik/firewall/block`
   - API externa: MikroTik API (`/ip/firewall/filter remove`)
   - Body:
```json
{"ip": "203.0.113.45"}
```
6. El backend encuentra todas las reglas `drop` con `src-address=203.0.113.45` y las elimina
7. Guarda en `ActionLog`: `action_type="unblock"`, lista de IDs removidos
8. El frontend recarga la tabla de reglas

**Resultado:**
La IP `203.0.113.45` desaparece de la tabla de reglas. El tráfico de esa IP vuelve a ser evaluado por las demás reglas del firewall.

**Datos de ejemplo (usando mock):**
```json
{"rules_removed": ["*1"], "ip": "203.0.113.45", "success": true}
```

**Casos de error posibles:**
- IP no encontrada → `"No matching rules found for 203.0.113.45"` → La IP ya estaba desbloqueada
- MikroTik desconectado → Reconexión automática → Si persiste: mensaje de error en frontend

---

## Caso de uso 4: Ver conexiones activas y detectar una sospechosa

**Situación:**
El técnico quiere revisar qué conexiones están establecidas en este momento para detectar tráfico anómalo hacia el exterior.

**Actor:** Técnico de redes

**Precondiciones:**
- Panel Dashboard o Red visible

**Pasos:**

1. El usuario navega a **Dashboard → Conexiones activas**
2. El frontend hace polling cada 5 segundos:
   - Método: `GET`
   - Ruta: `/api/mikrotik/connections`
   - API externa: MikroTik API (`/ip/firewall/connection`)
3. El backend devuelve la tabla de conntrack activa
4. El técnico filtra por `203.0.113.45` usando el buscador de la tabla
5. Ve una conexión `TCP established` en puerto 443 desde `192.168.88.10`

**Resultado:**
El técnico identifica que `lubuntu_desk_1 (192.168.88.10)` tiene una conexión activa con `203.0.113.45:443`, posible canal C2. Procede a bloquearlo desde el panel Firewall.

**Datos de ejemplo (usando mock):**
```json
[
  {"id": "conn-0", "protocol": "tcp", "state": "established",
   "src_address": "192.168.88.10:54321", "dst_address": "203.0.113.45:443",
   "bytes": 284531, "packets": 412},
  {"id": "conn-1", "protocol": "udp",
   "src_address": "192.168.88.11:49152", "dst_address": "8.8.8.8:53",
   "bytes": 1024, "packets": 18}
]
```

**Casos de error posibles:**
- MikroTik desconectado → tabla vacía con badge rojo en topbar
- Más de 1000 conexiones → frontend muestra máximo 50 filas con aviso de paginación

---

## Caso de uso 5: Consultar tabla ARP para identificar un dispositivo desconocido

**Situación:**
El técnico ve una IP desconocida en las alertas (`192.168.88.20`) y necesita saber a qué equipo físico corresponde.

**Actor:** Técnico de redes

**Precondiciones:**
- El dispositivo hizo tráfico recientemente (su entrada ARP no expiró)

**Pasos:**

1. El usuario navega a **Red e IPs → Tabla ARP**
2. Para la lista completa:
   - Método: `GET`
   - Ruta: `/api/mikrotik/arp`
   - API externa: MikroTik API (`/ip/arp`)
3. Para búsqueda específica:
   - Método: `GET`
   - Ruta: `/api/mikrotik/arp/search`
   - Parámetros: `?ip=192.168.88.20`
   - API externa: MikroTik API (`/ip/arp` filtrado)
4. El backend devuelve la entrada: IP, MAC, interfaz, comentario
5. El frontend muestra la entrada con la etiqueta asignada (si existe)

**Resultado:**
El técnico confirma que `192.168.88.20` es `PC-Aula3-01` (MAC `52:54:00:CC:DD:01`), conectado por `ether3` (Aula 3). Sabe exactamente en qué aula está el equipo.

**Datos de ejemplo (usando mock):**
```json
[
  {"ip_address": "192.168.88.20", "mac_address": "52:54:00:CC:DD:01",
   "interface": "ether3", "comment": "PC-Aula3-01", "dynamic": true, "complete": true}
]
```

**Casos de error posibles:**
- IP no en tabla ARP → resultado vacío → El dispositivo no está conectado o no generó tráfico recientemente
- Sin parámetros `ip` ni `mac` → `400: "Either 'ip' or 'mac' query parameter is required"`

---

## Caso de uso 6: Ver salud del sistema MikroTik

**Situación:**
El técnico necesita reportar el estado del router en la reunión mensual: CPU, RAM y uptime.

**Actor:** Técnico de redes / Administrador

**Precondiciones:**
- Panel Sistema visible

**Pasos:**

1. El usuario navega a **Sistema → Salud MikroTik**
2. El frontend llama:
   - Método: `GET`
   - Ruta: `/api/mikrotik/health`
   - API externa: MikroTik API (`/system/resource`)
3. El backend ejecuta `service.get_system_health()` → devuelve métricas del sistema
4. El frontend muestra tarjetas: CPU%, RAM libre/total, disco libre, uptime, versión RouterOS

**Resultado:**
El técnico confirma que el CHR tiene `12% CPU`, `512 MB / 1024 MB RAM libre`, uptime `15d 4h 22m`, RouterOS `7.14.2 (stable)`. Sistema saludable, puede presentar el reporte.

**Datos de ejemplo (usando mock):**
```json
{
  "version": "7.14.2 (stable)", "uptime": "15d 4h 22m 13s",
  "cpu_load": 12, "free_memory": 536870912, "total_memory": 1073741824,
  "free_disk": 2147483648, "board_name": "CHR", "architecture_name": "x86_64"
}
```

**Casos de error posibles:**
- `"Failed to fetch MikroTik health: timed out"` → CHR no alcanzable → Verificar conectividad al CHR

---

# VLANs

## Caso de uso 7: Crear VLAN nueva para un grupo de usuarios

**Situación:**
El administrador necesita segmentar la red para el nuevo laboratorio de ciberseguridad antes de que lleguen los estudiantes.

**Actor:** Administrador de red

**Precondiciones:**
- Bridge configurado en el MikroTik (o modo mock activo)
- VLAN ID `40` disponible (no asignado)

**Pasos:**

1. El usuario navega a **Red e IPs → VLANs**
2. Hace clic en **Nueva VLAN**
3. Completa el formulario: VLAN ID `40`, nombre `vlan40`, interfaz `bridge`, comentario `"VLAN CiberSec Lab"`
4. El frontend llama:
   - Método: `POST`
   - Ruta: `/api/mikrotik/vlans/`
   - API externa: MikroTik API (`/interface/vlan add`)
   - Body:
```json
{"vlan_id": 40, "name": "vlan40", "interface": "bridge", "comment": "VLAN CiberSec Lab"}
```
5. MikroTik crea la interfaz y devuelve el ID interno (ej. `*E`)
6. El frontend recarga la lista de VLANs

**Resultado:**
La VLAN `40 — vlan40 (VLAN CiberSec Lab)` aparece en la tabla. El técnico puede asignarle un rango de IPs desde RouterOS.

**Datos de ejemplo (usando mock — VLANs existentes):**
```json
[
  {"id": "*A", "vlan_id": 10, "name": "vlan10", "comment": "VLAN Docentes", "running": true},
  {"id": "*B", "vlan_id": 20, "name": "vlan20", "comment": "VLAN Estudiantes", "running": true},
  {"id": "*D", "vlan_id": 99, "name": "vlan99", "comment": "VLAN Cuarentena", "running": false}
]
```

**Casos de error posibles:**
- VLAN ID ya existe → `"Failed to create VLAN: VLAN ID 40 already in use"` → Elegir otro ID
- `vlan_id` fuera de rango → Pydantic rechaza → `422`

---

## Caso de uso 8: Ver tráfico en tiempo real de una VLAN específica

**Situación:**
El técnico sospecha que la `vlan10` (Docentes) está saturada durante las clases y quiere medir el tráfico en vivo.

**Actor:** Técnico de redes

**Precondiciones:**
- VLANs configuradas en MikroTik (o modo mock)
- Canal WebSocket `/ws/vlans/traffic` activo

**Pasos:**

1. El usuario navega a **Red e IPs → VLANs**
2. El frontend establece conexión WebSocket automáticamente:
   - Conexión: WebSocket
   - Ruta: `/ws/vlans/traffic`
   - Frecuencia: cada **2 segundos**
   - Datos que emite: lista de VLANs con `vlan_id`, `name`, `rx_bps`, `tx_bps`, `status` (`ok`/`alert`/`inactive`)
3. Para consultar una VLAN específica por REST:
   - Método: `GET`
   - Ruta: `/api/mikrotik/vlans/10/traffic`
   - API externa: MikroTik API (cálculo delta de bytes/sec)
4. El frontend muestra una tarjeta por VLAN con gráfico RX/TX actualizado cada 2 segundos

**Resultado:**
El técnico ve `vlan10 → 4.2 MB/s RX, 1.8 MB/s TX` (dentro del rango esperado). La `vlan99 (Cuarentena)` muestra `0 bps / inactive`, normal porque está vacía.

**Datos de ejemplo (usando mock):**
```json
{"vlan_id": 10, "name": "vlan10", "rx_bps": 4200000, "tx_bps": 1800000, "status": "ok"}
```

**Casos de error posibles:**
- WebSocket desconectado → Hook `useWebSocket` reintenta con backoff exponencial (1s → 2s → 4s → máx. 30s)
- VLAN ID `10` no encontrada → `{"vlan_id": 10, "rx_bps": 0, "tx_bps": 0, "status": "ok"}` (respuesta vacía segura)

---

## Caso de uso 9: Detectar VLAN con alerta activa por el color del recuadro

**Situación:**
El técnico ve en el panel de VLANs que la tarjeta de `vlan10` cambió a rojo. Quiere saber qué alertas Wazuh están correlacionadas con esa VLAN.

**Actor:** Técnico de redes

**Precondiciones:**
- Canal WebSocket `/ws/vlans/traffic` activo (con mock: la `vlan10` entra en alert en ticks 10-24 del ciclo de 40)
- VLANs con subredes IP asignadas en MikroTik

**Pasos:**

1. El WebSocket `/ws/vlans/traffic` emite datos con `"status": "alert"` para `vlan10`
2. El frontend colorea la tarjeta en **rojo** automáticamente (sin acción del usuario)
3. El técnico hace clic en la tarjeta de `vlan10` para ver detalles
4. El frontend llama:
   - Método: `GET`
   - Ruta: `/api/mikrotik/vlans/10/alerts`
   - API externa: MikroTik API (obtiene subred de la VLAN `10.10.10.0/24`) + Wazuh API (filtra alertas por IPs en esa subred)
5. El backend correlaciona alertas de Wazuh donde alguna IP (`src_ip`, `dst_ip`, `agent_ip`) pertenece a `10.10.10.0/24`
6. El frontend lista las alertas asociadas a la VLAN

**Resultado:**
El técnico ve 2 alertas activas en `vlan10`: brute-force desde `10.10.10.15` contra `lubuntu_desk_1`. Identifica la amenaza dentro de la VLAN de Docentes.

**Datos de ejemplo (usando mock):**
```json
{
  "id": "mock-00010", "rule_level": 11,
  "rule_description": "Brute force desde VLAN Docentes",
  "mitre_id": "T1110", "mitre_technique": "Brute Force",
  "src_ip": "10.10.10.15", "agent_name": "lubuntu_desk_1"
}
```

**Casos de error posibles:**
- VLAN sin subred asignada → `[]` (vacío) → Asignar dirección IP a la interfaz VLAN en MikroTik
- Wazuh no disponible → La correlación devuelve `[]`, la tarjeta sigue en rojo por el WS

---

## Caso de uso 10: Eliminar VLAN obsoleta

**Situación:**
La VLAN de cuarentena temporal de un incidente resuelto ya no se necesita y debe eliminarse del router.

**Actor:** Administrador de red

**Precondiciones:**
- La VLAN existe con su ID interno de RouterOS (`*D`)
- No hay dispositivos activos en esa VLAN
- `ConfirmModal` aceptado

**Pasos:**

1. El usuario navega a **Red e IPs → VLANs**
2. Localiza `vlan99 (VLAN Cuarentena)` en la tabla
3. Hace clic en **Eliminar** → aparece `ConfirmModal`
4. Confirma
5. El frontend llama:
   - Método: `DELETE`
   - Ruta: `/api/mikrotik/vlans/*D`
   - API externa: MikroTik API (`/interface/vlan remove`)
6. MikroTik elimina la interfaz VLAN
7. El frontend recarga la lista

**Resultado:**
La `vlan99 (VLAN Cuarentena)` desaparece de la tabla. El MikroTik ya no gestiona tráfico para ese ID de VLAN.

**Datos de ejemplo (usando mock):**
```json
{"deleted": true, "vlan_ros_id": "*D", "name": "vlan99"}
```

**Casos de error posibles:**
- VLAN no encontrada → `"Failed to delete VLAN: item not found"` → El ID cambió o ya fue eliminada
- VLAN con dispositivos conectados → MikroTik puede devolver error de dependencia

---

# Wazuh

## Caso de uso 11: Ver alertas críticas de las últimas 24 horas

**Situación:**
El técnico inicia su turno y necesita evaluar rápidamente el estado de seguridad de la red.

**Actor:** Técnico de redes

**Precondiciones:**
- Wazuh Manager accesible en `100.90.106.121:55000` o modo mock
- Al menos un agente activo generando alertas

**Pasos:**

1. El usuario navega a **Seguridad → Vista Rápida**
2. El frontend carga alertas críticas con polling cada 5 segundos:
   - Método: `GET`
   - Ruta: `/api/wazuh/alerts/critical`
   - Parámetros: `?limit=50&offset=0`
   - API externa: Wazuh API (alertas con `level > 10` + datos MITRE)
3. Simultáneamente, el WebSocket emite alertas en tiempo real:
   - Conexión: WebSocket
   - Ruta: `/ws/alerts`
   - Frecuencia: cada **5 segundos** (emite alerta real cada 5 ticks ≈ 25s)
   - Datos que emite: objeto de alerta Wazuh completo
4. El frontend muestra las alertas con badges de severidad (rojo=crítico ≥12, naranja=alto ≥8)

**Resultado:**
El técnico ve 14 alertas críticas encabezadas por `"Multiple authentication failures — T1110 Brute Force"` nivel 14 desde `203.0.113.45` contra `lubuntu_desk_2 (192.168.88.11)`.

**Datos de ejemplo (usando mock):**
```json
{
  "id": "mock-00001", "agent_name": "lubuntu_desk_2", "agent_ip": "192.168.88.11",
  "rule_level": 14, "rule_description": "Multiple authentication failures",
  "mitre_technique": "Brute Force", "mitre_id": "T1110", "src_ip": "203.0.113.45"
}
```

**Casos de error posibles:**
- Wazuh `401` → Token expirado → El servicio hace refresh automático del JWT
- Wazuh no alcanzable → WebSocket y REST devuelven error → Badge de Wazuh en topbar se vuelve rojo

---

## Caso de uso 12: Identificar el agente más atacado

**Situación:**
El técnico necesita identificar qué equipo de la red es el blanco principal de los ataques.

**Actor:** Técnico de redes

**Precondiciones:**
- Múltiples agentes Wazuh activos con alertas

**Pasos:**

1. El usuario navega a **Seguridad → Vista Rápida**
2. El frontend llama:
   - Método: `GET`
   - Ruta: `/api/wazuh/agents/top`
   - Parámetros: `?limit=10`
   - API externa: Wazuh API (agrupa y cuenta alertas por agente)
3. El backend devuelve ranking de agentes por `alert_count` con técnica MITRE predominante
4. El frontend muestra el ranking ordenado

**Resultado:**
El técnico ve que `wazuh-manager (000)` lidera con 45 alertas de tipo `Brute Force (T1110)`, seguido por `lubuntu_desk_1 (004)` con 23. Prioriza revisar `wazuh-manager`.

**Datos de ejemplo (usando mock):**
```json
[
  {"agent_id": "000", "agent_name": "wazuh-manager", "alert_count": 45, "top_mitre_technique": "Brute Force"},
  {"agent_id": "004", "agent_name": "lubuntu_desk_1", "alert_count": 23, "top_mitre_technique": "Brute Force"}
]
```

**Casos de error posibles:**
- Wazuh no disponible → `"Failed to fetch top agents"` → Verificar conectividad al Wazuh Manager

---

## Caso de uso 13: Ver técnica MITRE de un ataque en curso

**Situación:**
El técnico necesita identificar qué técnica del framework MITRE ATT&CK está siendo usada para buscar las contramedidas correctas.

**Actor:** Analista de seguridad

**Precondiciones:**
- Alertas activas en Wazuh con datos MITRE

**Pasos:**

1. El usuario navega a **Seguridad → Vista Rápida → MITRE ATT&CK**
2. El frontend llama:
   - Método: `GET`
   - Ruta: `/api/wazuh/mitre/summary`
   - API externa: Wazuh API (agrupa por técnica MITRE, fallback a `rule_groups`)
3. El backend devuelve lista de técnicas ordenadas por `count` con `last_seen`
4. El frontend muestra gráfico de barras horizontales

**Resultado:**
El técnico ve `T1110 (Brute Force)` con 45 ocurrencias en la última hora. Va a la base de datos de MITRE ATT&CK y aplica las mitigaciones M1036 (Account Use Policies) y M1032 (Multi-factor Authentication).

**Datos de ejemplo (usando mock):**
```json
[
  {"technique_id": "T1110", "technique_name": "Brute Force", "count": 45},
  {"technique_id": "T1566", "technique_name": "Phishing", "count": 12},
  {"technique_id": "T1046", "technique_name": "Network Service Discovery", "count": 8}
]
```

**Casos de error posibles:**
- Wazuh sin datos MITRE → Técnicas aparecen como `rule_groups` sin ID MITRE (ej. `"brute_force"` en lugar de `"T1110"`)

---

## Caso de uso 14: Consultar el último incidente crítico

**Situación:**
El técnico recibe un llamado urgente y necesita el detalle del incidente más reciente para actuar de inmediato.

**Actor:** Técnico de redes

**Precondiciones:**
- Al menos una alerta con `rule_level > 10` en Wazuh

**Pasos:**

1. El usuario hace clic en la tarjeta **"Último Incidente"** del dashboard de seguridad
2. El frontend llama:
   - Método: `GET`
   - Ruta: `/api/wazuh/alerts/last-critical`
   - API externa: Wazuh API
3. El backend devuelve el incidente más reciente con: `agent_name`, `rule_description`, `rule_level`, `src_ip`, `timestamp`, `mitre_technique`
4. El frontend muestra el incidente en una tarjeta destacada con el tiempo relativo

**Resultado:**
El técnico ve: `"Multiple authentication failures" | Nivel 14 | lubuntu_desk_2 | IP atacante: 203.0.113.45 | T1110 Brute Force | Hace 3 minutos`. Tiene todo para actuar.

**Datos de ejemplo (usando mock):**
```json
{
  "rule_level": 14, "rule_description": "Multiple authentication failures",
  "agent_name": "lubuntu_desk_2", "agent_ip": "192.168.88.11",
  "src_ip": "203.0.113.45", "mitre_technique": "Brute Force", "mitre_id": "T1110"
}
```

**Casos de error posibles:**
- Sin alertas críticas → Respuesta vacía → Se muestra `"Sin incidentes críticos recientes"`

---

## Caso de uso 15: Filtrar alertas por agente específico

**Situación:**
El técnico fue notificado de que `lubuntu_desk_1` tuvo comportamiento anómalo y quiere ver solo sus alertas.

**Actor:** Técnico de redes

**Precondiciones:**
- Conocer `agent_id` del equipo (visible en la tabla de agentes: `004` para `lubuntu_desk_1`)

**Pasos:**

1. El usuario navega a **Seguridad** y selecciona `lubuntu_desk_1 (004)` de la lista de agentes
2. El frontend llama:
   - Método: `GET`
   - Ruta: `/api/wazuh/alerts/agent/004`
   - Parámetros: `?limit=50&offset=0`
   - API externa: Wazuh API (filtrado por `agents.id=004`)
3. El backend devuelve solo alertas donde `agent_id == "004"`
4. El frontend muestra las alertas filtradas

**Resultado:**
El técnico ve las 3 alertas específicas de `lubuntu_desk_1`: brute-force (nivel 12) desde `203.0.113.45`, rootkit detection (nivel 10), y privilege escalation via sudo (nivel 9). Puede correlacionar el ataque completo.

**Datos de ejemplo (usando mock):**
```json
[
  {"id": "mock-00000", "agent_id": "004", "agent_name": "lubuntu_desk_1",
   "rule_level": 12, "rule_description": "Authentication failure", "src_ip": "203.0.113.45"},
  {"id": "mock-00003", "agent_id": "004", "agent_name": "lubuntu_desk_1",
   "rule_level": 10, "rule_description": "Rootkit detection: hidden file"}
]
```

**Casos de error posibles:**
- `agent_id` incorrecto → Lista vacía → Verificar ID correcto en `GET /api/wazuh/agents`

---

## Caso de uso 16: Ejecutar active response sobre un agente

**Situación:**
Se detecta actividad maliciosa activa en `lubuntu_desk_2`. El técnico quiere que Wazuh ejecute automáticamente un bloqueo a nivel de host.

**Actor:** Administrador de red

**Precondiciones:**
- Agente `005 (lubuntu_desk_2)` en estado `active` en Wazuh
- Active response `firewall-drop0` configurado en el agente
- `ConfirmModal` aceptado

**Pasos:**

1. El usuario selecciona el agente `lubuntu_desk_2 (005)` en el panel de seguridad
2. Hace clic en **Ejecutar Active Response** → aparece `ConfirmModal`
3. Confirma
4. El frontend llama:
   - Método: `POST`
   - Ruta: `/api/wazuh/active-response`
   - API externa: Wazuh API (`PUT /active-response/005`)
   - Body:
```json
{"agent_id": "005", "command": "firewall-drop0", "args": ["add", "203.0.113.45"]}
```
5. El backend llama `service.send_active_response("005", "firewall-drop0", ["add","203.0.113.45"])`
6. Guarda `ActionLog`: `action_type="active_response"`
7. El frontend muestra: `"Active response enviado al agente 005"`

**Resultado:**
Wazuh envía el comando al agente `lubuntu_desk_2`. El agente ejecuta el bloqueo de `203.0.113.45` a nivel de iptables (host-level). El evento queda en el historial de acciones.

**Datos de ejemplo (usando mock):**
```json
{"success": true, "agent_id": "005", "command": "firewall-drop0", "status": "sent"}
```

**Casos de error posibles:**
- Agente `disconnected` → `"Agent 005 is not active"` → Verificar estado en la tabla de agentes
- Comando no configurado en el agente → Wazuh devuelve `400` → Verificar `ossec.conf` del agente

---

# Phishing

## Caso de uso 17: Detectar campaña de phishing activa en el timeline

**Situación:**
El técnico quiere ver si hay una campaña de phishing activa analizando el volumen de intentos por minuto en los últimos 60 minutos.

**Actor:** Analista de seguridad

**Precondiciones:**
- Wazuh registrando alertas con grupos `web_attack`, `phishing`, `malicious_url` o similares

**Pasos:**

1. El usuario navega a **Phishing → Timeline**
2. El frontend llama:
   - Método: `GET`
   - Ruta: `/api/phishing/urls/timeline`
   - API externa: Wazuh API (filtra alertas de los últimos 60 min por grupos de phishing)
3. El backend devuelve array de 60 puntos `{minute, count}` para los últimos 60 minutos
4. El frontend muestra un gráfico de línea del volumen por minuto

**Resultado:**
El técnico ve un spike de 8 alertas en el minuto `:45` del historial. Eso indica una campaña activa. Procede a ver la lista de dominios sospechosos y bloquear los más frecuentes.

**Datos de ejemplo (usando mock):**
```json
[
  {"minute": "2026-04-13T19:00:00", "count": 2},
  {"minute": "2026-04-13T19:15:00", "count": 8},
  {"minute": "2026-04-13T19:45:00", "count": 8},
  {"minute": "2026-04-13T19:55:00", "count": 0}
]
```

**Casos de error posibles:**
- Wazuh sin alertas de phishing → Todos los valores en `0` → No hay campaña activa actualmente
- Wazuh no disponible → `"Failed to fetch phishing timeline: ..."` → Verificar conectividad

---

## Caso de uso 18: Agregar dominio malicioso al sinkhole de MikroTik

**Situación:**
El técnico identificó que `evil-phishing.com` está siendo usado en una campaña activa y quiere bloquearlo para todos los dispositivos de la red vía DNS sinkhole.

**Actor:** Técnico de redes

**Precondiciones:**
- MikroTik activo con DNS local habilitado (o modo mock)
- `ConfirmModal` aceptado

**Pasos:**

1. El usuario navega a **Phishing → Sinkhole de Dominios**
2. Ingresa el dominio `evil-phishing.com` y el motivo `"Phishing campaign — detectado en alerta mock-00007"`
3. Hace clic en **Agregar al Sinkhole** → aparece `ConfirmModal`
4. Confirma
5. El frontend llama:
   - Método: `POST`
   - Ruta: `/api/phishing/domains/sinkhole`
   - API externa: MikroTik API (`/ip/dns/static add`) + DB (`sinkhole_entries`)
   - Body:
```json
{"domain": "evil-phishing.com", "reason": "Phishing campaign — detectado en alerta mock-00007"}
```
6. El backend ejecuta `mikrotik.add_dns_static(domain="evil-phishing.com", address="127.0.0.1", comment="NetShield sinkhole: ...")`
7. Guarda `SinkholeEntry` en DB y `ActionLog` con `action_type="sinkhole_add"`
8. El frontend recarga la lista de sinkholes

**Resultado:**
Cualquier dispositivo de la red que intente resolver `evil-phishing.com` recibirá `127.0.0.1` (loopback) como respuesta, bloqueando efectivamente el acceso al dominio malicioso.

**Datos de ejemplo (usando mock — dominios ya en sinkhole):**
```json
[
  {"domain": "evil-phishing.com", "address": "127.0.0.1",
   "comment": "[NetShield] Sinkhole", "added_by": "system", "reason": "Phishing campaign"},
  {"domain": "malware-c2.net", "address": "127.0.0.1",
   "comment": "[NetShield] Sinkhole", "added_by": "system", "reason": "C2 server"}
]
```

**Casos de error posibles:**
- Dominio ya en sinkhole → MikroTik devuelve error de duplicado → `"Failed to sinkhole domain: entry already exists"`
- Dominio con formato inválido → Pydantic rechaza → `422`

---

## Caso de uso 19: Ver qué usuarios hicieron clic en un link malicioso

**Situación:**
Después de detectar una campaña de phishing, el técnico necesita saber qué equipos y usuarios interactuaron con las URLs maliciosas.

**Actor:** Analista de seguridad

**Precondiciones:**
- Wazuh tiene alertas de phishing con campo `dst_url` poblado

**Pasos:**

1. El usuario navega a **Phishing → Víctimas**
2. El frontend llama:
   - Método: `GET`
   - Ruta: `/api/phishing/victims`
   - API externa: Wazuh API (filtra alertas por grupos de phishing y agrupa por agente+URL)
3. El backend devuelve lista de víctimas con `agent_name`, `ip`, `url`, `times` (cantidad de veces)
4. El frontend muestra la tabla ordenada por `times` descendiente

**Resultado:**
El técnico ve que `PC-Aula3-01 (192.168.88.20)` accedió `3 veces` a `http://evil-phishing.com/login`. Contacta al docente del Aula 101 para revisar el equipo e iniciar el protocolo de respuesta a incidentes.

**Datos de ejemplo (usando mock):**
```json
[
  {"agent_name": "PC-Aula3-01", "agent_id": "006", "ip": "192.168.88.20",
   "url": "http://evil-phishing.com/login", "times": 3}
]
```

**Casos de error posibles:**
- Sin alertas de phishing con `dst_url` → Lista vacía → Los agentes no interactuaron con URLs o Wazuh no captura el campo URL

---

## Caso de uso 20: Bloquear IP origen de campaña de phishing

**Situación:**
El técnico identifica que la IP `203.0.113.99` es el servidor C2 de la campaña de phishing y quiere bloquearla en MikroTik usando la lista `Phishing_Block`.

**Actor:** Técnico de redes

**Precondiciones:**
- IP origen identificada en las alertas o en la lista de dominios sospechosos
- `ConfirmModal` aceptado

**Pasos:**

1. El usuario navega a **Phishing → Bloquear IP**
2. Ingresa la IP `203.0.113.99`, motivo `"C2 servidor phishing — evil-phishing.com"` y duración `24h`
3. Hace clic en **Bloquear** → `ConfirmModal`
4. Confirma
5. El frontend llama:
   - Método: `POST`
   - Ruta: `/api/phishing/ip/block`
   - API externa: MikroTik API (`/ip/firewall/address-list add`)
   - Body:
```json
{"ip": "203.0.113.99", "reason": "C2 servidor phishing — evil-phishing.com", "duration_hours": 24}
```
6. El backend ejecuta `mikrotik.add_to_address_list(ip="203.0.113.99", list_name="Phishing_Block", timeout="24h", comment="Phishing source blocked via NetShield")`
7. Guarda `ActionLog` con `action_type="phishing_block"`

**Resultado:**
La IP `203.0.113.99` queda en la lista `Phishing_Block` de MikroTik con expiración automática en 24 horas. El firewall puede usar esta lista en reglas de bloqueo.

**Datos de ejemplo (usando mock — `address_lists`):**
```json
{"id": "*4", "list": "Sinkhole", "address": "203.0.113.99", "comment": "evil-phishing.com", "timeout": "", "disabled": false}
```

**Casos de error posibles:**
- Formato IP inválido → Pydantic rechaza → `422`
- MikroTik desconectado → Reconexión automática → Si persiste: error en frontend

---

## Caso de uso 21: Simular alerta de phishing en el lab para probar el pipeline

> ⚠️ **Solo disponible con `APP_ENV=lab`**. Este endpoint genera una alerta sintética en memoria para probar el pipeline completo de detección sin necesitar un ataque real. **No inyecta datos en Wazuh**.

**Situación:**
El técnico quiere probar que el pipeline de detección (alerta → sinkhole → bloqueo) funciona correctamente antes de demostrarlo en una reunión.

**Actor:** Técnico de redes (entorno de laboratorio)

**Precondiciones:**
- Backend corriendo con `APP_ENV=lab`
- No se requiere Wazuh real (la alerta es sintética)

**Pasos:**

1. El usuario navega a **Phishing → Simular** (visibleen modo lab)
2. El frontend llama:
   - Método: `POST`
   - Ruta: `/api/phishing/simulate`
   - API externa: Internal (no llama a Wazuh)
   - Body:
```json
{"malicious_url": "http://evil-phishing.com/login", "target_agent_id": "006"}
```
3. El backend genera un objeto de alerta sintético con `rule_groups: ["web_attack","phishing"]`, `src_ip: "192.168.88.10"`, `dst_url: "http://evil-phishing.com/login"`
4. El frontend muestra el JSON de la alerta simulada

**Resultado:**
El técnico puede ver la estructura exacta de lo que generaría Wazuh en un ataque real, y verificar que los filtros de phishing la captarían (`_is_phishing_alert()` devolvería `True`).

**Datos de ejemplo:**
```json
{
  "id": "sim-1713040000", "agent_name": "PC-Aula3-01", "agent_id": "006",
  "rule_level": 12, "rule_description": "Simulated phishing access to http://evil-phishing.com/login",
  "rule_groups": ["web_attack", "phishing"], "src_ip": "192.168.88.10",
  "dst_url": "http://evil-phishing.com/login", "mitre_id": "T1566", "simulated": true
}
```

**Casos de error posibles:**
- Backend sin `APP_ENV=lab` → `"Phishing simulation is only available in lab mode (APP_ENV=lab)"`

---

# Portal Cautivo

## Caso de uso 22: Ver sesiones activas y detectar un usuario con consumo excesivo

**Situación:**
El técnico recibe quejas de lentitud en la red del Hotspot. Quiere ver qué usuarios están conectados y si alguno consume más de lo esperado.

**Actor:** Técnico de redes

**Precondiciones:**
- Hotspot inicializado (`POST /api/portal/setup` ya ejecutado)
- Canal WebSocket `/ws/portal/sessions` activo

**Pasos:**

1. El usuario navega a **Portal Cautivo → Sesiones**
2. El frontend establece conexión WebSocket automáticamente:
   - Conexión: WebSocket
   - Ruta: `/ws/portal/sessions`
   - Frecuencia: cada **5 segundos**
   - Datos que emite: `{active_sessions, sessions: [...], chart_history: [...]}`
3. Para la lista REST inicial:
   - Método: `GET`
   - Ruta: `/api/portal/sessions/active`
   - API externa: MikroTik API (`/ip/hotspot/active`)
4. El frontend muestra tabla con: usuario, IP, MAC, uptime, bytes_in, bytes_out, tiempo restante
5. El técnico identifica que `juan.perez` lleva `4h 12m` de sesión y consumió `1.23 MB in / 456 KB out`

**Resultado:**
El técnico nota que `juan.perez (192.168.88.10)` tiene consumo alto pero dentro de su perfil `docentes` (50M/50M, 12h). No es el problema. Ve que `unknown-guest (192.168.88.100)` no registrado está activo inusualmente — investiga.

**Datos de ejemplo (usando mock):**
```json
[
  {"id": "sess-003", "user": "juan.perez", "address": "192.168.88.10",
   "uptime": "4h 12m", "bytes_in": 1234567, "bytes_out": 456789, "status": "registered"},
  {"id": "sess-004", "user": "", "address": "192.168.88.100",
   "uptime": "0h 05m", "bytes_in": 12345, "bytes_out": 4567, "status": "unregistered"}
]
```

**Casos de error posibles:**
- Hotspot no inicializado → `"Hotspot no inicializado. Ejecutá el setup desde Configuración → Inicializar Hotspot"`
- WebSocket desconectado → Hook reintenta con backoff exponencial

---

## Caso de uso 23: Registrar usuario nuevo en el Hotspot

**Situación:**
Un nuevo docente necesita acceso a la red WiFi con el perfil `docentes` (50 Mbps). El técnico crea el usuario desde el dashboard.

**Actor:** Técnico de redes

**Precondiciones:**
- Hotspot inicializado
- Perfil `docentes` existente

**Pasos:**

1. El usuario navega a **Portal Cautivo → Usuarios → Nuevo Usuario**
2. Completa el formulario: nombre `ana.martinez`, contraseña, perfil `docentes`, comentario `"Docente Lab Redes"`
3. El frontend llama:
   - Método: `POST`
   - Ruta: `/api/portal/users`
   - API externa: MikroTik API (`/ip/hotspot/user add`)
   - Body:
```json
{"name": "ana.martinez", "password": "SecurePass123", "profile": "docentes", "comment": "Docente Lab Redes"}
```
4. El backend ejecuta `service.create_user(data)` → agrega el usuario en RouterOS Hotspot
5. Guarda `ActionLog`: `action_type="portal_user_create"`
6. El frontend recarga la lista de usuarios

**Resultado:**
El usuario `ana.martinez` queda registrado en el Hotspot con perfil `docentes`. Puede conectarse mediante el portal cautivo con esas credenciales y tendrá acceso a 50 Mbps simétricos.

**Datos de ejemplo (usando mock — usuarios existentes):**
```json
{"name": "ana.martinez", "profile": "docentes", "comment": "Docente Lab Redes", "disabled": false}
```

**Casos de error posibles:**
- Nombre de usuario ya existe → `"Failed to create user ana.martinez: user already exists"` → Usar otro nombre
- Hotspot no inicializado → Respuesta de error de setup

---

## Caso de uso 24: Desconectar usuario manualmente

**Situación:**
El técnico detecta que un usuario está usando el Hotspot en horario no permitido y necesita forzar la desconexión de su sesión activa.

**Actor:** Técnico de redes

**Precondiciones:**
- El usuario tiene una sesión activa en el Hotspot
- `ConfirmModal` aceptado

**Pasos:**

1. El usuario navega a **Portal Cautivo → Sesiones**
2. Localiza la sesión de `alumno01` en la tabla
3. Hace clic en **Desconectar** → aparece `ConfirmModal`
4. Confirma
5. El frontend llama:
   - Método: `POST`
   - Ruta: `/api/portal/users/alumno01/disconnect`
   - API externa: MikroTik API (`/ip/hotspot/active remove`)
6. El backend ejecuta `service.disconnect_user("alumno01")` → elimina todas las sesiones activas de ese usuario
7. Guarda `ActionLog`: `action_type="portal_user_disconnect"`, `sessions_disconnected: 1`
8. El frontend recarga la tabla de sesiones

**Resultado:**
La sesión de `alumno01 (192.168.88.20)` desaparece de la tabla de sesiones activas. El usuario será redirigido al portal cautivo si intenta acceder a internet.

**Datos de ejemplo (usando mock):**
```json
{"username": "alumno01", "sessions_disconnected": 1, "success": true}
```

**Casos de error posibles:**
- Usuario sin sesión activa → `sessions_disconnected: 0` → El usuario ya estaba desconectado
- Hotspot no inicializado → Error de setup

---

## Caso de uso 25: Cambiar velocidad de usuarios no registrados

**Situación:**
El técnico quiere reducir aún más la velocidad de los usuarios "no registrados" (guests sin cuenta) para desincentivar el uso no autorizado y liberar ancho de banda.

**Actor:** Administrador de red

**Precondiciones:**
- Perfil `unregistered` existente en el Hotspot
- `ConfirmModal` aceptado

**Pasos:**

1. El usuario navega a **Portal Cautivo → Configuración → Velocidad No Registrados**
2. Ajusta los sliders a `512k` upload y `512k` download (actualmente `1M/1M`)
3. Hace clic en **Aplicar** → aparece `ConfirmModal`
4. Confirma
5. El frontend llama:
   - Método: `PUT`
   - Ruta: `/api/portal/config/unregistered-speed`
   - API externa: MikroTik API (`/ip/hotspot/user/profile set unregistered rate-limit=512k/512k`)
   - Body:
```json
{"rate_limit_up": "512k", "rate_limit_down": "512k"}
```
6. El backend ejecuta `service.update_unregistered_speed("512k", "512k")`
7. Guarda `ActionLog`: `action_type="portal_speed_update"`, profile `unregistered`

**Resultado:**
El perfil `unregistered` del Hotspot queda con `rate-limit=512k/512k`. Los guests sin cuenta tendrán velocidad mínima y se incentivan a registrarse.

**Datos de ejemplo (usando mock — perfiles):**
```json
{"name": "unregistered", "rate_limit": "1M/1M", "session_timeout": "1h", "idle_timeout": "10m"}
```
→ Después del cambio: `"rate_limit": "512k/512k"`

**Casos de error posibles:**
- Formato de rate-limit inválido → El servicio puede rechazarlo → Usar formato RouterOS (`512k`, `1M`, `10M`)

---

## Caso de uso 26: Configurar horario de acceso al Hotspot

**Situación:**
El coordinador pide que los usuarios no registrados no puedan usar el Hotspot los fines de semana para reducir el consumo fuera de horario lectivo.

**Actor:** Administrador de red

**Precondiciones:**
- Hotspot inicializado
- `ConfirmModal` aceptado

**Pasos:**

1. El usuario navega a **Portal Cautivo → Configuración → Horario**
2. Configura: Habilitado `true`, horario permitido `7:00 a 22:00`, días bloqueados `["saturday", "sunday"]`, scope `unregistered`
3. Hace clic en **Guardar Horario** → `ConfirmModal`
4. Confirma
5. El frontend llama:
   - Método: `PUT`
   - Ruta: `/api/portal/config/schedule`
   - API externa: MikroTik API (`/ip/firewall/filter` con time matching)
   - Body:
```json
{
  "enabled": true,
  "allowed_hours": {"hour_from": 7, "hour_to": 22},
  "blocked_days": ["saturday", "sunday"],
  "scope": "unregistered"
}
```
6. El backend ejecuta `service.setup_schedule(enabled=True, hour_from=7, hour_to=22, blocked_days=["saturday","sunday"], scope="unregistered")`
7. Guarda `ActionLog`: `action_type="portal_schedule_update"`

**Resultado:**
Se crean reglas de firewall con `time=...` en MikroTik que bloquean el tráfico Hotspot de usuarios no registrados los sábados y domingos y fuera de 7-22h en días hábiles.

**Datos de ejemplo (usando mock — schedule actual):**
```json
{"enabled": false, "allowed_hours": {"hour_from": 7, "hour_to": 22},
 "blocked_days": ["saturday", "sunday"], "scope": "unregistered"}
```

**Casos de error posibles:**
- `hour_from >= hour_to` → Pydantic rechaza → `422`
- MikroTik no puede crear reglas con time (requiere CHR) → Error del servicio

---

# GLPI

## Caso de uso 27: Buscar ficha técnica de un equipo por IP o nombre

**Situación:**
El técnico recibe un reporte de problema en un equipo con IP `192.168.88.20` y necesita su ficha técnica completa (CPU, RAM, OS, número de serie, usuario asignado).

**Actor:** Técnico de soporte

**Precondiciones:**
- GLPI disponible o modo mock activo

**Pasos:**

1. El usuario navega a **Inventario → Activos → Buscar**
2. Escribe `192.168.88.20` o `PC-Aula3-01` en el campo de búsqueda
3. El frontend llama:
   - Método: `GET`
   - Ruta: `/api/glpi/assets/search`
   - Parámetros: `?q=192.168.88.20`
   - API externa: GLPI API (búsqueda full-text por nombre, IP, serial)
4. El backend devuelve los resultados que coinciden
5. El técnico hace clic en el resultado para ver el detalle completo:
   - Método: `GET`
   - Ruta: `/api/glpi/assets/3`
   - API externa: GLPI API

**Resultado:**
El técnico accede a la ficha de `PC-Aula3-01`: OS `Windows 10`, CPU `Intel Core i5-10400`, RAM `8 GB`, ubicación `Aula 101`, serial `SN100003`, sin usuario asignado, último comentario: `"Wazuh agent disconnected"`.

**Datos de ejemplo (usando mock):**
```json
{
  "id": 3, "name": "PC-Aula3-01", "ip": "192.168.88.20", "mac": "52:54:00:CC:DD:01",
  "os": "Windows 10", "cpu": "Intel Core i5-10400", "ram": "8",
  "location": "Aula 101", "status": "activo", "serial": "SN100003",
  "assigned_user": "", "comment": "Wazuh agent disconnected"
}
```

**Casos de error posibles:**
- GLPI no disponible (y no hay mock) → búsqueda vacía → Badge "GLPI no disponible" visible
- Query vacío (menos de 2 caracteres) → `422: "Query min_length=2"`

---

## Caso de uso 28: Registrar equipo nuevo en el inventario GLPI

**Situación:**
Llegó un equipo nuevo al laboratorio. El técnico necesita registrarlo en GLPI antes de conectarlo a la red.

**Actor:** Técnico de soporte

**Precondiciones:**
- GLPI disponible o modo mock activo
- Datos del equipo disponibles: nombre, serial, OS, ubicación, usuario asignado

**Pasos:**

1. El usuario navega a **Inventario → Activos → Nuevo Activo**
2. Completa el formulario: nombre `PC-Lab-03`, IP `192.168.88.12`, OS `Ubuntu 24.04`, CPU `AMD Ryzen 5 7600`, RAM `16 GB`, ubicación `Lab Redes` (location_id: 3), serial `SN100008`
3. El frontend llama:
   - Método: `POST`
   - Ruta: `/api/glpi/assets`
   - API externa: GLPI API
   - Body:
```json
{
  "name": "PC-Lab-03", "ip": "192.168.88.12",
  "os": "Ubuntu 24.04", "cpu": "AMD Ryzen 5 7600", "ram": "16",
  "location_id": 3, "serial": "SN100008", "status": "activo"
}
```
4. El backend ejecuta `glpi.create_computer(data)` → crea el equipo en GLPI
5. Guarda `ActionLog`: `action_type="glpi_asset_created"`
6. El frontend recarga la lista de activos

**Resultado:**
El equipo `PC-Lab-03` aparece en el inventario de GLPI. Cuando sea conectado a la red, el sistema de correlación MikroTik+Wazuh podrá identificarlo por su IP.

**Datos de ejemplo (usando mock — activos existentes):**
```json
{"id": 1, "name": "PC-Lab-01", "ip": "192.168.88.10", "status": "activo", "location": "Lab Redes"}
```

**Casos de error posibles:**
- GLPI no disponible → `"Error al crear activo: GLPI no alcanzable"` → Verificar URL y tokens en `.env`
- Nombre duplicado → GLPI puede rechazar → Verificar si el equipo ya existe

---

## Caso de uso 29: Ver equipos asignados a un docente específico

**Situación:**
El técnico necesita saber qué equipos tiene asignados el docente `Juan Pérez` para planificar una actualización de software.

**Actor:** Técnico de soporte

**Precondiciones:**
- GLPI con usuarios cargados (o modo mock)
- Conocer `user_id` del docente

**Pasos:**

1. El usuario navega a **Inventario → Usuarios**
2. El frontend carga la lista de usuarios:
   - Método: `GET`
   - Ruta: `/api/glpi/users`
   - Parámetros: `?search=juan.perez`
   - API externa: GLPI API
3. El técnico identifica al usuario `juan.perez` (user_id: `1`)
4. El frontend llama para ver sus activos:
   - Método: `GET`
   - Ruta: `/api/glpi/users/1/assets`
   - API externa: GLPI API
5. El backend devuelve la lista de equipos asignados al usuario

**Resultado:**
El técnico ve que `juan.perez` tiene asignado `PC-Lab-01 (192.168.88.10)`. Planifica la actualización para ese equipo.

**Datos de ejemplo (usando mock):**
```json
{
  "user_id": 1,
  "assets": [
    {"id": 1, "name": "PC-Lab-01", "ip": "192.168.88.10", "status": "activo", "location": "Lab Redes"}
  ]
}
```

**Casos de error posibles:**
- Usuario sin activos asignados → `{"user_id": 1, "assets": []}` → El técnico puede asignarle un equipo
- `user_id` incorrecto → Respuesta vacía → Verificar el ID en `GET /api/glpi/users`

---

## Caso de uso 30: Crear ticket de mantenimiento desde el dashboard

**Situación:**
El técnico detecta que `PC-Aula2-01` tiene errores de disco (reportado en las alertas) y quiere abrir un ticket en GLPI para rastrear el trabajo.

**Actor:** Técnico de soporte

**Precondiciones:**
- GLPI disponible o modo mock
- Asset ID del equipo conocido (`6` para `PC-Aula2-01`)

**Pasos:**

1. El usuario navega a **Inventario → Tickets → Nuevo Ticket**
2. Completa el formulario: título `"Falla de disco — PC-Aula2-01"`, descripción `"Error de E/S en /dev/sda. SMART indica sectores dañados."`, prioridad `4 (Alta)`, asset_id `6`
3. El frontend llama:
   - Método: `POST`
   - Ruta: `/api/glpi/tickets`
   - API externa: GLPI API
   - Body:
```json
{
  "title": "Falla de disco — PC-Aula2-01",
  "description": "Error de E/S en /dev/sda. SMART indica sectores dañados.",
  "priority": 4, "asset_id": 6
}
```
4. El backend ejecuta `glpi.create_ticket(data)`, guarda `ActionLog`
5. El frontend actualiza el Kanban de tickets

**Resultado:**
El ticket aparece en la columna `pendiente` del Kanban de GLPI. El equipo puede arrastrarlo a `en_progreso` cuando comience el trabajo.

**Datos de ejemplo (usando mock — tickets existentes):**
```json
{"id": 2, "title": "Falla de disco — PC-Aula2-01", "priority_label": "Alta",
 "status": "pendiente", "asset_name": "PC-Aula2-01", "asset_id": 6}
```

**Casos de error posibles:**
- GLPI no disponible → `"Error al crear ticket: ..."` → Usar GLPI directamente o esperar reconexión

---

## Caso de uso 31: Ver mapa de ubicación y listar equipos de un aula

**Situación:**
El administrador quiere hacer el inventario físico del `Aula 101` antes de las vacaciones. Necesita saber qué equipos están registrados en GLPI para ese espacio.

**Actor:** Administrador de red / Técnico de soporte

**Precondiciones:**
- GLPI con ubicaciones configuradas (o modo mock)
- Conocer `location_id` del aula (`1` para `Aula 101`)

**Pasos:**

1. El usuario navega a **Inventario → Mapa de Ubicaciones**
2. El frontend carga las ubicaciones:
   - Método: `GET`
   - Ruta: `/api/glpi/locations`
   - API externa: GLPI API
3. El técnico selecciona `Aula 101` (location_id: `1`)
4. El frontend llama:
   - Método: `GET`
   - Ruta: `/api/glpi/assets/by-location/1`
   - API externa: GLPI API
5. El backend devuelve todos los equipos registrados en esa ubicación

**Resultado:**
El técnico ve que `Aula 101` tiene 3 equipos registrados: `PC-Aula3-01 (SN100003)`, `PC-Aula3-02 (SN100004)` y `PC-Retirado-01 (SN099001, estado: retirado)`. Debe verificar que el equipo retirado ya no esté físicamente en el aula.

**Datos de ejemplo (usando mock):**
```json
[
  {"id": 3, "name": "PC-Aula3-01", "status": "activo", "serial": "SN100003"},
  {"id": 4, "name": "PC-Aula3-02", "status": "activo", "serial": "SN100004"},
  {"id": 8, "name": "PC-Retirado-01", "status": "retirado", "serial": "SN099001"}
]
```

**Casos de error posibles:**
- `location_id` incorrecto → Lista vacía → Verificar IDs en `GET /api/glpi/locations`

---

## Caso de uso 32: Ver salud cruzada de activos (GLPI + Wazuh + ARP)

**Situación:**
El técnico quiere tener una vista unificada del estado de salud de todos los activos: saber cuáles tienen agente Wazuh activo, cuáles están en la tabla ARP (conectados) y cuáles tienen tickets abiertos.

**Actor:** Técnico de soporte / Administrador

**Precondiciones:**
- GLPI, Wazuh y MikroTik disponibles (o todos en mock)

**Pasos:**

1. El usuario navega a **Inventario → Salud de Activos**
2. El frontend llama:
   - Método: `GET`
   - Ruta: `/api/glpi/assets/health`
   - API externa: GLPI API + Wazuh API + MikroTik API (en paralelo, con fallback si alguno falla)
3. El backend:
   a. Obtiene todos los activos GLPI
   b. Obtiene agentes Wazuh → correlaciona por IP
   c. Obtiene tabla ARP → correlaciona por IP
   d. Asigna `health: "ok"`, `"warning"` o `"critical"` a cada activo
4. El frontend muestra tabla con semáforo de salud por equipo

**Resultado:**
El técnico ve que `PC-Aula3-01` está en `warning` (agente Wazuh `disconnected`) y `PC-Lab-01` está en `ok` (activo en Wazuh, presente en ARP, sin tickets críticos). El resumen muestra: `ok: 4, warning: 2, critical: 0`.

**Datos de ejemplo (usando mock):**
```json
{
  "assets": [
    {"id": 1, "name": "PC-Lab-01", "ip": "192.168.88.10", "health": "ok",
     "wazuh_status": "active", "in_arp": true},
    {"id": 3, "name": "PC-Aula3-01", "ip": "192.168.88.20", "health": "warning",
     "wazuh_status": "disconnected", "in_arp": true}
  ],
  "summary": {"ok": 4, "warning": 2, "critical": 0, "total": 6}
}
```

**Casos de error posibles:**
- Wazuh no disponible → Los campos `wazuh_status` quedan vacíos, `health` se calcula sin Wazuh (advertencia en logs)
- GLPI no disponible → `"Error al calcular salud de activos"` → Verificar conectividad a GLPI

---

# Seguridad Híbrida

## Caso de uso 33: Bloqueo coordinado automático — Wazuh detecta, MikroTik bloquea

**Situación:**
Wazuh registró 12 intentos de autenticación fallida desde `203.0.113.45` en los últimos 2 minutos (nivel de alerta ≥ 12). El técnico quiere activar el bloqueo automático con un solo clic.

**Actor:** Técnico de redes

**Precondiciones:**
- Alerta Wazuh con `rule_level >= 12` y `src_ip` identificado
- MikroTik y Wazuh disponibles (o mock)
- `ConfirmModal` aceptado

**Pasos:**

1. El usuario ve la notificación de seguridad en el panel: `"Brute-force detectado: 203.0.113.45 — Acción: [Bloquear]"`
2. Hace clic en **Bloquear** → aparece `ConfirmModal`
3. Confirma
4. El frontend llama:
   - Método: `POST`
   - Ruta: `/api/security/auto-block`
   - API externa: Wazuh API (valida la alerta) + MikroTik API (agrega a `Blacklist_Automatica`)
   - Body:
```json
{"alert_id": "mock-00001", "src_ip": "203.0.113.45", "reason": "Brute force SSH — 12 intentos en 2 min"}
```
5. El backend:
   a. Valida que la alerta tenga `rule_level >= 12` en Wazuh
   b. Agrega `203.0.113.45` a la lista `Blacklist_Automatica` en MikroTik con `drop` en `chain=forward`
6. Guarda `ActionLog`: `action_type="auto_block"`, `alert_id`, `src_ip`, `list="Blacklist_Automatica"`
7. El frontend muestra: `"IP 203.0.113.45 bloqueada automáticamente"`

**Resultado:**
La IP `203.0.113.45` queda en la `Blacklist_Automatica` de MikroTik. Todo el tráfico de/hacia esa IP es descartado en el router. El evento queda auditado en `ActionLog` y es visible en **Historial de Acciones**.

**Datos de ejemplo (usando mock — address_list resultante):**
```json
{"id": "*1", "list": "Blacklist_Automatica", "address": "203.0.113.45",
 "comment": "[NetShield] brute-force", "timeout": "23:45:12", "disabled": false}
```

**Casos de error posibles:**
- `rule_level < 12` → `"Alert level too low for auto-block (level: 8, minimum: 12)"`
- `src_ip` vacío → `"Cannot auto-block: alert has no source IP"` → El ataque es interno sin IP externa
- MikroTik desconectado → Reconexión automática → Si persiste: el bloqueo no se aplica y el técnico debe bloquearlo manualmente

---

## Caso de uso 34: Poner equipo en cuarentena multi-sistema

**Situación:**
`PC-Lab-01 (192.168.88.10)` fue comprometido. El técnico necesita aislarlo de la red y documentar el incidente en GLPI simultáneamente.

**Actor:** Administrador de red

**Precondiciones:**
- Agente Wazuh `004` activo en ese equipo
- Asset GLPI con id `1` (PC-Lab-01)
- VLAN Cuarentena (`vlan99`) configurada en MikroTik
- `ConfirmModal` aceptado

**Pasos:**

1. El usuario selecciona `PC-Lab-01` en el panel de seguridad o inventario
2. Hace clic en **Cuarentena** → aparece `ConfirmModal` con resumen de las acciones
3. Confirma

**Acción en MikroTik (seguridad nivel de red):**
   - Método: `POST`
   - Ruta: `/api/security/quarantine`
   - API externa: Wazuh API + MikroTik API
   - Body:
```json
{"agent_id": "004", "reason": "Compromiso detectado: rootkit + brute-force desde 203.0.113.45"}
```

> ⚠️ **[PARCIAL]** El endpoint `POST /api/security/quarantine` implementa la lógica de mover un bridge port a la VLAN de cuarentena. En el laboratorio actual con VirtualBox (sin bridge físico por puerto), esta operación se ejecuta solo como `ActionLog` sin efecto en red real. El aislamiento físico debe hacerse manualmente desconectando el cable o via VLAN en switch físico.

**Acción en GLPI (documentación del incidente):**
   - Método: `POST`
   - Ruta: `/api/glpi/assets/1/quarantine`
   - API externa: GLPI API + DB
   - Body:
```json
{"reason": "Compromiso detectado: rootkit + brute-force", "created_by": "tecnico1"}
```
4. GLPI crea ticket automáticamente: `"[NetShield] Cuarentena automática — PC-Lab-01"` con prioridad `Muy Alta`
5. Se guarda `QuarantineLog` en DB y `ActionLog` con `action_type="quarantine"`

**Resultado:**
El equipo `PC-Lab-01` queda documentado como en cuarentena en GLPI con ticket abierto. En entornos con infraestructura física completa, el puerto del switch queda movido a la VLAN de cuarentena, aislando el equipo sin apagarlo.

**Datos de ejemplo (usando mock — ticket resultante):**
```json
{"id": 4, "title": "[NetShield] Cuarentena automática — PC-Lab-01",
 "priority": 5, "priority_label": "Muy Alta", "status": "resuelto",
 "is_netshield": true, "description": "Cuarentena iniciada por NetShield. Motivo: brute-force desde 203.0.113.45"}
```

**Casos de error posibles:**
- Agente Wazuh `disconnected` → La acción continúa pero se registra advertencia
- GLPI no disponible → El ticket no se crea, pero el `ActionLog` y `QuarantineLog` sí se guardan

---

## Caso de uso 35: Geo-blocking de un país con múltiples alertas

**Situación:**
El 90% de los ataques de brute-force vienen de rangos de IP de China. El técnico quiere bloquear los rangos CIDR del país completo en el firewall de MikroTik.

**Actor:** Administrador de red

**Precondiciones:**
- Lista de CIDRs de China disponible (el técnico la obtiene de herramientas como ipinfo.io)
- `ConfirmModal` aceptado

**Pasos:**

1. El usuario navega a **Seguridad → Geo-Blocking**
2. Selecciona país `CN (China)` o pega los CIDRs manualmente
3. Hace clic en **Aplicar Geo-Block** → `ConfirmModal` muestra cuántos rangos se van a agregar
4. Confirma
5. El frontend llama:
   - Método: `POST`
   - Ruta: `/api/security/geo-block`
   - API externa: MikroTik API (`/ip/firewall/address-list add` por cada CIDR)
   - Body:
```json
{
  "country": "CN",
  "cidrs": ["1.0.1.0/24", "1.0.2.0/23", "1.0.8.0/21"],
  "list_name": "Geoblock",
  "reason": "Bloqueo por país — 90% de ataques SSH desde China"
}
```
6. El backend itera los CIDRs y los agrega a la lista `Geoblock` en MikroTik con `comment="[NetShield] CN — geo-block"`
7. Guarda `ActionLog`: `action_type="geo_block"`, `cidrs_added: 3`, `country: "CN"`

**Resultado:**
Los 3 rangos CIDR quedan en la lista `Geoblock` de MikroTik. Las reglas de firewall que referencian esta lista descartarán automáticamente todo el tráfico proveniente de esos rangos.

**Datos de ejemplo (usando mock — address_list existente):**
```json
{"id": "*3", "list": "Geoblock", "address": "185.220.0.0/16",
 "comment": "Tor exit node range", "timeout": "", "disabled": false}
```

**Casos de error posibles:**
- CIDR inválido (ej. `"999.0.0.0/8"`) → MikroTik rechaza → Se reportan los CIDRs fallidos, los válidos se agregan de todas formas
- Lista ya contiene el CIDR → Error de duplicado en MikroTik → Se registra como `skipped` en el log

---

## Caso de uso 36: Buscar IP y ver contexto multi-sistema

**Situación:**
El técnico recibe un reporte de actividad inusual desde `192.168.88.10` y quiere saber todo sobre esa IP en un solo lugar: quién es en la red, si Wazuh la monitorea y qué equipo es en el inventario.

**Actor:** Técnico de redes

**Precondiciones:**
- MikroTik, Wazuh y GLPI disponibles (o mock)

**Pasos:**

1. El usuario hace clic en la lupa (buscador global) en el topbar
2. Escribe `192.168.88.10` y presiona Enter
3. El frontend llama:
   - Método: `GET`
   - Ruta: `/api/network/search`
   - Parámetros: `?q=192.168.88.10`
   - API externa: MikroTik ARP + Wazuh agents + GLPI assets (queries en paralelo)
4. El backend agrega resultados de los 3 sistemas y los devuelve en un array unificado
5. El frontend muestra los resultados agrupados por fuente

**Resultado:**
El técnico ve en una sola pantalla:
- **MikroTik ARP**: `192.168.88.10` → MAC `52:54:00:AA:BB:01` → interfaz `ether2` → comentario `lubuntu_desk_1`
- **Wazuh**: Agente `004 (lubuntu_desk_1)`, estado `active`, último keep-alive hace 3 min
- **GLPI**: `PC-Lab-01`, OS `Lubuntu 22.04`, asignado a `Juan Pérez`, Lab Redes

**Datos de ejemplo (usando mock):**
```json
[
  {"source": "mikrotik_arp", "ip": "192.168.88.10", "mac": "52:54:00:AA:BB:01", "interface": "ether2"},
  {"source": "wazuh", "agent_id": "004", "name": "lubuntu_desk_1", "status": "active"},
  {"source": "glpi", "asset_id": 1, "name": "PC-Lab-01", "assigned_user": "juan.perez"}
]
```

**Casos de error posibles:**
- GLPI no disponible → Los resultados de GLPI son omitidos; MikroTik y Wazuh se incluyen normalmente
- IP no encontrada en ningún sistema → `"No results found for 192.168.88.10"` → La IP no existe o no ha generado tráfico

---

## Caso de uso 37: Sincronizar blacklist entre CrowdSec y MikroTik

**Situación:**
El técnico quiere verificar si todas las IPs baneadas por CrowdSec ya tienen su regla de bloqueo correspondiente en MikroTik, y aplicar la sincronización si hay diferencias.

**Actor:** Administrador de red

**Precondiciones:**
- CrowdSec LAPI disponible o modo mock
- MikroTik conectado

**Pasos:**

1. El usuario navega a **CrowdSec → Sincronización**
2. El frontend llama primero para ver el estado:
   - Método: `GET`
   - Ruta: `/api/crowdsec/sync/status`
   - API externa: CrowdSec LAPI + MikroTik API
3. El backend compara la lista de decisiones en CrowdSec contra las reglas de MikroTik
4. Devuelve las diferencias: IPs en CrowdSec pero no en MikroTik (`missing_in_mikrotik`) e IPs en MikroTik sin decisión CrowdSec (`missing_in_crowdsec`)
5. El técnico ve que `45.142.212.100` está en CrowdSec pero no en MikroTik
6. Hace clic en **Aplicar Sincronización** → `ConfirmModal`
7. Confirma
8. El frontend llama:
   - Método: `POST`
   - Ruta: `/api/crowdsec/sync/apply`
   - API externa: CrowdSec LAPI + MikroTik API
9. El backend agrega `45.142.212.100` a la `Blacklist_Automatica` de MikroTik
10. Guarda `ActionLog`: `action_type="crowdsec_sync"`, `ips_synced: 1`

**Resultado:**
La `Blacklist_Automatica` de MikroTik queda sincronizada con las decisiones activas de CrowdSec. El resumen muestra `1 IP agregada, 0 eliminadas`.

**Datos de ejemplo (usando mock):**
```json
{
  "missing_in_mikrotik": ["45.142.212.100"],
  "missing_in_crowdsec": [],
  "crowdsec_total": 6, "mikrotik_total": 4, "in_sync": false
}
```

**Casos de error posibles:**
- CrowdSec no disponible → `"CrowdSec LAPI unreachable"` → Solo funciona en modo mock
- MikroTik desconectado → Reconexión automática → Si persiste: sincronización cancelada

---

# CrowdSec

## Caso de uso 38: Ver decisiones activas y score de reputación

**Situación:**
El técnico quiere ver qué IPs están actualmente baneadas por CrowdSec, cuánto tiempo lleva cada ban y qué escenario lo disparó.

**Actor:** Analista de seguridad

**Precondiciones:**
- CrowdSec LAPI disponible en `localhost:8080` o modo mock
- La `CROWDSEC_API_KEY` está configurada en `.env`

**Pasos:**

1. El usuario navega a **CrowdSec → Decisiones**
2. El frontend llama:
   - Método: `GET`
   - Ruta: `/api/crowdsec/decisions`
   - Parámetros: `?limit=50&offset=0`
   - API externa: CrowdSec LAPI (`GET /v1/decisions`)
3. El backend llama a la LAPI local y agrega `community_score` de la intel feed
4. El frontend muestra tabla con: IP, tipo (`ban`/`captcha`), duración, escenario, país (`AS`), `community_score`, fecha de expiración

**Resultado:**
El técnico ve 6 decisiones activas encabezadas por `203.0.113.45` (ban 24h, `crowdsecurity/ssh-bf`, CN, Chinanet, score 95) y `198.51.100.22` (ban 48h, `crowdsecurity/port-scan`, RU, score 87).

**Datos de ejemplo (usando mock):**
```json
[
  {"id": "cs-1", "ip": "203.0.113.45", "type": "ban", "duration": "24h",
   "scenario": "crowdsecurity/ssh-bf", "country": "CN", "as_name": "AS4134 Chinanet",
   "community_score": 95, "expires_at": "...", "is_known_attacker": true},
  {"id": "cs-5", "ip": "91.108.56.130", "type": "captcha", "duration": "1h",
   "scenario": "crowdsecurity/http-crawl", "country": "UA", "community_score": 45}
]
```

**Casos de error posibles:**
- CrowdSec LAPI no disponible y mock desactivado → `"CrowdSec LAPI unreachable: Connection refused on port 8080"`
- API Key inválida → `"CrowdSec authentication failed"` → Verificar `CROWDSEC_API_KEY` en `.env`

---

## Caso de uso 39: Bloqueo completo en todas las capas para una IP

**Situación:**
Una IP particularmente peligrosa (`198.51.100.22`, escaner de puertos activo, score 87) necesita ser bloqueada en todas las capas del sistema simultáneamente: CrowdSec + MikroTik.

**Actor:** Administrador de red

**Precondiciones:**
- CrowdSec LAPI disponible o modo mock
- MikroTik disponible
- `ConfirmModal` aceptado

**Pasos:**

1. El usuario navega a **CrowdSec → Decisiones**
2. Selecciona `198.51.100.22` y hace clic en **Full Remediation** → `ConfirmModal`
3. Confirma
4. El frontend llama:
   - Método: `POST`
   - Ruta: `/api/crowdsec/remediation/full`
   - API externa: CrowdSec LAPI + MikroTik API + DB
   - Body:
```json
{
  "ip": "198.51.100.22",
  "duration": "48h",
  "reason": "Port-scan activo — bloqueo full stack",
  "layers": ["crowdsec", "mikrotik"]
}
```
5. El backend:
   a. Agrega la decisión `ban` en CrowdSec LAPI para `198.51.100.22`
   b. Agrega `198.51.100.22` a la `Blacklist_Automatica` de MikroTik
6. Guarda `ActionLog`: `action_type="full_remediation"`, `layers_applied: ["crowdsec","mikrotik"]`

**Resultado:**
La IP `198.51.100.22` está bloqueada en ambas capas: CrowdSec descarta las peticiones y MikroTik bloquea el tráfico de red. Doble protección sin gaps.

**Datos de ejemplo (usando mock):**
```json
{
  "ip": "198.51.100.22",
  "layers_applied": ["crowdsec", "mikrotik"],
  "crowdsec_decision_id": "manual-198.51.100.22",
  "mikrotik_rule_added": true
}
```

**Casos de error posibles:**
- CrowdSec LAPI no disponible → Solo la capa MikroTik se aplica → Se registra `layers_applied: ["mikrotik"]` con advertencia
- MikroTik no disponible → Solo CrowdSec aplica → Se registra advertencia en ambos logs

---

## Caso de uso 40: Detectar desincronización entre CrowdSec y MikroTik

**Situación:**
El técnico quiere auditar si hay IPs que CrowdSec detectó como peligrosas pero que todavía no tienen regla en MikroTik (o viceversa).

**Actor:** Analista de seguridad

**Precondiciones:**
- CrowdSec y MikroTik disponibles (o mock)

**Pasos:**

1. El usuario navega a **CrowdSec → Sincronización**
2. El frontend llama:
   - Método: `GET`
   - Ruta: `/api/crowdsec/sync/status`
   - API externa: CrowdSec LAPI + MikroTik API
3. El backend compara las dos listas y construye el diff
4. El frontend muestra: total en CrowdSec, total en MikroTik, IPs únicas en cada uno, y el flag `"in_sync": false/true`

**Resultado:**
El técnico ve que hay 1 IP en CrowdSec sin regla en MikroTik: `45.142.212.100` (baneada en CrowdSec por `crowdsecurity/wordpress-bf`). Procede al caso de uso 37 para sincronizar.

**Datos de ejemplo (usando mock):**
```json
{
  "crowdsec_total": 6,
  "mikrotik_total": 4,
  "missing_in_mikrotik": ["45.142.212.100"],
  "missing_in_crowdsec": [],
  "in_sync": false
}
```

**Casos de error posibles:**
- CrowdSec no disponible → `"Cannot check sync status: CrowdSec unreachable"` → Solo visible en modo mock

---

## Caso de uso 41: Agregar IP a whitelist para evitar falsos positivos

**Situación:**
El servidor de respaldo de la facultad (`109.234.161.10`) fue baneado por CrowdSec por mucho volumen de conexiones (falso positivo). El técnico lo agrega a la whitelist para que no sea bloqueado en el futuro.

**Actor:** Administrador de red

**Precondiciones:**
- La IP objetivo tiene una decisión activa en CrowdSec
- Se confirmó que no es un atacante real

**Pasos:**

1. El usuario navega a **CrowdSec → Whitelist**
2. Hace clic en **Agregar a Whitelist**
3. Ingresa `109.234.161.10`, comentario `"Servidor backup facultad — falso positivo"`
4. El frontend llama:
   - Método: `POST`
   - Ruta: `/api/crowdsec/whitelist`
   - API externa: Local DB (no se llama a CrowdSec LAPI en esta versión)
   - Body:
```json
{"ip": "109.234.161.10", "comment": "Servidor backup facultad — falso positivo"}
```
5. El backend guarda la entrada en DB local
6. El frontend muestra la lista actualizada de IPs en whitelist

**Resultado:**
La IP `109.234.161.10` queda en la whitelist local de NetShield. Las futuras sincronizaciones de CrowdSec con MikroTik ignorarán esta IP y no aplicarán bloqueos sobre ella.

**Datos de ejemplo:**
```json
{"id": 1, "ip": "109.234.161.10", "comment": "Servidor backup facultad — falso positivo", "added_at": "2026-04-13T20:00:00+00:00"}
```

**Casos de error posibles:**
- IP ya en whitelist → `"IP 109.234.161.10 ya está en la whitelist"` → No se duplica
- Formato IP inválido → Pydantic rechaza → `422`

---

## Caso de uso 42: Ver contexto completo de una IP

**Situación:**
El técnico quiere investigar una IP desconocida (`203.0.113.45`) y ver toda la inteligencia disponible: decisiones en CrowdSec, reglas en MikroTik y alertas en Wazuh.

**Actor:** Analista de seguridad

**Precondiciones:**
- CrowdSec, MikroTik y Wazuh disponibles (o mock)

**Pasos:**

1. El usuario hace clic en la IP `203.0.113.45` en cualquier parte del dashboard (tarjeta de alerta, tabla de firewall, buscador global)
2. El frontend llama:
   - Método: `GET`
   - Ruta: `/api/crowdsec/context/ip/203.0.113.45`
   - API externa: CrowdSec LAPI + MikroTik API + Wazuh API
3. El backend agrega en paralelo: decisiones CrowdSec para esa IP, reglas de firewall en MikroTik, alertas recientes en Wazuh
4. El frontend muestra un panel lateral con toda la información

**Resultado:**
El técnico ve:
- **CrowdSec**: Baneada 24h por `crowdsecurity/ssh-bf`, score 95, reportada por 1250 instancias globales
- **MikroTik**: Regla activa en `Blacklist_Automatica` (chain forward, action drop)
- **Wazuh**: 14 alertas en los últimos 60 minutos, técnica `T1110 Brute Force`

**Datos de ejemplo (usando mock):**
```json
{
  "ip": "203.0.113.45",
  "crowdsec": {"decision": "ban", "scenario": "crowdsecurity/ssh-bf", "community_score": 95},
  "mikrotik": {"blocked": true, "list": "Blacklist_Automatica", "rule_id": "*1"},
  "wazuh": {"alert_count": 14, "top_technique": "T1110 Brute Force", "last_seen": "hace 2 min"}
}
```

**Casos de error posibles:**
- Una o más fuentes no disponibles → Se devuelven los datos disponibles con `null` en los campos faltantes

---

# Reportes IA

## Caso de uso 43: Generar reporte ejecutivo de incidentes del día

**Situación:**
El técnico necesita presentar el estado de seguridad del día al director. Quiere un resumen en lenguaje no técnico generado automáticamente por IA con los datos reales del sistema.

**Actor:** Técnico de redes / Administrador

**Precondiciones:**
- Anthropic API key configurada en `.env` o `MOCK_ANTHROPIC=true`
- Wazuh y MikroTik con datos del período

**Pasos:**

1. El usuario navega a **Reportes**
2. Selecciona audiencia `ejecutivo`, período `"Últimas 24 horas"`, prompt opcional `"Enfocarse en el ataque de brute-force de esta mañana"`
3. Hace clic en **Generar Reporte**
4. El frontend llama:
   - Método: `POST`
   - Ruta: `/api/reports/generate`
   - API externa: Anthropic API (Claude) + Wazuh API + MikroTik API + DB (con function calling)
   - Body:
```json
{"audience": "ejecutivo", "period": "24h", "prompt": "Enfocarse en el ataque de brute-force de esta mañana"}
```
5. El backend:
   a. Crea el system prompt con el contexto de audiencia `ejecutivo` (lenguaje de negocio, sin términos técnicos)
   b. Claude hace function calling para `get_wazuh_alerts()`, `get_mikrotik_connections()`, `get_blocked_ips()` etc.
   c. El backend ejecuta cada tool call y devuelve los datos a Claude
   d. Claude genera el HTML del reporte
6. El backend guarda el reporte en el historial (`report_history`)
7. Guarda `ActionLog`: `action_type="report_generated"`, `audience="ejecutivo"`, `tokens_used`
8. El frontend carga el reporte en el editor TipTap (editable)

**Resultado:**
El director recibe un reporte HTML con resumen ejecutivo: "El 13 de abril se detectaron 45 eventos de seguridad, de los cuales 14 fueron críticos. El incidente más grave fue un ataque sostenido contra el servidor del laboratario de redes, bloqueado automáticamente por el sistema. **Sin impacto en servicios.**"

**Datos de ejemplo (usando mock):**
```json
{
  "title": "Informe de Seguridad — últimas 24h",
  "audience": "ejecutivo",
  "tokens_used": 1247,
  "data_sources_used": ["get_wazuh_alerts", "get_mikrotik_connections"]
}
```

**Casos de error posibles:**
- Anthropic API no disponible y mock desactivado → `"Failed to generate report: Anthropic API error"` → Activar `MOCK_ANTHROPIC=true`
- Prompt con intento de inyección → El system prompt limita el scope de Claude → No se filtra información sensible fuera del scope

---

## Caso de uso 44: Generar reporte técnico para el equipo de IT

**Situación:**
El equipo de IT necesita un reporte técnico detallado con IPs, reglas de firewall aplicadas y técnicas MITRE detectadas para analizar el incidente del día.

**Actor:** Técnico de redes / Analista de seguridad

**Precondiciones:**
- Idem caso 43 (Anthropic configurado o mock)

**Pasos:**

1. El usuario navega a **Reportes**
2. Selecciona audiencia `tecnico`, período `"Últimas 24 horas"`, prompt `"Incluir tabla de IPs bloqueadas y técnicas MITRE detectadas"`
3. El proceso es idéntico al caso 43 excepto que el system prompt usa el perfil `"tecnico"`:
   - Incluye IPs, reglas, comandos, técnicas MITRE con IDs
   - Lenguaje técnico, tablas y código
   - Recomendaciones con comandos RouterOS y configuración de Wazuh
4. El frontend llama:
   - Método: `POST`
   - Ruta: `/api/reports/generate`
   - Body:
```json
{"audience": "tecnico", "period": "24h", "prompt": "Incluir tabla de IPs bloqueadas y técnicas MITRE detectadas"}
```

**Resultado:**
El reporte incluye: tabla de alertas por severidad, tabla de técnicas MITRE (T1110: 45, T1566: 12), lista de IPs bloqueadas (`203.0.113.45`, `198.51.100.22`), recomendaciones técnicas como `"Aplicar fail2ban en el servidor Wazuh"` y `"Revisar cable ether3 (3 errores RX)"`.

**Datos de ejemplo (usando mock — fragmento HTML):**
```html
<h2>Técnicas MITRE ATT&CK Detectadas</h2>
<table>
  <tr><td>Brute Force</td><td>T1110</td><td>45</td></tr>
  <tr><td>Phishing</td><td>T1566</td><td>12</td></tr>
</table>
<h2>Acciones Recomendadas</h2>
<ol>
  <li>Mantener bloqueo de <code>203.0.113.45</code> en Blacklist_Automatica.</li>
  <li>Revisar logs de autenticación en <code>PC-Lab-01</code> y <code>PC-Lab-02</code>.</li>
</ol>
```

**Casos de error posibles:**
- Idem caso 43

---

## Caso de uso 45: Exportar reporte generado a PDF

**Situación:**
El técnico editó el reporte en el editor TipTap y necesita exportarlo como PDF para adjuntarlo al ticket de GLPI del incidente.

**Actor:** Técnico de redes

**Precondiciones:**
- Un reporte previamente generado (en el editor TipTap)
- WeasyPrint instalado en el backend

**Pasos:**

1. El usuario edita el reporte en el editor TipTap (ajusta el título, agrega una nota manual)
2. Hace clic en **Exportar PDF**
3. El frontend llama:
   - Método: `POST`
   - Ruta: `/api/reports/export-pdf`
   - API externa: Internal (WeasyPrint — CPU-bound, ejecuta en `run_in_executor`)
   - Body:
```json
{
  "html_content": "<h1>Informe de Seguridad...</h1> ...",
  "title": "Informe de Seguridad — 2026-04-13"
}
```
4. El backend:
   a. Renderiza el HTML en la plantilla base `backend/templates/report_base.html` (con CSS y logos)
   b. Ejecuta `WeasyPrint.HTML(string=html_rendered).write_pdf()` en `run_in_executor`
   c. Devuelve el PDF como `application/pdf`
5. El navegador descarga automáticamente el archivo `informe-seguridad-2026-04-13.pdf`

**Resultado:**
El técnico tiene un PDF bien formateado con encabezado del sistema, tabla de contenidos, tablas de alertas y el texto del análisis. Lo adjunta al ticket `#4` en GLPI.

**Casos de error posibles:**
- WeasyPrint no instalado → `500: "WeasyPrint is not available"` → Instalar con `pip install weasyprint`
- HTML inválido → WeasyPrint puede fallar → El backend devuelve el error de parseo
- CPU sobrecargada → El proceso tarda más de 30s → El frontend muestra spinner de carga

---

# Buscador Global

## Caso de uso 46: Buscar una IP y ver todos sus datos unificados

**Situación:**
El técnico quiere, desde cualquier pantalla del dashboard, buscar una IP específica y ver toda la información disponible en los sistemas integrados sin cambiar de vista.

**Actor:** Técnico de redes

**Precondiciones:**
- Buscador global inicializado en el topbar
- Al menos un sistema (MikroTik, Wazuh o GLPI) disponible

**Pasos:**

1. El usuario hace clic en el icono de búsqueda (🔍) en el topbar del dashboard
2. Escribe `192.168.88.11` (IP de lubuntu_desk_2) en el campo de búsqueda
3. El frontend llama:
   - Método: `GET`
   - Ruta: `/api/network/search`
   - Parámetros: `?q=192.168.88.11`
   - API externa: MikroTik ARP + Wazuh agents/alerts + GLPI assets
4. Adicionalmente, si el usuario quiere contexto CrowdSec (para IPs externas):
   - Método: `GET`
   - Ruta: `/api/crowdsec/context/ip/192.168.88.11`
   - API externa: CrowdSec + MikroTik + Wazuh
5. El frontend muestra los resultados agrupados por fuente en un panel lateral

**Resultado:**
El técnico ve en segundos: la entrada ARP (`lubuntu_desk_2`, MAC `52:54:00:AA:BB:02`, `ether2`), el agente Wazuh (`005`, estado `active`, 18 alertas), y el activo GLPI (`PC-Lab-02`, asignado a `María García`). Todo desde la búsqueda, sin navegar.

**Datos de ejemplo (usando mock):**
```json
[
  {"source": "mikrotik_arp", "ip": "192.168.88.11", "mac": "52:54:00:AA:BB:02", "interface": "ether2"},
  {"source": "wazuh", "agent_id": "005", "name": "lubuntu_desk_2", "status": "active"},
  {"source": "glpi", "asset_id": 2, "name": "PC-Lab-02", "assigned_user": "maria.garcia"}
]
```

**Casos de error posibles:**
- Ningún sistema tiene datos de la IP → `"No results found"` → La IP no existe en la red o no generó eventos
- Query con menos de 2 caracteres → `422` → El buscador requiere mínimo 2 caracteres

---

## Caso de uso 47: Buscar por MAC y encontrar el equipo en inventario

**Situación:**
El técnico tiene una MAC address anotada de un reporte de incidente (`52:54:00:CC:DD:01`) y necesita identificar a qué equipo pertenece y dónde está físicamente.

**Actor:** Técnico de soporte

**Precondiciones:**
- MikroTik tiene la entrada ARP (el equipo hizo tráfico recientemente)
- GLPI tiene el equipo registrado con esa MAC

**Pasos:**

1. El usuario hace clic en el buscador global en el topbar
2. Escribe `52:54:00:CC:DD:01` (MAC address)
3. El frontend llama:
   - Método: `GET`
   - Ruta: `/api/mikrotik/arp/search`
   - Parámetros: `?mac=52:54:00:CC:DD:01`
   - API externa: MikroTik API (filtra tabla ARP por MAC)
4. Obtiene la IP asociada: `192.168.88.20`
5. Llama a la búsqueda unificada con esa IP:
   - Método: `GET`
   - Ruta: `/api/network/search`
   - Parámetros: `?q=192.168.88.20`
6. El frontend muestra los resultados

**Resultado:**
El técnico descubre que la MAC `52:54:00:CC:DD:01` pertenece a `PC-Aula3-01 (192.168.88.20)`, en `Aula 101 (Edificio A > Aula 101)`, agente Wazuh desconectado. Puede ir físicamente al aula a revisar el equipo.

**Datos de ejemplo (usando mock):**
```json
[
  {"source": "mikrotik_arp", "ip": "192.168.88.20", "mac": "52:54:00:CC:DD:01", "interface": "ether3", "comment": "PC-Aula3-01"},
  {"source": "glpi", "asset_id": 3, "name": "PC-Aula3-01", "location": "Aula 101"}
]
```

**Casos de error posibles:**
- MAC no en tabla ARP → El equipo no está actualmente conectado → El técnico puede buscar directamente en GLPI por nombre
- MAC no registrada en GLPI → Resultado solo de MikroTik → El equipo no fue registrado en inventario

---

# CLI Remoto

> Las funcionalidades de CLI remoto permiten ejecutar comandos y acciones sobre MikroTik RouterOS y agentes Wazuh directamente desde el dashboard, sin necesidad de abrir una terminal o conectarse por SSH.

## Caso de uso 48: Ejecutar comando de consulta en RouterOS desde el dashboard

**Situación:**
El técnico necesita verificar rápidamente el estado de las rutas del router (`/ip/route/print`) sin abrir Winbox o PuTTY.

**Actor:** Técnico de redes

**Precondiciones:**
- MikroTik conectado o modo mock
- El comando a ejecutar está en la whitelist de comandos permitidos (solo lectura, `print` operations)

**Pasos:**

1. El usuario navega a **Sistema → CLI MikroTik**
2. Escribe el comando `/ip/route/print` en el campo de entrada
3. El frontend llama:
   - Método: `POST`
   - Ruta: `/api/cli/mikrotik`
   - API externa: MikroTik API (`execute_readonly_command`)
   - Body:
```json
{"command": "/ip/route print"}
```
4. El backend:
   a. Valida que el comando esté en la whitelist (solo paths `print` — NO `add`, `set`, `remove`)
   b. Ejecuta `service.execute_readonly_command("/ip/route print")`
   c. Devuelve el resultado como array de objetos
5. El frontend muestra la salida en formato de tabla o JSON

**Resultado:**
El técnico ve las rutas activas del router sin salir del dashboard. Puede verificar que la ruta default apunta a la WAN y que la ruta de la VLAN de cuarentena está desactivada.

```json
{
  "command": "/ip/route print",
  "output": [{"dst-address": "0.0.0.0/0", "gateway": "192.168.100.1", "check-gateway": "ping", "active": true}],
  "count": 1
}
```

**Casos de error posibles:**
- Comando destructivo (ej. `/ip/route add`) → `"Command not in whitelist: only read-only (print) commands are allowed"` → El servicio bloquea automáticamente
- Comando inexistente → MikroTik devuelve error → Se propaga al frontend como `"Failed to execute command: ..."`

---

## Caso de uso 49: Ver estado o reiniciar un agente Wazuh desde el dashboard

**Situación:**
El agente Wazuh de `PC-Aula3-01 (006)` aparece como `disconnected`. El técnico quiere revisar su estado y reiniciarlo remotamente si es posible.

**Actor:** Técnico de redes

**Precondiciones:**
- Wazuh Manager accesible
- Agente en estado `active` para poder enviar comandos (los agentes `disconnected` no pueden recibir comandos)

**Pasos:**

**Para ver el estado:**
1. El usuario navega a **Sistema → CLI Wazuh**
2. Selecciona el agente `006` y acción `status`
3. El frontend llama:
   - Método: `POST`
   - Ruta: `/api/cli/wazuh-agent`
   - API externa: Wazuh API
   - Body:
```json
{"agent_id": "006", "action": "status"}
```
4. El backend devuelve el objeto completo del agente: estado, OS, último keep-alive, grupo

**Para reiniciar:**
1. (Si el agente estuviera activo) Selecciona acción `restart`
2. El frontend llama:
   - Body:
```json
{"agent_id": "006", "action": "restart"}
```
3. El backend ejecuta `wazuh.send_active_response("006", "restart-wazuh0")`
4. El agente recibe la señal de reinicio desde el manager

**Acciones disponibles:** `status`, `restart`

**Resultado del status:**
```json
{
  "action": "status", "agent_id": "006",
  "agent": {"id": "006", "name": "PC-Aula3-01", "ip": "192.168.88.20",
            "status": "disconnected", "last_keep_alive": "2026-04-13T16:00:00+00:00"}
}
```
El técnico confirma que el agente está desconectado desde hace 3 horas. Va físicamente al Aula 101 a revisar el equipo.

**Datos de ejemplo (restart sobre agente activo):**
```json
{"action": "restart", "agent_id": "004", "result": {"status": "sent"}}
```

**Casos de error posibles:**
- Acción inválida (ej. `"delete"`) → `"Invalid action 'delete'. Allowed: restart, status"`
- Agente `disconnected` con acción `restart` → Wazuh no puede entregar el comando → El técnico debe reiniciar manualmente el servicio `wazuh-agent` en el host

---

---

# Flujos End-to-End

> Los flujos end-to-end combinan múltiples herramientas para resolver incidentes complejos de seguridad o gestión de red. Describen secuencias completas de acciones coordinadas entre subsistemas.

---

## Flujo E2E 1: Detección y bloqueo de ataque de brute-force

**Escenario:** Un atacante externo (`203.0.113.45`) está ejecutando un ataque de brute-force SSH contra `lubuntu_desk_1 (192.168.88.10)`.

### Fase 1 — Detección automática (sin acción del técnico)
1. **WebSocket `/ws/alerts` emite** (cada 25 segundos en mock): alerta nivel 12 `"Authentication failure"` con `src_ip: 203.0.113.45`
2. **`/ws/security/alerts` emite** la notificación: `"Brute-force detectado: 203.0.113.45 — Acción: [Bloquear]"`
3. El técnico recibe la notificación en el `NotificationPanel` del dashboard

### Fase 2 — Investigación
4. El técnico hace clic en la notificación → se abre el panel de alerta
5. **`GET /api/wazuh/alerts/agent/004`** → confirma 12 intentos en 2 minutos
6. **`GET /api/mikrotik/connections`** → verifica conexión activa `192.168.88.10:54321 → 203.0.113.45:443`
7. **`GET /api/crowdsec/context/ip/203.0.113.45`** → score 95, CrowdSec la conoce como `crowdsecurity/ssh-bf` (CN)

### Fase 3 — Bloqueo coordinado
8. El técnico hace clic en **[Bloquear]** en la notificación
9. **`POST /api/security/auto-block`** → valida alerta en Wazuh + agrega a `Blacklist_Automatica` en MikroTik
10. **`POST /api/crowdsec/remediation/full`** → agrega decisión en CrowdSec también

### Fase 4 — Documentación
11. **`POST /api/glpi/tickets`** → el técnico crea ticket `"[NetShield] Ataque brute-force 203.0.113.45"` asociado a `PC-Lab-01 (asset_id: 1)`
12. **`POST /api/reports/generate`** (audiencia `tecnico`, período `"Última hora"`) → genera reporte con el timeline del ataque
13. **`POST /api/reports/export-pdf`** → exporta el reporte → adjunta al ticket de GLPI

**Resultado final:** El atacante está bloqueado en MikroTik y CrowdSec. El incidente está documentado en GLPI con ticket y reporte PDF adjunto. El historial de acciones muestra toda la cadena de eventos.

**Rutas utilizadas en secuencia:**

| Paso | Método | Ruta | Sistema |
|------|--------|------|---------|
| 1-3 | WS | `/ws/alerts`, `/ws/security/alerts` | Wazuh |
| 5 | GET | `/api/wazuh/alerts/agent/004` | Wazuh |
| 6 | GET | `/api/mikrotik/connections` | MikroTik |
| 7 | GET | `/api/crowdsec/context/ip/203.0.113.45` | CrowdSec+Wazuh+MikroTik |
| 9 | POST | `/api/security/auto-block` | MikroTik+Wazuh |
| 10 | POST | `/api/crowdsec/remediation/full` | CrowdSec+MikroTik |
| 11 | POST | `/api/glpi/tickets` | GLPI |
| 12 | POST | `/api/reports/generate` | Anthropic+Wazuh+MikroTik |
| 13 | POST | `/api/reports/export-pdf` | Internal |

---

## Flujo E2E 2: Respuesta a incidente de phishing

**Escenario:** Un docente hizo clic en un link de phishing que apunta a `http://evil-phishing.com/login`. Wazuh lo detecta.

### Fase 1 — Detección vía WebSocket
1. **`/ws/security/alerts`** emite: `"Phishing detectado: 203.0.113.99"` con acciones `[block_ip, sinkhole_domain, dismiss]`
2. El técnico recibe la notificación con las 3 acciones disponibles

### Fase 2 — Investigación
3. **`GET /api/phishing/victims`** → confirma que `PC-Aula3-01 (192.168.88.20)` accedió 3 veces a `http://evil-phishing.com/login`
4. **`GET /api/phishing/domains/suspicious`** → muestra que `evil-phishing.com` tiene 3 registros con el dominio agrupado
5. **`GET /api/phishing/urls/timeline`** → ve el spike de 8 alertas en los últimos 15 minutos

### Fase 3 — Contención
6. El técnico hace clic en **[Sinkhole Domain]**:
   - **`POST /api/phishing/domains/sinkhole`** → `evil-phishing.com` → `127.0.0.1` en DNS MikroTik + guarda en `SinkholeEntry`
7. Hace clic en **[Block IP]**:
   - **`POST /api/phishing/ip/block`** → `203.0.113.99` → lista `Phishing_Block` en MikroTik

### Fase 4 — Cuarentena del equipo afectado
8. El técnico va a **Inventario → Activos → PC-Aula3-01**
9. Hace clic en **Cuarentena**:
   - **`POST /api/security/quarantine`** → intento de mover puente (log de auditoría en lab)
   - **`POST /api/glpi/assets/3/quarantine`** → cambio de estado en GLPI + ticket automático `[NetShield] Cuarentena automática — PC-Aula3-01`

### Fase 5 — Reporte
10. **`POST /api/reports/generate`** (audiencia `ejecutivo`) → reporte con el resumen del incidente de phishing
11. **`POST /api/reports/export-pdf`** → PDF para el comité de seguridad

**Resultado final:** El dominio malicioso está en el sinkhole, la IP C2 bloqueada, el equipo afectado documentado como en cuarentena en GLPI, y el director tiene un reporte en PDF con el resumen del incidente.

---

## Flujo E2E 3: Incorporación de nuevo equipo al sistema

**Escenario:** Llegan 2 laptops nuevas para el laboratorio de redes. El técnico las incorpora al ecosistema completo.

### Paso 1 — Inventario
1. **`POST /api/glpi/assets`** × 2 → registra `PC-Lab-03` y `PC-Lab-04` en GLPI con serial, OS y ubicación `Lab Redes`

### Paso 2 — Red
2. Los equipos se conectan al switch en `ether2`
3. **`GET /api/mikrotik/arp`** → confirma que aparecen en la tabla ARP con sus MACs
4. **`POST /api/network/labels`** × 2 → asigna labels descriptivos a sus IPs

### Paso 3 — Segmentación
5. El técnico decide ponerlos en la VLAN de estudiantes
6. **`GET /api/mikrotik/vlans/`** → revisa que `vlan20 (VLAN Estudiantes)` existe
7. Configura los puertos del switch físico (fuera del scope del dashboard)

### Paso 4 — Portal Cautivo
8. **`POST /api/portal/users/bulk`** → crea los usuarios `lab03-user` y `lab04-user` en el Hotspot con perfil `estudiantes`

### Paso 5 — Verificación
9. **`GET /api/glpi/assets/health`** → confirma que los 2 nuevos equipos están en GLPI pero su agente Wazuh aún no está conectado (`health: "warning"`)
10. El técnico instala el agente Wazuh en los equipos
11. **`GET /api/wazuh/agents`** → confirma que los nuevos agentes aparecen como `active`
12. **`GET /api/glpi/assets/health`** → los 2 equipos pasan a `health: "ok"`

**Resultado final:** Los 2 equipos están en GLPI, en la tabla ARP, en el Portal Cautivo y monitoreados por Wazuh. El ecosistema está completo para esos equipos.

---

## Flujo E2E 4: Sincronización completa CrowdSec → MikroTik (inicio de turno)

**Escenario:** El técnico inicia su turno de seguridad y quiere asegurarse de que MikroTik esté 100% sincronizado con las decisiones actuales de CrowdSec antes de comenzar el monitoreo.

### Paso 1 — Verificar estado
1. **`GET /api/crowdsec/sync/status`** → ve que hay 2 IPs en CrowdSec que no están en MikroTik:
   - `45.142.212.100` (`wordpress-bf`, NL, score 78)
   - `91.108.56.130` (`http-crawl`, UA, score 45)

### Paso 2 — Revisar contexto de cada IP antes de sincronizar
2. **`GET /api/crowdsec/context/ip/45.142.212.100`** → confirma: no está en whitelist, no tiene alertas Wazuh internas → procede
3. **`GET /api/crowdsec/context/ip/91.108.56.130`** → score bajo (45), tipo `captcha` no `ban` → el técnico decide NO sincronizar esta IP

### Paso 3 — Sincronización selectiva
4. **`POST /api/crowdsec/remediation/full`** → aplica solo `45.142.212.100` en MikroTik
5. La segunda IP (`91.108.56.130`) se deja fuera por score bajo

### Paso 4 — Verificación post-sync
6. **`GET /api/crowdsec/sync/status`** → ahora muestra `in_sync: true` para las IPs `ban` (el `captcha` no se sincroniza)
7. **`GET /api/mikrotik/firewall/rules`** → confirma la nueva regla para `45.142.212.100`
8. **`GET /api/actions/history`** → el técnico revisa el historial completo de acciones del turno anterior

**Resultado final:** MikroTik está sincronizado con las decisiones `ban` de CrowdSec. El técnico tiene visibilidad completa del estado del sistema para comenzar su turno de monitoreo.

---

# Información del Documento

- **Generado:** 2026-04-13T20:00:00-03:00
- **Fuente de verdad:** Código de routers en `backend/routers/` (commits en rama `demo`)
- **Datos de ejemplo:** `backend/services/mock_data.py` (seed 42, reproducible)
- **Routers analizados:** `mikrotik.py`, `wazuh.py`, `vlans.py`, `phishing.py`, `portal.py`, `glpi.py`, `security.py`, `crowdsec.py`, `reports.py`, `network.py`, `cli.py`
- **Servicios analizados:** `mikrotik_service.py`, `wazuh_service.py`, `glpi_service.py`, `ai_service.py`, `pdf_service.py`, `portal_service.py`, `mock_data.py`, `mock_service.py`
- **Total de casos de uso documentados:** 49 casos + 4 flujos end-to-end
- **Total de endpoints referenciados:** 83 REST + 5 WebSocket

## Leyenda de marcas especiales

| Marca | Significado |
|-------|-------------|
| `[PARCIAL]` | Funcionalidad implementada parcialmente en el código actual. Se aplica con limitaciones en el lab de VirtualBox. |
| `⚠️ Solo disponible con APP_ENV=lab` | El endpoint solo está habilitado en entorno de laboratorio. No exponer en producción. |
| `ActionLog` | La acción genera un registro de auditoría en la tabla `action_logs` de SQLite. |
| `ConfirmModal` | La acción destructiva requiere confirmación explícita del usuario en el componente `ConfirmModal`. |

