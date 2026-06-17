solo revisa el codigo, no implementes nada
quiero darle mas importancia a las funcionalidades de microtik, glpi, e hibridas entre ambas
indicame cuales puedo agregar?vale la pena?
Revisé exhaustivamente el código. Te dejo el análisis completo en el artefacto, pero aquí van los hallazgos clave:

Diagnóstico Rápido
GLPI está sub-representada en el frontend — tiene 41KB de servicio backend pero solo 4 widgets de 55. Hay una brecha grande entre lo que el backend puede hacer y lo que el usuario ve.

MikroTik tiene funcionalidades expuestas en el CLI whitelist (NAT, rutas, bridge) pero sin endpoints dedicados ni UI.

Los híbridos MikroTik×GLPI son casi inexistentes — solo 1 widget directo (DHCP Discovery). Este es el espacio con mayor potencial.

Top 5 propuestas que más valen la pena:
Asset Lifecycle MikroTik→GLPI — Al bloquear una IP, saber automáticamente que es "la PC de Juan en Aula 301" y ofrecer crear ticket. Transforma el dashboard de herramienta de red a herramienta de gestión operativa.

Correlación ARP↔GLPI — Detectar dispositivos conectados a la red que no están en el inventario GLPI. Control de activos real.

NAT Rules Viewer — Casi gratis de implementar (ya está en el whitelist CLI). Completa la visibilidad del firewall.

Inventario de Red (rutas, IPs, bridge) — Le da al dashboard visión de la topología de red.

Bandwidth por Activo GLPI — Enriquecer el widget BandwidthTop con nombre de equipo, ubicación y propietario desde GLPI.





# Análisis: Funcionalidades MikroTik, GLPI e Híbridas

> Revisión del código actual + propuestas de expansión

---

## 1. Estado Actual — ¿Qué hay implementado?

### MikroTik (39KB servicio, 7KB router)

| Área | Funciones | Estado |
|------|-----------|--------|
| Interfaces | GET listado + tráfico delta | ✅ Completo |
| Firewall | Rules, block/unblock IP | ✅ Completo |
| ARP | Tabla + búsqueda por IP/MAC | ✅ Completo |
| VLANs | CRUD + tráfico por VLAN | ✅ Completo |
| DHCP | 20 métodos (servers, leases, pools, networks, rogue alerts, options) | ✅ Completo |
| DNS Estático | Sinkhole add/remove/list | ✅ Completo |
| Address Lists | add/remove/get | ✅ Completo |
| System Health | CPU, RAM, uptime | ✅ Completo |
| CLI Remoto | Read-only con whitelist | ✅ Completo |
| Hotspot | 16 funciones (portal service) | ✅ Completo |
| **NAT** | ❌ No expuesto | 🔴 Ausente |
| **Queues** | ❌ No expuesto | 🔴 Ausente |
| **Routes** | En whitelist CLI pero sin endpoint dedicado | 🟡 Parcial |
| **DNS Cache** | En whitelist CLI pero sin endpoint dedicado | 🟡 Parcial |
| **Bridge** | En whitelist CLI pero sin endpoint dedicado | 🟡 Parcial |

### GLPI (41KB servicio, 21KB router)

| Área | Funciones | Estado |
|------|-----------|--------|
| Computers/Assets | CRUD + búsqueda + stats | ✅ Completo |
| Tickets | CRUD + kanban + estado | ✅ Completo |
| Users | Lista + assets por usuario | ✅ Completo |
| Locations | Lista + assets por ubicación | ✅ Completo |
| Quarantine | Cuarentena + ticket automático | ✅ Completo |
| Health | Correlación GLPI+Wazuh+ARP | ✅ Completo |
| Network Context | IP → interfaz/VLAN vía ARP | ✅ Completo |
| Collector | Background sync cada 5min | ✅ Completo |
| **Printers** | ❌ No soportado | 🔴 Ausente |
| **Network Equipment** | ❌ No soportado | 🔴 Ausente |
| **Software Licenses** | ❌ No soportado | 🔴 Ausente |
| **Ticket followups** | ❌ No soportado | 🔴 Ausente |
| **Knowledge Base** | ❌ No soportado | 🔴 Ausente |

### Híbridos MikroTik × GLPI existentes

| Widget/Endpoint | Fuentes | Estado |
|----------------|---------|--------|
| Asset Health | GLPI + Wazuh + ARP (MikroTik) | ✅ |
| Network Context | GLPI asset → ARP → interfaz | ✅ |
| Quarantine | GLPI estado + MikroTik block | ✅ |
| Network Maintenance Ticket | MikroTik interfaz → ticket GLPI | ✅ |
| Suricata × GLPI | Alertas Suricata → inventario | ✅ |
| DHCP Discovery | Leases DHCP → cruce con GLPI | ✅ |
| Incident Lifecycle | Wazuh→CrowdSec→MikroTik→GLPI | ✅ |

---

## 2. Propuestas de Funcionalidades Nuevas

### 🟢 Prioridad Alta — Alto Valor, Esfuerzo Razonable

#### P1. **Inventario de Red MikroTik** (visual + technical)
> Endpoint dedicado para `/ip/route`, `/ip/address` y `/interface/bridge/port`

**¿Qué hace?** Muestra la topología de red real: rutas estáticas/dinámicas, IPs asignadas por interfaz, puertos del bridge. Esto le da al dashboard visibilidad completa de cómo está configurada la red.

**¿Vale la pena?** **Sí, mucho.** Actualmente el dashboard puede ver tráfico y firewall, pero no sabe *cómo está diseñada la red*. Para un dashboard de seguridad de red, tener visibilidad de la topología es fundamental.

| Componente | Detalle |
|-----------|---------|
| Backend | 3 métodos nuevos en `mikrotik_service.py` (`get_routes()`, `get_addresses()`, `get_bridge_ports()`) |
| Mock data | ~30 líneas por función |
| Frontend | 1 widget visual "Network Topology" + 1 widget técnico "Route Table" |
| Esfuerzo | 🟡 Medio (6-8h) |
| Valor | ⭐⭐⭐⭐⭐ |

---

#### P2. **Gestión de QoS / Queues** (standard + technical)
> Endpoint para `/queue/simple` — read + CRUD

**¿Qué hace?** Muestra las colas de limitación de ancho de banda, permite crear rate-limits por IP/subred desde el dashboard. Esto conecta directamente con la gestión de leases DHCP (limitar un dispositivo).

**¿Vale la pena?** **Sí.** Ya tenés el campo `rate_limit` en DHCP leases pero sin UI para gestionarlo globalmente. Las queues son la forma real de controlar bandwidth por host en MikroTik.

| Componente | Detalle |
|-----------|---------|
| Backend | `get_queues()`, `create_queue()`, `update_queue()`, `delete_queue()` en mikrotik_service |
| Router | `/api/mikrotik/queues` (GET, POST, PUT, DELETE) |
| Frontend | 1 página nueva o tab en Network, 1 widget técnico |
| Esfuerzo | 🟡 Medio (6-8h) |
| Valor | ⭐⭐⭐⭐ |

---

#### P3. **Correlación Automática ARP↔GLPI** (híbrido)
> Cruce automático: dispositivo en ARP → ¿existe en GLPI?

**¿Qué hace?** Detecta automáticamente equipos conectados a la red (ARP table) que **no están registrados en GLPI**. Genera alertas de "dispositivo no inventariado" y ofrece registrarlo con un clic.

**¿Vale la pena?** **Sí, es de las más valiosas.** Esto es control de activos real — saber si hay dispositivos rogue en la red que no están en el inventario. Ya tenés el cruce parcial en DHCP Discovery pero falta el flujo completo ARP→GLPI con acción de registro.

| Componente | Detalle |
|-----------|---------|
| Backend | Endpoint `/api/widgets/arp-inventory-gap` que cruza ARP con GLPI computers por IP/MAC |
| Frontend | 1 widget híbrido "Brecha de Inventario" + botón "Registrar en GLPI" |
| Mock data | ~40 líneas |
| Esfuerzo | 🟡 Medio (5-7h) |
| Valor | ⭐⭐⭐⭐⭐ |

---

#### P4. **NAT Rules Viewer** (technical)
> Endpoint para `/ip/firewall/nat`

**¿Qué hace?** Muestra las reglas NAT (src-nat, dst-nat, masquerade). Fundamental para entender el flujo de tráfico y diagnosticar problemas de conectividad.

**¿Vale la pena?** **Sí.** Ya está en el whitelist del CLI pero sin endpoint dedicado ni UI. Para un dashboard de infraestructura MikroTik, ver NAT es tan importante como ver el firewall.

| Componente | Detalle |
|-----------|---------|
| Backend | `get_nat_rules()` en mikrotik_service + router endpoint |
| Frontend | Tab "NAT" en FirewallPage o widget técnico |
| Esfuerzo | 🟢 Bajo (3-4h) |
| Valor | ⭐⭐⭐⭐ |

---

#### P5. **Asset Lifecycle MikroTik→GLPI** (híbrido)
> Cuando se bloquea una IP en MikroTik → buscar automáticamente el activo GLPI asociado

**¿Qué hace?** Enriquece cada acción de bloqueo de IP con el activo GLPI correspondiente. Al bloquear `192.168.1.50`, el sistema automáticamente muestra "Este es el equipo 'PC-Lab301' de Juan Pérez" y ofrece crear un ticket o ponerlo en cuarentena GLPI.

**¿Vale la pena?** **Absolutamente.** Es la pieza que conecta la seguridad operativa (MikroTik firewall) con la gestión de activos (GLPI). Actualmente el bloqueo de IP es "ciego" — no sabe a quién pertenece ese equipo.

| Componente | Detalle |
|-----------|---------|
| Backend | En `block_ip()` buscar matching GLPI asset y adjuntar info. Endpoint `/api/security/ip-asset-context/{ip}` |
| Frontend | Enriquecer ConfirmModal de bloqueo con info del activo |
| Esfuerzo | 🟡 Medio (5-6h) |
| Valor | ⭐⭐⭐⭐⭐ |

---

### 🟡 Prioridad Media — Buen Valor, Más Esfuerzo

#### P6. **DNS Cache Viewer + Analytics** (technical + visual)
> Endpoint para `/ip/dns/cache`

**¿Qué hace?** Muestra las consultas DNS cacheadas en MikroTik — permite detectar dominios sospechosos, ver qué resuelven los equipos de la red, y complementa el sinkhole.

| Esfuerzo | Valor |
|----------|-------|
| 🟡 Medio (4-5h) | ⭐⭐⭐ |

---

#### P7. **GLPI Network Equipment** (standard)
> Soporte para `NetworkEquipment` además de `Computer`

**¿Qué hace?** Extiende el inventario GLPI para incluir switches, APs, routers — no solo PCs. En un entorno de red, estos son activos críticos.

| Esfuerzo | Valor |
|----------|-------|
| 🟡 Medio (5-6h) | ⭐⭐⭐ |

---

#### P8. **Bandwidth por Activo GLPI** (híbrido nuevo)
> Widget que cruza: conexiones MikroTik (top consumers) con inventario GLPI

**¿Qué hace?** El widget `BandwidthTop` ya muestra las top IPs consumidoras. Este híbrido las enriquece con: nombre del activo GLPI, ubicación, propietario, estado de Wazuh. Saber que "la PC de María en Aula 102 está consumiendo 500 Mbps" es mucho más útil que ver "192.168.1.45 consume 500 Mbps".

| Esfuerzo | Valor |
|----------|-------|
| 🟡 Medio (5-6h) | ⭐⭐⭐⭐ |

---

#### P9. **Firewall Rule Impact Analysis** (híbrido)
> Cruce: reglas firewall MikroTik → activos GLPI afectados

**¿Qué hace?** Para cada regla de firewall que bloquea un rango o IP, muestra qué activos GLPI están afectados. "Esta regla drop afecta a 3 equipos del Aula 201".

| Esfuerzo | Valor |
|----------|-------|
| 🟠 Alto (6-8h) | ⭐⭐⭐⭐ |

---

#### P10. **GLPI Ticket desde Alerta de Red** (híbrido)
> Botón "Crear ticket" en cualquier alerta de seguridad (Wazuh, Suricata, CrowdSec)

**¿Qué hace?** Desde cualquier alerta, crear un ticket GLPI pre-rellenado con el contexto: IP, equipo, tipo de alerta, severidad. Ya existe `NetworkMaintenanceTicket` pero solo para errores de interfaz — esto lo generaliza.

| Esfuerzo | Valor |
|----------|-------|
| 🟡 Medio (4-5h) | ⭐⭐⭐⭐ |

---

### 🔵 Prioridad Baja — Nice-to-have

#### P11. **GLPI Software Inventory** (standard)
> Ver software instalado en cada activo

| Esfuerzo: 🟡 Medio | Valor: ⭐⭐ |
|---|---|

#### P12. **MikroTik Mangle Rules** (technical)
> Reglas de marcado de paquetes

| Esfuerzo: 🟢 Bajo | Valor: ⭐⭐ |
|---|---|

#### P13. **GLPI Ticket Followups** (standard)
> Ver/crear comentarios en tickets existentes

| Esfuerzo: 🟡 Medio | Valor: ⭐⭐ |
|---|---|

#### P14. **MikroTik Neighbors Discovery** (visual + híbrido)
> `/ip/neighbor` — dispositivos MikroTik vecinos detectados

| Esfuerzo: 🟢 Bajo | Valor: ⭐⭐⭐ |
|---|---|

---

## 3. Widgets Nuevos Propuestos

Los widgets encajan con las funcionalidades anteriores y siguen la arquitectura de 3 capas existente (hook → componente → WidgetRenderer).

### Visual

| Widget | Fuente | Propuesta |
|--------|--------|-----------|
| `visual_route_map` | MikroTik | Diagrama de rutas como árbol (gateway → destinos) |
| `visual_nat_flow` | MikroTik | Flujo visual src-nat/dst-nat con flechas |
| `visual_queue_bars` | MikroTik | Barras de uso de bandwidth por queue |

### Technical

| Widget | Fuente | Propuesta |
|--------|--------|-----------|
| `technical_nat_table` | MikroTik | Tabla de reglas NAT con contadores |
| `technical_route_table` | MikroTik | Tabla de rutas con flags (static/dynamic/connected) |
| `technical_dns_cache` | MikroTik | Cache DNS con búsqueda y TTL |

### Hybrid

| Widget | Fuentes | Propuesta |
|--------|---------|-----------|
| `hybrid_arp_inventory_gap` | MikroTik + GLPI | Dispositivos en red sin registro GLPI |
| `hybrid_bandwidth_assets` | MikroTik + GLPI | Top consumers enriquecidos con datos GLPI |
| `hybrid_firewall_asset_impact` | MikroTik + GLPI | Reglas firewall → activos afectados |
| `hybrid_alert_to_ticket` | Multi + GLPI | Creador de tickets desde alertas |
| `hybrid_network_inventory` | MikroTik + GLPI | Vista unificada: interfaces + IPs + activos asignados |

---

## 4. Resumen de Recomendación

### Top 5 que más valen la pena (ROI máximo):

| # | Propuesta | ¿Por qué? |
|---|-----------|-----------|
| 1 | **P5. Asset Lifecycle MikroTik→GLPI** | Conecta la pieza faltante: bloquear una IP y saber a quién afecta. Transforma el dashboard de "herramienta de red" a "herramienta de gestión operativa". |
| 2 | **P3. Correlación ARP↔GLPI** | Control de activos real. Detectar dispositivos no inventariados es una necesidad en seguridad empresarial. |
| 3 | **P4. NAT Rules Viewer** | Casi gratis de implementar (endpoint en whitelist, solo falta UI). Completa la visibilidad del firewall. |
| 4 | **P1. Inventario de Red** | Rutas + IPs + bridge le dan al dashboard visión de la topología. Muy importante para un dashboard de infraestructura MikroTik. |
| 5 | **P8. Bandwidth por Activo GLPI** | Transforma datos crudos (IPs) en información accionable (personas, ubicaciones). Low effort, high impact. |

### Lo que NO vale la pena ahora:

| Propuesta | Razón |
|-----------|-------|
| P11. Software Inventory | Mucha complejidad en GLPI API, poco valor para seguridad de red |
| P12. Mangle Rules | Muy técnico, audiencia reducida |
| P13. Ticket Followups | Nice-to-have, no es core del dashboard |

---

## 5. Distribución actual por fuente (widgets)

> Para visualizar dónde hay espacio de crecimiento:

```
Fuente               Standard  Visual  Technical  Hybrid   TOTAL
─────────────────────────────────────────────────────────────────
Wazuh                    3       4        0          2       9
MikroTik                 4       1        3          1       9
CrowdSec                 2       1        1          0       4
Suricata                 2       1        5          1       9
GLPI                     2       0        1          1       4   ← BAJO
Portal                   0       1        0          0       1
Phishing                 1       1        0          1       3
DHCP                     0       1        1          1       3
General/GeoIP            2       0        0          1       3
Mixed (multi-fuente)     0       1        1          8      10
─────────────────────────────────────────────────────────────────
TOTAL                   16      11       12         16      55
```

> [!IMPORTANT]
> **GLPI tiene solo 4 widgets** de 55, siendo una de las integraciones más ricas del backend (41KB de servicio). Hay una brecha clara entre la capacidad del backend GLPI y su representación en widgets.

> [!TIP]
> **MikroTik** tiene buena cobertura (9 widgets) pero falta visibilidad de NAT, rutas y queues — funcionalidades que ya soporta el servicio backend (o están en el whitelist CLI) pero sin UI dedicada.

> [!NOTE]
> Los **widgets híbridos MikroTik×GLPI** son donde más valor se puede agregar. Actualmente hay **1 híbrido directo** (DHCP Discovery que cruza leases con GLPI). Las propuestas P3, P5, P8 y P9 llenarían este vacío.
