import { useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import {
  FileText, Wand2, Download, Bold, Italic, UnderlineIcon, List, ListOrdered,
  AlignLeft, AlignCenter, Heading1, Heading2, Highlighter, Undo2, Redo2,
  Upload, Bot, Clock, History, GitCompare, Save, Info,
} from 'lucide-react';
import {
  reportsApi, mikrotikApi, wazuhApi, crowdsecApi, suricataApi,
  glpiApi, geoipApi, actionsApi, auditApi,
} from '../../services/api';
import { TelegramTab } from './TelegramTab';
import { TemplateSelector } from './TemplateSelector';
import { ReportHistory } from './ReportHistory';
import { ReportSchedules } from './ReportSchedules';
import type { ReportTemplate, SavedReport } from '../../types';

/* ── Data Sources ─────────────────────────────────────── */

interface DataSourceItem {
  id: string;
  label: string;
  icon: string;
  tooltip: string;
}

interface DataSourceCategory {
  category: string;
  icon: string;
  items: DataSourceItem[];
}

interface DataSourceDetail {
  title: string;
  icon: string;
  badge: string;
  badgeColor: string;
  bullets: string[];
}

const DATA_SOURCE_DETAILS: Record<string, DataSourceDetail> = {
  mikrotik_connections: { title: 'Conexiones Activas', icon: '🔌', badge: 'MikroTik', badgeColor: '#3b82f6', bullets: ['Conexiones TCP/UDP activas con IP origen y destino', 'Estado de cada conexión (established, syn-sent, time-wait)', 'Protocolo y tiempo de vida restante del flujo', 'Detección de conexiones sospechosas o de larga duración'] },
  firewall_rules: { title: 'Reglas de Firewall', icon: '🛡️', badge: 'MikroTik', badgeColor: '#3b82f6', bullets: ['Reglas filter por chain (input / forward / output)', 'Acciones configuradas (accept / drop / reject)', 'Contadores de paquetes y bytes por regla', 'IPs, rangos y puertos afectados por cada regla'] },
  arp_table: { title: 'Tabla ARP', icon: '📋', badge: 'MikroTik', badgeColor: '#3b82f6', bullets: ['Mapeo IP↔MAC de dispositivos en la red local', 'Hostname resuelto de cada dispositivo', 'Interfaz y VLAN donde se detectó cada host', 'Dispositivos no reconocidos o con MACs duplicadas'] },
  mikrotik_interfaces: { title: 'Interfaces de Red', icon: '🌐', badge: 'MikroTik', badgeColor: '#3b82f6', bullets: ['Estado activa / inactiva de cada interfaz', 'Tráfico acumulado TX/RX en bytes y paquetes', 'MTU, dirección MAC y tipo (ether/vlan/bridge/wlan)', 'Interfaces con errores o caídas recientes'] },
  mikrotik_vlans: { title: 'VLANs', icon: '🏗️', badge: 'MikroTik', badgeColor: '#3b82f6', bullets: ['VLANs configuradas con ID y nombre', 'Interfaz padre y bridge asociado', 'Segmentación lógica de la red aplicada', 'VLANs sin tráfico o con anomalías detectadas'] },
  mikrotik_nat: { title: 'Reglas NAT', icon: '↔️', badge: 'MikroTik', badgeColor: '#3b82f6', bullets: ['Reglas DNAT, SNAT y Masquerade activas', 'Chain, acción, IPs y puertos traducidos', 'Contadores de paquetes por regla NAT', 'Port-forwards configurados hacia servicios internos'] },
  mikrotik_address_lists: { title: 'Listas de Direcciones', icon: '📝', badge: 'MikroTik', badgeColor: '#3b82f6', bullets: ['IPs agrupadas por lista (bloqueadas, permitidas, cuarentena)', 'Comentarios y fecha de creación de cada entrada', 'Listas referenciadas por reglas de firewall activas', 'Entradas dinámicas generadas por CrowdSec o reglas'] },
  mikrotik_dns: { title: 'DNS Estático', icon: '🔤', badge: 'MikroTik', badgeColor: '#3b82f6', bullets: ['Registros DNS estáticos configurados en el router', 'Mapeos dominio→IP para resolución interna', 'TTL configurado por registro', 'Dominios del sinkhole activo en la red'] },
  mikrotik_dhcp: { title: 'DHCP Leases', icon: '📡', badge: 'MikroTik', badgeColor: '#3b82f6', bullets: ['Asignaciones DHCP activas: IP, MAC y hostname', 'Servidor DHCP y pool de direcciones de origen', 'Tiempo de expiración de cada lease', 'Dispositivos nuevos no vistos anteriormente'] },
  mikrotik_logs: { title: 'Logs del Router', icon: '📜', badge: 'MikroTik', badgeColor: '#3b82f6', bullets: ['Últimas entradas del log con timestamp', 'Errores del sistema y reintentos de autenticación', 'Eventos del firewall: drops y reglas activadas', 'Eventos DHCP: nuevos leases y renovaciones'] },
  mikrotik_health: { title: 'Salud del Router', icon: '💓', badge: 'MikroTik', badgeColor: '#3b82f6', bullets: ['Uso de CPU% y RAM% en tiempo real', 'Uptime total del router y última fecha de reinicio', 'Temperatura del procesador y voltaje del sistema', 'Alertas de hardware: sobrecalentamiento o tensión fuera de rango'] },
  mikrotik_routes: { title: 'Tabla de Rutas', icon: '🗺️', badge: 'MikroTik', badgeColor: '#3b82f6', bullets: ['Rutas estáticas y dinámicas (OSPF/BGP/connected)', 'Gateway, interfaz de salida y distancia administrativa', 'Métrica y preferencia de cada ruta', 'Rutas inactivas o con gateway inalcanzable'] },
  mikrotik_queues: { title: 'Colas de Ancho de Banda', icon: '⚡', badge: 'MikroTik', badgeColor: '#3b82f6', bullets: ['Simple Queues configuradas por IP o rango', 'Límites de velocidad de subida y bajada (burst)', 'Tráfico actual consumido por cada cola', 'Colas que superan el 90% de su límite asignado'] },
  wazuh_alerts: { title: 'Alertas Generales', icon: '🔔', badge: 'Wazuh SIEM', badgeColor: '#f59e0b', bullets: ['Todas las alertas con nivel de severidad (1-15)', 'Agente afectado, ID de regla y descripción del evento', 'Timestamp y detalles del log original que generó la alerta', 'Distribución de alertas por agente y por categoría'] },
  wazuh_critical: { title: 'Alertas Críticas', icon: '🚨', badge: 'Wazuh SIEM', badgeColor: '#f59e0b', bullets: ['Solo alertas nivel ≥12 (alto y crítico)', 'Técnica y táctica MITRE ATT&CK detectada', 'IOCs: IPs, hashes, usuarios y rutas involucrados', 'Recomendaciones de respuesta por tipo de amenaza'] },
  wazuh_agents: { title: 'Agentes Wazuh', icon: '🖥️', badge: 'Wazuh SIEM', badgeColor: '#f59e0b', bullets: ['Estado de cada agente (active / disconnected / pending)', 'Sistema operativo, versión del agente e IP del host', 'Última conexión y tiempo desconectado', 'Agentes con alta tasa de alertas o sin actividad reciente'] },
  wazuh_mitre: { title: 'MITRE ATT&CK', icon: '🎯', badge: 'Wazuh SIEM', badgeColor: '#f59e0b', bullets: ['Tácticas detectadas: Reconocimiento, Persistencia, Lateral Movement…', 'Técnicas con mayor frecuencia de activación', 'Conteo de alertas por técnica y subtécnica', 'Agentes más afectados por técnicas específicas'] },
  crowdsec_decisions: { title: 'Decisiones Activas', icon: '🚫', badge: 'CrowdSec IPS', badgeColor: '#ef4444', bullets: ['IPs y rangos actualmente bloqueados', 'Tipo de bloqueo (ban / captcha) y duración restante', 'Escenario que originó la decisión', 'Bouncer que aplica el bloqueo (MikroTik / iptables)'] },
  crowdsec_alerts: { title: 'Alertas de Escenarios', icon: '⚠️', badge: 'CrowdSec IPS', badgeColor: '#ef4444', bullets: ['Escenarios de ataque activados: brute-force, port scan, crawling', 'IP atacante, país de origen y ASN del proveedor', 'Cantidad de eventos que activaron cada escenario', 'Correlación con la Community Intelligence Database'] },
  crowdsec_metrics: { title: 'Métricas del Motor', icon: '📊', badge: 'CrowdSec IPS', badgeColor: '#ef4444', bullets: ['Rendimiento de parsers: líneas procesadas vs descartadas', 'Bouncers activos y su estado de sincronización', 'Escenarios en ejecución y alertas generadas por hora', 'Memoria y CPU consumidos por el agente CrowdSec'] },
  crowdsec_top_attackers: { title: 'Top Atacantes', icon: '🏴', badge: 'CrowdSec IPS', badgeColor: '#ef4444', bullets: ['IPs con mayor cantidad de decisiones acumuladas', 'País de origen, ISP y tipo de red (hosting/residential)', 'Score de reputación de la Community Intelligence Database', 'Historial de escenarios activados por cada IP'] },
  suricata_alerts: { title: 'Alertas IDS', icon: '🔍', badge: 'Suricata IDS/IPS', badgeColor: '#8b5cf6', bullets: ['Amenazas detectadas por nombre y categoría de firma', 'Severidad, IPs origen/destino y protocolo involucrado', 'SID de la regla activada y clasificación de amenaza', 'Frecuencia de activación por firma en el período'] },
  suricata_flows: { title: 'Flujos de Red', icon: '🌊', badge: 'Suricata IDS/IPS', badgeColor: '#8b5cf6', bullets: ['Flujos TCP/UDP capturados con IP/puerto origen y destino', 'Bytes transferidos y duración total del flujo', 'Estado del flujo (established, closed, bypassed)', 'Flujos de alto volumen o con destinos inusuales'] },
  suricata_dns: { title: 'Consultas DNS', icon: '🌐', badge: 'Suricata IDS/IPS', badgeColor: '#8b5cf6', bullets: ['Dominios consultados con tipo de registro (A/AAAA/MX/TXT)', 'Respuesta obtenida e IP resuelta', 'Cliente que realizó la consulta y timestamp', 'Consultas a dominios maliciosos o de C2 conocidos'] },
  suricata_http: { title: 'Tráfico HTTP', icon: '🌍', badge: 'Suricata IDS/IPS', badgeColor: '#8b5cf6', bullets: ['URL completa, método HTTP y código de respuesta', 'User-agent del cliente y servidor de destino', 'Tamaño del body de request y response', 'Transacciones con payloads sospechosos o user-agents maliciosos'] },
  suricata_tls: { title: 'Handshakes TLS', icon: '🔒', badge: 'Suricata IDS/IPS', badgeColor: '#8b5cf6', bullets: ['Versión TLS negociada (1.0 / 1.2 / 1.3)', 'SNI (hostname solicitado) y CN del certificado', 'Cipher suite seleccionada y fingerprint JA3', 'Certificados autofirmados o con dominios sospechosos'] },
  suricata_engine_stats: { title: 'Estadísticas del Motor', icon: '⚙️', badge: 'Suricata IDS/IPS', badgeColor: '#8b5cf6', bullets: ['Paquetes capturados, descartados y procesados', 'Reglas cargadas actualmente y última actualización', 'Uptime del motor y versión de Suricata', 'Interfaces monitoreadas y modo de operación (IDS/IPS/AF-PACKET)'] },
  glpi_inventory: { title: 'Inventario de Activos', icon: '📦', badge: 'GLPI', badgeColor: '#10b981', bullets: ['Computadoras y dispositivos con modelo y fabricante', 'Sistema operativo, versión e instalaciones de software', 'Estado operativo y ubicación física del activo', 'Usuario asignado y fecha de última actualización'] },
  glpi_stats: { title: 'Estadísticas de Activos', icon: '📈', badge: 'GLPI', badgeColor: '#10b981', bullets: ['Totales de activos por tipo (PC, servidor, impresora, switch)', 'Distribución por estado operativo (en uso, en reparación, retirado)', 'Conteo por ubicación física y por usuario asignado', 'Activos sin asignar o con estado desconocido'] },
  glpi_tickets: { title: 'Tickets de Soporte', icon: '🎫', badge: 'GLPI', badgeColor: '#10b981', bullets: ['Tickets abiertos con prioridad (crítica/alta/media/baja)', 'Estado del ciclo de vida (nuevo/asignado/pendiente/resuelto)', 'Técnico asignado y tiempo de resolución vs SLA', 'Tickets vencidos o próximos a vencer su SLA'] },
  glpi_health: { title: 'Salud de Activos', icon: '🏥', badge: 'GLPI', badgeColor: '#10b981', bullets: ['Activos con alertas activas de Wazuh correlacionadas', 'Dispositivos en cuarentena o con bloqueo de red activo', 'Score de salud por activo (seguridad + operativo)', 'Activos sin agente de monitoreo instalado'] },
  system_health: { title: 'Salud General del Sistema', icon: '💻', badge: 'Sistema', badgeColor: '#6b7280', bullets: ['Estado consolidado de todos los servicios integrados', 'CPU y RAM de MikroTik + agentes activos de Wazuh', 'Decisiones activas de CrowdSec + estado del motor Suricata', 'Últimas sincronizaciones y errores de conectividad'] },
  geoip_top_countries: { title: 'Top Países Atacantes', icon: '🌍', badge: 'GeoIP', badgeColor: '#06b6d4', bullets: ['Países con mayor cantidad de IPs bloqueadas o alertas', 'Distribución geográfica de amenazas detectadas', 'ASN y proveedores de red más frecuentes en ataques', 'Comparativa entre fuentes (CrowdSec, Wazuh, Suricata)'] },
  telegram_activity: { title: 'Actividad del Bot', icon: '📱', badge: 'Telegram', badgeColor: '#0ea5e9', bullets: ['Mensajes de alerta enviados en el período analizado', 'Consultas IA respondidas vía bot de Telegram', 'Reportes automáticos programados y estado de entrega', 'Errores de envío o caídas del bot detectadas'] },
  action_history: { title: 'Historial de Auditoría', icon: '📋', badge: 'Auditoría', badgeColor: '#f97316', bullets: ['Bloqueos de IP realizados: manual, automático y por CrowdSec', 'Activos puestos en cuarentena y motivo registrado', 'Cambios de configuración y creación/eliminación de usuarios', 'Operaciones CRUD con operador, timestamp y resultado'] },
};

const DATA_SOURCE_CATEGORIES: DataSourceCategory[] = [
  {
    category: 'MikroTik',
    icon: '🔗',
    items: [
      {
        id: 'mikrotik_connections',
        label: 'Conexiones Activas',
        icon: '🔌',
        tooltip: 'Conexiones TCP/UDP actuales: IP origen/destino, protocolo, estado (established/syn-sent/etc.) y tiempo restante.',
      },
      {
        id: 'firewall_rules',
        label: 'Reglas de Firewall',
        icon: '🛡️',
        tooltip: 'Reglas filter del firewall: chain (input/forward/output), acción (accept/drop), IPs y contadores de paquetes/bytes.',
      },
      {
        id: 'arp_table',
        label: 'Tabla ARP',
        icon: '📋',
        tooltip: 'Mapeo IP↔MAC de todos los dispositivos detectados en la red local. Útil para identificar dispositivos no reconocidos.',
      },
      {
        id: 'mikrotik_interfaces',
        label: 'Interfaces de Red',
        icon: '🌐',
        tooltip: 'Estado de cada interfaz de red: activa/inactiva, tráfico TX/RX en bytes, MTU, dirección MAC y tipo (ether/vlan/bridge).',
      },
      {
        id: 'mikrotik_vlans',
        label: 'VLANs',
        icon: '🏗️',
        tooltip: 'VLANs configuradas en el router: ID, nombre, interfaz padre y segmentación de red aplicada.',
      },
      {
        id: 'mikrotik_nat',
        label: 'Reglas NAT',
        icon: '↔️',
        tooltip: 'Reglas de traducción de direcciones activas (DNAT/SNAT/Masquerade): chain, acción, IPs y puertos afectados.',
      },
      {
        id: 'mikrotik_address_lists',
        label: 'Listas de Direcciones',
        icon: '📝',
        tooltip: 'Address lists del firewall: IPs agrupadas por lista (bloqueadas, permitidas, en cuarentena, etc.) con comentarios.',
      },
      {
        id: 'mikrotik_dns',
        label: 'DNS Estático',
        icon: '🔤',
        tooltip: 'Registros DNS configurados localmente en el router: mapeos dominio→IP para resolución interna de nombres.',
      },
      {
        id: 'mikrotik_dhcp',
        label: 'DHCP Leases',
        icon: '📡',
        tooltip: 'Asignaciones DHCP activas: IP asignada, dirección MAC, hostname del cliente, servidor DHCP y tiempo de expiración.',
      },
      {
        id: 'mikrotik_logs',
        label: 'Logs del Router',
        icon: '📜',
        tooltip: 'Últimas entradas del log de MikroTik con timestamp: errores del sistema, autenticaciones fallidas, eventos del firewall y DHCP.',
      },
      {
        id: 'mikrotik_health',
        label: 'Salud del Router',
        icon: '💓',
        tooltip: 'Métricas de hardware del router: uso de CPU%, RAM%, tiempo de actividad (uptime), temperatura y voltaje (donde aplique).',
      },
      {
        id: 'mikrotik_routes',
        label: 'Tabla de Rutas',
        icon: '🗺️',
        tooltip: 'Rutas estáticas y dinámicas: gateway, interfaz de salida, distancia administrativa y métrica de cada ruta activa.',
      },
      {
        id: 'mikrotik_queues',
        label: 'Colas de Ancho de Banda',
        icon: '⚡',
        tooltip: 'Simple Queues configuradas: límites de velocidad por IP o rango, consumo actual y colas que superan su límite.',
      },
    ],
  },
  {
    category: 'Wazuh (SIEM)',
    icon: '🔔',
    items: [
      {
        id: 'wazuh_alerts',
        label: 'Alertas Generales',
        icon: '🔔',
        tooltip: 'Todas las alertas de Wazuh SIEM: nivel de severidad (1-15), agente afectado, ID de regla, descripción y timestamp.',
      },
      {
        id: 'wazuh_critical',
        label: 'Alertas Críticas',
        icon: '🚨',
        tooltip: 'Solo alertas nivel ≥12 (alto/crítico) con información de técnicas MITRE ATT&CK: táctica, técnica y subtécnica detectada.',
      },
      {
        id: 'wazuh_agents',
        label: 'Agentes',
        icon: '🖥️',
        tooltip: 'Estado individual de cada agente Wazuh: nombre, estado (active/disconnected), sistema operativo, versión del agente, IP y última conexión.',
      },
      {
        id: 'wazuh_mitre',
        label: 'MITRE ATT&CK',
        icon: '🎯',
        tooltip: 'Resumen de técnicas y tácticas del framework MITRE ATT&CK detectadas en la infraestructura, con conteo de alertas por técnica.',
      },
    ],
  },
  {
    category: 'CrowdSec (IPS)',
    icon: '🚫',
    items: [
      {
        id: 'crowdsec_decisions',
        label: 'Decisiones Activas',
        icon: '🚫',
        tooltip: 'IPs y rangos actualmente bloqueados por CrowdSec: dirección, tipo de bloqueo, duración, escenario que lo originó y bouncer que lo aplica.',
      },
      {
        id: 'crowdsec_alerts',
        label: 'Alertas de Escenarios',
        icon: '⚠️',
        tooltip: 'Escenarios de ataque detectados: fuerza bruta SSH/HTTP, port scanning, crawling web, y otros comportamientos maliciosos identificados.',
      },
      {
        id: 'crowdsec_metrics',
        label: 'Métricas del Motor',
        icon: '📊',
        tooltip: 'Estadísticas del motor CrowdSec: rendimiento de parsers (líneas procesadas/descartadas), bouncers activos y escenarios ejecutados.',
      },
      {
        id: 'crowdsec_top_attackers',
        label: 'Top Atacantes',
        icon: '🏴',
        tooltip: 'Top IPs atacantes: cantidad de decisiones acumuladas, país de origen, ISP y score de reputación de la Community Intelligence DB.',
      },
    ],
  },
  {
    category: 'Suricata (IDS/IPS)',
    icon: '🔍',
    items: [
      {
        id: 'suricata_alerts',
        label: 'Alertas IDS',
        icon: '🔍',
        tooltip: 'Amenazas detectadas por Suricata: nombre de firma, categoría, severidad, IPs origen/destino y protocolo involucrado.',
      },
      {
        id: 'suricata_flows',
        label: 'Flujos de Red',
        icon: '🌊',
        tooltip: 'Flujos de tráfico TCP/UDP capturados: IP/puerto origen y destino, bytes transferidos, duración del flujo y estado.',
      },
      {
        id: 'suricata_dns',
        label: 'Consultas DNS',
        icon: '🌐',
        tooltip: 'Consultas DNS capturadas en la red: dominio consultado, tipo de registro (A/AAAA/MX/TXT), respuesta obtenida y cliente que consultó.',
      },
      {
        id: 'suricata_http',
        label: 'Tráfico HTTP',
        icon: '🌍',
        tooltip: 'Transacciones HTTP capturadas: URL completa, método (GET/POST/etc.), código de respuesta, user-agent del cliente y servidor destino.',
      },
      {
        id: 'suricata_tls',
        label: 'Handshakes TLS',
        icon: '🔒',
        tooltip: 'Conexiones TLS/HTTPS capturadas: versión de TLS negociada, SNI (hostname), CN del certificado, cipher suite y si el certificado es válido.',
      },
      {
        id: 'suricata_engine_stats',
        label: 'Estadísticas del Motor',
        icon: '⚙️',
        tooltip: 'Estado del motor Suricata: paquetes capturados/descartados, reglas cargadas, uptime e interfaces monitoreadas.',
      },
    ],
  },
  {
    category: 'GLPI (Activos)',
    icon: '📦',
    items: [
      {
        id: 'glpi_inventory',
        label: 'Inventario de Activos',
        icon: '📦',
        tooltip: 'Inventario completo de GLPI: computadoras y dispositivos con modelo, OS, estado operativo, ubicación y usuario asignado.',
      },
      {
        id: 'glpi_stats',
        label: 'Estadísticas de Activos',
        icon: '📈',
        tooltip: 'Totales de activos por tipo (PC, servidor, impresora, etc.), distribución por estado operativo y conteo por ubicación física.',
      },
      {
        id: 'glpi_tickets',
        label: 'Tickets de Soporte',
        icon: '🎫',
        tooltip: 'Tickets de incidentes y solicitudes de GLPI: prioridad (crítica/alta/media/baja), estado (nuevo/asignado/pendiente/resuelto), técnico asignado y SLA.',
      },
      {
        id: 'glpi_health',
        label: 'Salud de Activos',
        icon: '🏥',
        tooltip: 'Salud correlacionada de activos GLPI: dispositivos con alertas Wazuh activas, equipos en cuarentena y score de salud por activo.',
      },
    ],
  },
  {
    category: 'Sistema General',
    icon: '💻',
    items: [
      {
        id: 'system_health',
        label: 'Salud General',
        icon: '💻',
        tooltip: 'Estado consolidado de TODOS los servicios: resumen de CPU/RAM de MikroTik, agentes activos de Wazuh, decisiones de CrowdSec y estado del motor Suricata.',
      },
    ],
  },
  {
    category: 'GeoIP',
    icon: '🌍',
    items: [
      {
        id: 'geoip_top_countries',
        label: 'Top Países Atacantes',
        icon: '🌍',
        tooltip: 'Distribución geográfica de amenazas: países con más IPs bloqueadas o alertas, ASN frecuentes y comparativa entre fuentes.',
      },
    ],
  },
  {
    category: 'Telegram',
    icon: '📱',
    items: [
      {
        id: 'telegram_activity',
        label: 'Actividad del Bot',
        icon: '📱',
        tooltip: 'Actividad del bot de Telegram: alertas enviadas, consultas IA respondidas, reportes automáticos y errores de entrega.',
      },
    ],
  },
  {
    category: 'Auditoría',
    icon: '📋',
    items: [
      {
        id: 'action_history',
        label: 'Historial de Auditoría',
        icon: '📋',
        tooltip: 'Historial de acciones del sistema: bloqueos de IP, cuarentenas, cambios de configuración y operaciones CRUD con operador y timestamp.',
      },
    ],
  },
];

// Flat list for quick lookup
const ALL_SOURCE_IDS = DATA_SOURCE_CATEGORIES.flatMap(c => c.items.map(i => i.id));

/* ── Preview types ────────────────────────────────────────── */

interface PreviewCol { key: string; label: string; }
interface SourceFetcher {
  fetch: () => Promise<any>;
  extractItems: (resp: any) => any[];
  columns: PreviewCol[];
  rowLabel: (item: any) => string;
}

/* ── API fetchers per source ──────────────────────────────── */

const SOURCE_FETCHERS: Record<string, SourceFetcher> = {
  mikrotik_connections: {
    fetch: () => mikrotikApi.getConnections(),
    extractItems: (r) => (Array.isArray(r?.data) ? r.data.slice(0, 80) : []),
    columns: [{ key: 'src_address', label: 'Origen' }, { key: 'dst_address', label: 'Destino' }, { key: 'protocol', label: 'Proto' }, { key: 'connection_state', label: 'Estado' }],
    rowLabel: (i) => `${i.src_address ?? ''} → ${i.dst_address ?? ''} [${i.protocol ?? ''}]`,
  },
  firewall_rules: {
    fetch: () => mikrotikApi.getFirewallRules(),
    extractItems: (r) => (Array.isArray(r?.data) ? r.data.slice(0, 60) : []),
    columns: [{ key: 'chain', label: 'Chain' }, { key: 'action', label: 'Acción' }, { key: 'src_address', label: 'Src' }, { key: 'dst_address', label: 'Dst' }],
    rowLabel: (i) => `[${i.chain}] ${i.action} ${i.src_address ?? 'any'} → ${i.dst_address ?? 'any'}`,
  },
  arp_table: {
    fetch: () => mikrotikApi.getArp(),
    extractItems: (r) => (Array.isArray(r?.data) ? r.data.slice(0, 80) : []),
    columns: [{ key: 'address', label: 'IP' }, { key: 'mac_address', label: 'MAC' }, { key: 'interface', label: 'Interfaz' }],
    rowLabel: (i) => `${i.address ?? ''} — ${i.mac_address ?? ''}`,
  },
  mikrotik_interfaces: {
    fetch: () => mikrotikApi.getInterfaces(),
    extractItems: (r) => (Array.isArray(r?.data) ? r.data : []),
    columns: [{ key: 'name', label: 'Nombre' }, { key: 'type', label: 'Tipo' }, { key: 'running', label: 'Activa' }, { key: 'tx_byte', label: 'TX Bytes' }],
    rowLabel: (i) => `${i.name ?? ''} (${i.type ?? ''}) ${i.running ? '✓' : '✗'}`,
  },
  mikrotik_vlans: {
    fetch: () => mikrotikApi.getNatRules().then(() => ({ data: [] })).catch(() => ({ data: [] })),
    extractItems: (_r) => [],
    columns: [{ key: 'name', label: 'Nombre' }, { key: 'vlan_id', label: 'VLAN ID' }, { key: 'interface', label: 'Interfaz' }],
    rowLabel: (i) => `VLAN ${i.vlan_id ?? ''} — ${i.name ?? ''}`,
  },
  mikrotik_nat: {
    fetch: () => mikrotikApi.getNatRules(),
    extractItems: (r) => (Array.isArray(r?.data) ? r.data.slice(0, 50) : []),
    columns: [{ key: 'chain', label: 'Chain' }, { key: 'action', label: 'Acción' }, { key: 'dst_address', label: 'Dst' }, { key: 'to_addresses', label: 'To' }],
    rowLabel: (i) => `[${i.chain}] ${i.action} ${i.dst_address ?? ''} → ${i.to_addresses ?? ''}`,
  },
  mikrotik_address_lists: {
    fetch: () => mikrotikApi.getAddressList(),
    extractItems: (r) => (Array.isArray(r?.data) ? r.data.slice(0, 80) : []),
    columns: [{ key: 'list', label: 'Lista' }, { key: 'address', label: 'IP/Rango' }, { key: 'comment', label: 'Comentario' }],
    rowLabel: (i) => `[${i.list ?? ''}] ${i.address ?? ''}`,
  },
  mikrotik_dns: {
    fetch: () => mikrotikApi.getArp().then(() => ({ data: [] })),
    extractItems: (_r) => [],
    columns: [{ key: 'name', label: 'Dominio' }, { key: 'address', label: 'IP' }, { key: 'ttl', label: 'TTL' }],
    rowLabel: (i) => `${i.name ?? ''} → ${i.address ?? ''}`,
  },
  mikrotik_dhcp: {
    fetch: () => mikrotikApi.getArp(),
    extractItems: (r) => (Array.isArray(r?.data) ? r.data.slice(0, 60) : []),
    columns: [{ key: 'address', label: 'IP Asignada' }, { key: 'mac_address', label: 'MAC' }, { key: 'interface', label: 'Interfaz' }],
    rowLabel: (i) => `${i.address ?? ''} — ${i.mac_address ?? ''}`,
  },
  mikrotik_logs: {
    fetch: () => mikrotikApi.getLogs(50),
    extractItems: (r) => (Array.isArray(r?.data) ? r.data.slice(0, 50) : []),
    columns: [{ key: 'time', label: 'Tiempo' }, { key: 'topics', label: 'Topic' }, { key: 'message', label: 'Mensaje' }],
    rowLabel: (i) => `[${i.topics ?? ''}] ${i.message ?? ''}`,
  },
  mikrotik_health: {
    fetch: () => mikrotikApi.getHealth(),
    extractItems: (r) => (r?.data ? [r.data] : []),
    columns: [{ key: 'cpu_load', label: 'CPU %' }, { key: 'free_memory', label: 'RAM Libre' }, { key: 'uptime', label: 'Uptime' }],
    rowLabel: (i) => `CPU: ${i.cpu_load ?? '?'}% | Uptime: ${i.uptime ?? '?'}`,
  },
  mikrotik_routes: {
    fetch: () => mikrotikApi.getRoutes(),
    extractItems: (r) => (Array.isArray(r?.data) ? r.data.slice(0, 60) : []),
    columns: [{ key: 'dst_address', label: 'Destino' }, { key: 'gateway', label: 'Gateway' }, { key: 'distance', label: 'Dist.' }, { key: 'active', label: 'Activa' }],
    rowLabel: (i) => `${i.dst_address ?? ''} via ${i.gateway ?? ''}`,
  },
  mikrotik_queues: {
    fetch: () => mikrotikApi.getQueues(),
    extractItems: (r) => (Array.isArray(r?.data) ? r.data.slice(0, 50) : []),
    columns: [{ key: 'name', label: 'Nombre' }, { key: 'target', label: 'IP/Red' }, { key: 'max_limit', label: 'Límite' }],
    rowLabel: (i) => `${i.name ?? ''} — ${i.target ?? ''}`,
  },
  wazuh_alerts: {
    fetch: () => wazuhApi.getAlerts(50),
    extractItems: (r) => {
      const d = r?.data;
      if (Array.isArray(d)) return d.slice(0, 50);
      if (Array.isArray(d?.items)) return d.items.slice(0, 50);
      if (Array.isArray(d?.alerts)) return d.alerts.slice(0, 50);
      return [];
    },
    columns: [{ key: 'rule_level', label: 'Niv.' }, { key: 'rule_description', label: 'Descripción' }, { key: 'agent_name', label: 'Agente' }],
    rowLabel: (i) => `[${i.rule_level ?? '?'}] ${i.rule_description ?? ''}`,
  },
  wazuh_critical: {
    fetch: () => wazuhApi.getCriticalAlerts(30),
    extractItems: (r) => {
      const d = r?.data;
      if (Array.isArray(d)) return d;
      if (Array.isArray(d?.items)) return d.items;
      if (Array.isArray(d?.alerts)) return d.alerts;
      return [];
    },
    columns: [{ key: 'rule_level', label: 'Niv.' }, { key: 'rule_description', label: 'Descripción' }, { key: 'agent_name', label: 'Agente' }],
    rowLabel: (i) => `[${i.rule_level ?? '?'}] ${i.rule_description ?? ''}`,
  },
  wazuh_agents: {
    fetch: () => wazuhApi.getAgents(),
    extractItems: (r) => {
      const d = r?.data;
      if (Array.isArray(d)) return d;
      if (Array.isArray(d?.items)) return d.items;
      if (Array.isArray(d?.agents)) return d.agents;
      return [];
    },
    columns: [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Nombre' }, { key: 'status', label: 'Estado' }, { key: 'ip', label: 'IP' }],
    rowLabel: (i) => `${i.name ?? ''} (${i.status ?? ''}) — ${i.ip ?? ''}`,
  },
  wazuh_mitre: {
    fetch: () => wazuhApi.getMitreSummary(),
    extractItems: (r) => {
      const d = r?.data;
      if (Array.isArray(d)) return d.slice(0, 30);
      if (Array.isArray(d?.items)) return d.items.slice(0, 30);
      return [];
    },
    columns: [{ key: 'technique_id', label: 'Técnica' }, { key: 'technique', label: 'Nombre' }, { key: 'count', label: 'Alertas' }],
    rowLabel: (i) => `${i.technique_id ?? ''} — ${i.technique ?? ''} (${i.count ?? 0})`,
  },
  crowdsec_decisions: {
    fetch: () => crowdsecApi.getDecisions(),
    extractItems: (r) => (Array.isArray(r?.data) ? r.data.slice(0, 80) : []),
    columns: [{ key: 'value', label: 'IP/Rango' }, { key: 'scenario', label: 'Escenario' }, { key: 'type', label: 'Tipo' }, { key: 'duration', label: 'Duración' }],
    rowLabel: (i) => `${i.value ?? ''} — ${i.scenario ?? ''}`,
  },
  crowdsec_alerts: {
    fetch: () => crowdsecApi.getAlerts({ limit: 50 }),
    extractItems: (r) => {
      const d = r?.data;
      if (Array.isArray(d)) return d.slice(0, 50);
      if (Array.isArray(d?.alerts)) return d.alerts.slice(0, 50);
      return [];
    },
    columns: [{ key: 'scenario', label: 'Escenario' }, { key: 'source_ip', label: 'IP Atacante' }, { key: 'events_count', label: 'Eventos' }],
    rowLabel: (i) => `${i.scenario ?? ''} — ${i.source_ip ?? ''}`,
  },
  crowdsec_metrics: {
    fetch: () => crowdsecApi.getMetrics(),
    extractItems: (r) => (r?.data ? [r.data] : []),
    columns: [{ key: 'total_decisions', label: 'Decisiones' }, { key: 'bouncers_count', label: 'Bouncers' }],
    rowLabel: (_i) => 'Métricas del motor CrowdSec',
  },
  crowdsec_top_attackers: {
    fetch: () => crowdsecApi.getDecisions(),
    extractItems: (r) => (Array.isArray(r?.data) ? r.data.slice(0, 20) : []),
    columns: [{ key: 'value', label: 'IP' }, { key: 'scenario', label: 'Escenario' }, { key: 'origin', label: 'Origen' }],
    rowLabel: (i) => `${i.value ?? ''} — ${i.scenario ?? ''}`,
  },
  suricata_alerts: {
    fetch: () => suricataApi.getAlerts({ limit: 50 }),
    extractItems: (r) => (Array.isArray(r?.data?.alerts) ? r.data.alerts.slice(0, 50) : []),
    columns: [{ key: 'signature', label: 'Firma' }, { key: 'severity', label: 'Sev.' }, { key: 'src_ip', label: 'Origen' }, { key: 'dest_ip', label: 'Destino' }],
    rowLabel: (i) => `[${i.severity ?? '?'}] ${i.signature ?? ''} (${i.src_ip ?? ''})`,
  },
  suricata_flows: {
    fetch: () => suricataApi.getFlows({ limit: 50 }),
    extractItems: (r) => (Array.isArray(r?.data?.flows) ? r.data.flows.slice(0, 50) : []),
    columns: [{ key: 'src_ip', label: 'Src IP' }, { key: 'dest_ip', label: 'Dst IP' }, { key: 'proto', label: 'Proto' }, { key: 'bytes_toserver', label: 'Bytes' }],
    rowLabel: (i) => `${i.src_ip ?? ''}:${i.src_port ?? ''} → ${i.dest_ip ?? ''}:${i.dest_port ?? ''}`,
  },
  suricata_dns: {
    fetch: () => suricataApi.getDnsQueries({ limit: 50 }),
    extractItems: (r) => (Array.isArray(r?.data?.queries) ? r.data.queries.slice(0, 50) : []),
    columns: [{ key: 'rrname', label: 'Dominio' }, { key: 'rrtype', label: 'Tipo' }, { key: 'rdata', label: 'Respuesta' }],
    rowLabel: (i) => `${i.rrname ?? ''} (${i.rrtype ?? ''})`,
  },
  suricata_http: {
    fetch: () => suricataApi.getHttpTransactions({ limit: 50 }),
    extractItems: (r) => (Array.isArray(r?.data?.transactions) ? r.data.transactions.slice(0, 50) : []),
    columns: [{ key: 'http_method', label: 'Método' }, { key: 'url', label: 'URL' }, { key: 'status', label: 'Código' }],
    rowLabel: (i) => `${i.http_method ?? 'GET'} ${i.url ?? ''}`,
  },
  suricata_tls: {
    fetch: () => suricataApi.getTlsHandshakes({ limit: 50 }),
    extractItems: (r) => (Array.isArray(r?.data?.handshakes) ? r.data.handshakes.slice(0, 50) : []),
    columns: [{ key: 'sni', label: 'SNI' }, { key: 'version', label: 'TLS' }, { key: 'issuerdn', label: 'Emisor' }],
    rowLabel: (i) => `${i.sni ?? ''} (${i.version ?? ''})`,
  },
  suricata_engine_stats: {
    fetch: () => suricataApi.getEngineStatus(),
    extractItems: (r) => (r?.data ? [r.data] : []),
    columns: [{ key: 'packets_captured', label: 'Paquetes' }, { key: 'rules_loaded', label: 'Reglas' }, { key: 'uptime_seconds', label: 'Uptime' }],
    rowLabel: (i) => `${i.packets_captured ?? 0} paquetes | ${i.rules_loaded ?? 0} reglas`,
  },
  glpi_inventory: {
    fetch: () => glpiApi.getAssets({ limit: 50 }),
    extractItems: (r) => (Array.isArray(r?.data?.assets) ? r.data.assets.slice(0, 50) : []),
    columns: [{ key: 'name', label: 'Nombre' }, { key: 'status', label: 'Estado' }, { key: 'location', label: 'Ubicación' }],
    rowLabel: (i) => `${i.name ?? ''} — ${i.status ?? ''}`,
  },
  glpi_tickets: {
    fetch: () => glpiApi.getTickets({ limit: 30 }),
    extractItems: (r) => (Array.isArray(r?.data?.tickets) ? r.data.tickets : []),
    columns: [{ key: 'name', label: 'Título' }, { key: 'priority', label: 'Prioridad' }, { key: 'status', label: 'Estado' }],
    rowLabel: (i) => `[P${i.priority ?? '?'}] ${i.name ?? ''}`,
  },
  glpi_stats: {
    fetch: () => glpiApi.getAssetStats(),
    extractItems: (r) => (r?.data ? [r.data] : []),
    columns: [{ key: 'total_assets', label: 'Total Activos' }, { key: 'total_computers', label: 'Computadoras' }],
    rowLabel: (_i) => 'Estadísticas de activos GLPI',
  },
  glpi_health: {
    fetch: () => glpiApi.getAssetHealth(),
    extractItems: (r) => (Array.isArray(r?.data?.assets) ? r.data.assets.slice(0, 30) : []),
    columns: [{ key: 'name', label: 'Activo' }, { key: 'health_score', label: 'Score' }, { key: 'status', label: 'Estado' }],
    rowLabel: (i) => `${i.name ?? ''} — Score: ${i.health_score ?? '?'}`,
  },
  system_health: {
    fetch: () => mikrotikApi.getHealth(),
    extractItems: (r) => (r?.data ? [r.data] : []),
    columns: [{ key: 'cpu_load', label: 'CPU %' }, { key: 'free_memory', label: 'RAM Libre' }, { key: 'uptime', label: 'Uptime' }],
    rowLabel: (i) => `CPU: ${i.cpu_load ?? '?'}% | Uptime: ${i.uptime ?? '?'}`,
  },
  geoip_top_countries: {
    fetch: () => geoipApi.getTopCountries({ limit: 20 }),
    extractItems: (r) => {
      const d = r?.data;
      if (!d) return [];
      if (Array.isArray(d)) return d.slice(0, 20);
      if (Array.isArray(d?.countries)) return d.countries.slice(0, 20);
      return [];
    },
    columns: [{ key: 'country', label: 'País' }, { key: 'country_name', label: 'Nombre' }, { key: 'count', label: 'IPs' }],
    rowLabel: (i) => `${i.country_name ?? i.country ?? ''} — ${i.count ?? 0} IPs`,
  },
  telegram_activity: {
    fetch: () => actionsApi.getHistory(20),
    extractItems: (r) => (Array.isArray(r?.data) ? r.data.slice(0, 20) : []),
    columns: [{ key: 'action_type', label: 'Acción' }, { key: 'created_at', label: 'Fecha' }],
    rowLabel: (i) => `${i.action_type ?? ''} — ${i.created_at ?? ''}`,
  },
  action_history: {
    fetch: () => auditApi.getHistory({ page_size: 50 }),
    extractItems: (r) => {
      const d = r?.data;
      if (!d) return [];
      if (Array.isArray(d)) return d.slice(0, 50);
      if (Array.isArray(d?.items)) return d.items.slice(0, 50);
      return [];
    },
    columns: [{ key: 'action_type', label: 'Acción' }, { key: 'performed_by', label: 'Operador' }, { key: 'created_at', label: 'Fecha' }],
    rowLabel: (i) => `${i.action_type ?? ''} — ${i.performed_by ?? ''}`,
  },
};

/* ── Audience Options ──────────────────────────────────── */

const AUDIENCES = [
  { id: 'executive',   label: 'Ejecutivo',   desc: 'Lenguaje claro, impacto de negocio, riesgo resumido' },
  { id: 'technical',   label: 'Técnico',     desc: 'Detalle completo, IOCs, reglas, MITRE ATT&CK' },
  { id: 'operational', label: 'Operacional', desc: 'Pasos accionables, checklists, procedimientos' },
];

type ActiveTab = 'reports' | 'history' | 'schedules' | 'telegram';

/* ── Main Component ─────────────────────────────────────── */

export default function ReportsPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<ActiveTab>('reports');

  // Generator state
  const [prompt, setPrompt]                   = useState('');
  const [audience, setAudience]               = useState('technical');
  const [selectedSources, setSelectedSources] = useState<string[]>(['wazuh_alerts', 'mikrotik_connections']);
  type PreviewEntry = { data: any[]; excludedIndexes: Set<number>; isLoading: boolean; error: string | null; columns: PreviewCol[]; };
  const [previewData, setPreviewData] = useState<Record<string, PreviewEntry>>({});
  const [fromDate, setFromDate]               = useState('');
  const [toDate, setToDate]                   = useState('');
  const [compFromDate, setCompFromDate]       = useState('');
  const [compToDate, setCompToDate]           = useState('');
  const [showComparison, setShowComparison]   = useState(false);
  const [attachedDocs, setAttachedDocs]       = useState<string[]>([]);
  const [reportTitle, setReportTitle]         = useState('');
  const [currentSavedId, setCurrentSavedId]   = useState<number | null>(null);
  const [isSaving, setIsSaving]               = useState(false);
  const [saveSuccess, setSaveSuccess]         = useState(false);

  // TipTap Editor
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight,
    ],
    content: '<p>El borrador del reporte aparecerá aquí después de generarlo con IA...</p>',
    editorProps: { attributes: { class: 'focus:outline-none' } },
  });

  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: () => {
      // Build pre-filtered context from preview data
      const contextParts = selectedSources
        .filter(id => previewData[id]?.data?.length)
        .map(id => {
          const entry = previewData[id];
          const detail = DATA_SOURCE_DETAILS[id];
          const included = entry.data.filter((_, i) => !entry.excludedIndexes.has(i));
          if (!included.length) return null;
          const header = `### ${detail?.title ?? id} (${included.length} items)`;
          const rows = included.map(item => {
            const fetcher = SOURCE_FETCHERS[id];
            return fetcher ? fetcher.rowLabel(item) : JSON.stringify(item);
          });
          return `${header}\n${rows.join('\n')}`;
        })
        .filter(Boolean);

      const preFilteredDoc = contextParts.length
        ? `DATOS PRE-FILTRADOS DEL SISTEMA (usar como fuente primaria):\n\n${contextParts.join('\n\n')}`
        : null;

      return reportsApi.generate({
        prompt,
        audience,
        attached_documents: [...(preFilteredDoc ? [preFilteredDoc] : []), ...attachedDocs],
        data_sources: selectedSources,
        date_range: fromDate && toDate ? { from_date: fromDate, to_date: toDate } : undefined,
        comparison_range: showComparison && compFromDate && compToDate
          ? { from_date: compFromDate, to_date: compToDate }
          : undefined,
      });
    },
    onSuccess: (resp) => {
      if (resp.success && resp.data) {
        editor?.commands.setContent(resp.data.html_content);
        setReportTitle(resp.data.title);
        setCurrentSavedId(resp.data.saved_report_id ?? null);
        qc.invalidateQueries({ queryKey: ['saved-reports'] });
      }
    },
  });

  // Export PDF
  const exportMutation = useMutation({
    mutationFn: () => reportsApi.exportPdf(editor?.getHTML() || '', reportTitle || 'NetShield Report', { audience }),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportTitle || 'NetShield_Report'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  // Save edited report
  const handleSave = useCallback(async () => {
    const html = editor?.getHTML() || '';
    if (!html) return;
    setIsSaving(true);
    try {
      if (currentSavedId) {
        await reportsApi.updateSaved(currentSavedId, { title: reportTitle, html_content: html });
      } else {
        const res = await reportsApi.createSaved({
          title: reportTitle || 'Sin título',
          html_content: html,
          prompt,
          audience,
          data_sources: selectedSources,
        });
        if (res.data) setCurrentSavedId(res.data.id);
      }
      qc.invalidateQueries({ queryKey: ['saved-reports'] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } finally {
      setIsSaving(false);
    }
  }, [editor, currentSavedId, reportTitle, prompt, audience, selectedSources, qc]);

  // Load from history
  const handleLoadReport = useCallback(async (report: SavedReport) => {
    const res = await reportsApi.getSaved(report.id);
    if (res.data?.html_content) {
      editor?.commands.setContent(res.data.html_content);
      setReportTitle(res.data.title);
      setAudience(res.data.audience);
      setCurrentSavedId(res.data.id);
      setActiveTab('reports');
    }
  }, [editor]);

  // Apply template
  const handleTemplate = (template: ReportTemplate) => {
    setPrompt(template.prompt);
    setAudience(template.audience);
    setSelectedSources(template.data_sources);
  };

  const fetchPreview = async (id: string) => {
    const fetcher = SOURCE_FETCHERS[id];
    if (!fetcher) return;
    setPreviewData(prev => ({
      ...prev,
      [id]: { data: [], excludedIndexes: new Set(), isLoading: true, error: null, columns: fetcher.columns },
    }));
    try {
      const resp = await fetcher.fetch();
      const items = fetcher.extractItems(resp);
      setPreviewData(prev => ({ ...prev, [id]: { ...prev[id], data: items, isLoading: false } }));
    } catch {
      setPreviewData(prev => ({ ...prev, [id]: { ...prev[id], isLoading: false, error: 'Error al cargar datos' } }));
    }
  };

  const toggleSource = (id: string) => {
    if (selectedSources.includes(id)) {
      setSelectedSources(prev => prev.filter(s => s !== id));
      setPreviewData(prev => { const c = { ...prev }; delete c[id]; return c; });
    } else {
      setSelectedSources(prev => [...prev, id]);
      fetchPreview(id);
    }
  };

  const selectCategory = (category: DataSourceCategory) => {
    const ids = category.items.map(i => i.id);
    const allSelected = ids.every(id => selectedSources.includes(id));
    if (allSelected) {
      setSelectedSources(prev => prev.filter(id => !ids.includes(id)));
      setPreviewData(prev => {
        const c = { ...prev };
        ids.forEach(id => delete c[id]);
        return c;
      });
    } else {
      const toAdd = ids.filter(id => !selectedSources.includes(id));
      setSelectedSources(prev => [...new Set([...prev, ...ids])]);
      toAdd.forEach(id => fetchPreview(id));
    }
  };

  const toggleItemExclusion = (sourceId: string, idx: number) => {
    setPreviewData(prev => {
      const entry = prev[sourceId];
      if (!entry) return prev;
      const newSet = new Set(entry.excludedIndexes);
      if (newSet.has(idx)) newSet.delete(idx); else newSet.add(idx);
      return { ...prev, [sourceId]: { ...entry, excludedIndexes: newSet } };
    });
  };

  const toggleAllItems = (sourceId: string, selectAll: boolean) => {
    setPreviewData(prev => {
      const entry = prev[sourceId];
      if (!entry) return prev;
      return {
        ...prev,
        [sourceId]: {
          ...entry,
          excludedIndexes: selectAll ? new Set() : new Set(entry.data.map((_, i) => i)),
        },
      };
    });
  };

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const text = await file.text();
      setAttachedDocs(prev => [...prev, text.slice(0, 10000)]);
    }
  }, []);

  /* ── Tabs ─────────────────────────────────── */
  const tabs: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'reports',   label: 'Generador IA', icon: <Wand2   size={13} /> },
    { id: 'history',   label: 'Historial',    icon: <History size={13} /> },
    { id: 'schedules', label: 'Programación', icon: <Clock   size={13} /> },
    { id: 'telegram',  label: 'Telegram',     icon: <Bot     size={13} /> },
  ];

  /* ── Render ──────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-surface-100 flex items-center gap-2">
          <FileText className="w-5 h-5 text-brand-400" />
          Reportes
        </h1>
        <p className="text-sm text-surface-500 mt-0.5">
          Generador IA · Historial · Programación automática · Telegram
        </p>
      </div>

      {/* Tab switcher */}
      <div style={{
        display: 'flex', gap: '0.25rem',
        background: 'var(--color-surface-800)',
        padding: '0.3rem', borderRadius: 10, width: 'fit-content',
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            id={`reports-tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.4rem 0.85rem', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: '0.82rem', fontWeight: 600, transition: 'all 0.15s',
              background: activeTab === tab.id ? 'rgba(99,102,241,0.25)' : 'transparent',
              color: activeTab === tab.id ? 'var(--color-brand-300)' : 'var(--color-surface-400)',
              boxShadow: activeTab === tab.id ? '0 0 0 1px rgba(99,102,241,0.35)' : 'none',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tabs Content ── */}
      {activeTab === 'telegram' && <TelegramTab />}

      {activeTab === 'history' && (
        <div className="glass-card p-5">
          <ReportHistory onLoadReport={handleLoadReport} />
        </div>
      )}

      {activeTab === 'schedules' && (
        <div className="glass-card p-5">
          <ReportSchedules />
        </div>
      )}

      {/* ── Generator Tab ── */}
      {activeTab === 'reports' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left Panel ── */}
          <div className="space-y-4 animate-fade-in-up">

            {/* Templates */}
            <div className="glass-card p-4">
              <TemplateSelector onSelect={handleTemplate} />
            </div>

            {/* Prompt */}
            <div className="glass-card p-5">
              <h2 className="text-sm font-semibold text-surface-200 mb-3">Instrucción para la IA</h2>
              <textarea
                className="input min-h-28"
                placeholder="Describe el reporte que necesitas... Ej: 'Reporte ejecutivo de alertas críticas de las últimas 24h con recomendaciones de mitigación'"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
              />
            </div>

            {/* Audience */}
            <div className="glass-card p-5">
              <h2 className="text-sm font-semibold text-surface-200 mb-3">Audiencia</h2>
              <div className="space-y-2">
                {AUDIENCES.map(a => (
                  <label
                    key={a.id}
                    className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer border transition-all ${
                      audience === a.id
                        ? 'border-brand-500/40 bg-brand-500/10'
                        : 'border-surface-800/20 bg-surface-900/20 hover:border-surface-700/30'
                    }`}
                  >
                    <input
                      type="radio" name="audience" value={a.id}
                      checked={audience === a.id}
                      onChange={e => setAudience(e.target.value)}
                      className="mt-0.5 accent-brand-500"
                    />
                    <div>
                      <p className="text-xs font-semibold text-surface-200">{a.label}</p>
                      <p className="text-[0.65rem] text-surface-500">{a.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Data Sources — 2-column layout with detail panel */}
            <div className="glass-card p-5">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                <h2 className="text-sm font-semibold text-surface-200">Fuentes de Datos</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.6rem', color: 'var(--color-brand-400)', fontWeight: 600 }}>
                    {selectedSources.length > 0 ? `${selectedSources.length} seleccionadas` : ''}
                  </span>
                  <button
                    onClick={() => {
                      setSelectedSources(ALL_SOURCE_IDS);
                      ALL_SOURCE_IDS.filter(id => !selectedSources.includes(id)).forEach(id => fetchPreview(id));
                    }}
                    style={{ fontSize: '0.62rem', padding: '2px 7px', borderRadius: 4, cursor: 'pointer', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: 'var(--color-brand-400)' }}
                  >Todas</button>
                  <button
                    onClick={() => { setSelectedSources([]); setPreviewData({}); }}
                    style={{ fontSize: '0.62rem', padding: '2px 7px', borderRadius: 4, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--color-surface-500)' }}
                  >Ninguna</button>
                </div>
              </div>

              {/* 2-column grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '1rem' }}>

                {/* Left col: checkbox list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', maxHeight: '62vh', overflowY: 'auto', paddingRight: '0.25rem' }}>
                  <p style={{ fontSize: '0.6rem', color: 'var(--color-surface-500)', fontStyle: 'italic', margin: 0 }}>
                    Pasa el cursor sobre cada fuente para ver su tooltip
                  </p>
                  {DATA_SOURCE_CATEGORIES.map(cat => {
                    const catIds = cat.items.map(i => i.id);
                    const allSelected = catIds.every(id => selectedSources.includes(id));
                    const someSelected = catIds.some(id => selectedSources.includes(id));
                    return (
                      <div key={cat.category}>
                        <button
                          onClick={() => selectCategory(cat)}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', cursor: 'pointer', padding: '0.15rem 0', marginBottom: '0.3rem', width: '100%', textAlign: 'left' }}
                          title={`Seleccionar/deseleccionar todas las fuentes de ${cat.category}`}
                        >
                          <span style={{ fontSize: '0.85rem' }}>{cat.icon}</span>
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: allSelected ? 'var(--color-brand-400)' : someSelected ? 'var(--color-brand-500)' : 'var(--color-surface-500)' }}>
                            {cat.category}
                          </span>
                          <span style={{ fontSize: '0.6rem', color: 'var(--color-surface-600)', marginLeft: 'auto' }}>
                            {catIds.filter(id => selectedSources.includes(id)).length}/{catIds.length}
                          </span>
                        </button>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', paddingLeft: '0.25rem' }}>
                          {cat.items.map(src => (
                            <label
                              key={src.id}
                              title={src.tooltip}
                              style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.3rem 0.45rem', borderRadius: 6, cursor: 'pointer', border: `1px solid ${selectedSources.includes(src.id) ? 'rgba(99,102,241,0.3)' : 'transparent'}`, background: selectedSources.includes(src.id) ? 'rgba(99,102,241,0.07)' : 'transparent', transition: 'all 0.12s' }}
                              onMouseEnter={e => { if (!selectedSources.includes(src.id)) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
                              onMouseLeave={e => { if (!selectedSources.includes(src.id)) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                            >
                              <input type="checkbox" checked={selectedSources.includes(src.id)} onChange={() => toggleSource(src.id)} style={{ accentColor: 'var(--color-brand-500)', flexShrink: 0 }} />
                              <span style={{ fontSize: '0.82rem', flexShrink: 0 }}>{src.icon}</span>
                              <span style={{ fontSize: '0.73rem', color: selectedSources.includes(src.id) ? 'var(--color-surface-100)' : 'var(--color-surface-300)', fontWeight: selectedSources.includes(src.id) ? 500 : 400 }}>
                                {src.label}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Right col: detail panel */}
                <div style={{ position: 'sticky', top: '1rem', alignSelf: 'start' }}>
                  <DataSourceDetailPanel
                  selectedSources={selectedSources}
                  previewData={previewData}
                  onToggleItem={toggleItemExclusion}
                  onToggleAll={toggleAllItems}
                />
                </div>

              </div>
            </div>

            {/* Date Range */}
            <div className="glass-card p-5">
              <h2 className="text-sm font-semibold text-surface-200 mb-3">Rango de Fechas</h2>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[0.65rem] text-surface-500 block mb-1">Desde</label>
                  <input type="date" className="input text-xs" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                </div>
                <div>
                  <label className="text-[0.65rem] text-surface-500 block mb-1">Hasta</label>
                  <input type="date" className="input text-xs" value={toDate} onChange={e => setToDate(e.target.value)} />
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', cursor: 'pointer' }}>
                <input
                  type="checkbox" checked={showComparison}
                  onChange={e => setShowComparison(e.target.checked)}
                  style={{ accentColor: 'var(--color-brand-500)' }}
                />
                <GitCompare size={12} style={{ color: 'var(--color-brand-400)' }} />
                <span style={{ fontSize: '0.72rem', color: 'var(--color-surface-300)', fontWeight: 500 }}>
                  Comparar con otro período
                </span>
              </label>

              {showComparison && (
                <div className="grid grid-cols-2 gap-2 mt-2" style={{ paddingLeft: '1rem', borderLeft: '2px solid rgba(99,102,241,0.3)' }}>
                  <div>
                    <label className="text-[0.65rem] text-surface-500 block mb-1">Desde (B)</label>
                    <input type="date" className="input text-xs" value={compFromDate} onChange={e => setCompFromDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[0.65rem] text-surface-500 block mb-1">Hasta (B)</label>
                    <input type="date" className="input text-xs" value={compToDate} onChange={e => setCompToDate(e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            {/* File upload */}
            <div className="glass-card p-5">
              <h2 className="text-sm font-semibold text-surface-200 mb-3">Documentos de Contexto</h2>
              <label className="btn btn-ghost w-full cursor-pointer">
                <Upload className="w-4 h-4" />
                Subir documento (.txt / .md)
                <input type="file" className="hidden" accept=".txt,.pdf,.md" multiple onChange={handleFileUpload} />
              </label>
              {attachedDocs.length > 0 && (
                <p className="text-xs text-surface-500 mt-2">
                  {attachedDocs.length} documento(s) adjuntos
                  <button
                    onClick={() => setAttachedDocs([])}
                    style={{ marginLeft: '0.5rem', color: 'var(--color-danger-400)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.65rem' }}
                  >
                    Limpiar
                  </button>
                </p>
              )}
            </div>

            {/* Generate button */}
            <button
              className="btn btn-primary w-full py-3"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending || !prompt}
            >
              {generateMutation.isPending
                ? <><span className="loading-spinner" />Generando con IA...</>
                : <><Wand2 className="w-4 h-4" />Generar Borrador</>
              }
            </button>
            {generateMutation.isError && (
              <p className="text-xs text-danger">Error: {(generateMutation.error as Error).message}</p>
            )}
          </div>

          {/* ── Right Panel: Editor ── */}
          <div className="lg:col-span-2 space-y-4 animate-fade-in-up stagger-2">
            <input
              type="text" className="input text-lg font-bold"
              placeholder="Título del reporte"
              value={reportTitle} onChange={e => setReportTitle(e.target.value)}
            />

            <div className="tiptap-editor">
              {editor && <EditorToolbar editor={editor} />}
              <EditorContent editor={editor} />
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-surface-500">
                {generateMutation.data?.data?.tokens_used
                  ? `${generateMutation.data.data.tokens_used.toLocaleString()} tokens · modelo gratuito (OpenRouter)`
                  : currentSavedId
                    ? `Guardado (ID: ${currentSavedId})`
                    : 'Editá el borrador y exportá a PDF'
                }
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    padding: '0.4rem 0.85rem', borderRadius: 7,
                    background: saveSuccess ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${saveSuccess ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.1)'}`,
                    color: saveSuccess ? '#4ade80' : 'var(--color-surface-300)',
                    cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.2s',
                  }}
                >
                  <Save size={13} />
                  {isSaving ? 'Guardando...' : saveSuccess ? '¡Guardado!' : 'Guardar'}
                </button>
                <button
                  className="btn btn-success"
                  onClick={() => exportMutation.mutate()}
                  disabled={exportMutation.isPending}
                >
                  {exportMutation.isPending ? <span className="loading-spinner" /> : <Download className="w-4 h-4" />}
                  Exportar PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* ── DataSourceDetailPanel ──────────────────────────────── */

function DataSourceDetailPanel({
  selectedSources,
  previewData,
  onToggleItem,
  onToggleAll,
}: {
  selectedSources: string[];
  previewData: Record<string, {
    data: any[];
    excludedIndexes: Set<number>;
    isLoading: boolean;
    error: string | null;
    columns: { key: string; label: string }[];
  }>;
  onToggleItem: (sourceId: string, idx: number) => void;
  onToggleAll: (sourceId: string, selectAll: boolean) => void;
}) {
  if (selectedSources.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '220px', maxHeight: '62vh',
        border: '1.5px dashed rgba(255,255,255,0.1)', borderRadius: 10,
        padding: '1.5rem 1rem', textAlign: 'center', gap: '0.75rem',
        background: 'rgba(255,255,255,0.015)',
      }}>
        <Info size={28} style={{ color: 'var(--color-surface-600)', opacity: 0.7 }} />
        <p style={{ fontSize: '0.72rem', color: 'var(--color-surface-500)', lineHeight: 1.6, maxWidth: '200px', margin: 0 }}>
          Seleccioná una o más fuentes para previsualizar los datos reales que la IA recibirá
        </p>
        <span style={{ fontSize: '0.62rem', color: 'var(--color-surface-600)', fontStyle: 'italic' }}>
          Podés filtrar filas individuales antes de generar el reporte
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxHeight: '62vh', overflowY: 'auto', paddingRight: '0.2rem' }}>
      <p style={{ fontSize: '0.6rem', color: 'var(--color-surface-500)', fontStyle: 'italic', margin: 0, flexShrink: 0 }}>
        Preview de datos reales — marcá/desmarcá filas para incluirlas en el reporte
      </p>

      {selectedSources.map((id, idx) => {
        const detail = DATA_SOURCE_DETAILS[id];
        const entry = previewData[id];
        if (!detail) return null;

        const includedCount = entry ? entry.data.length - entry.excludedIndexes.size : 0;
        const totalCount = entry?.data.length ?? 0;

        return (
          <div
            key={id}
            className="animate-fade-in-up"
            style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, padding: '0.55rem 0.65rem',
              animationDelay: `${idx * 0.04}s`, animationFillMode: 'both',
            }}
          >
            {/* Source header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>{detail.icon}</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-surface-100)', flex: 1 }}>{detail.title}</span>
              <span style={{
                fontSize: '0.52rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                padding: '1px 5px', borderRadius: 4,
                background: `${detail.badgeColor}22`, border: `1px solid ${detail.badgeColor}44`, color: detail.badgeColor,
              }}>{detail.badge}</span>
            </div>

            {/* Loading state */}
            {(!entry || entry.isLoading) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0' }}>
                <span className="loading-spinner" style={{ width: 12, height: 12 }} />
                <span style={{ fontSize: '0.65rem', color: 'var(--color-surface-500)' }}>Cargando datos...</span>
              </div>
            )}

            {/* Error state */}
            {entry?.error && (
              <p style={{ fontSize: '0.65rem', color: 'var(--color-danger)', margin: '0.3rem 0' }}>⚠ {entry.error}</p>
            )}

            {/* Data preview */}
            {entry && !entry.isLoading && !entry.error && entry.data.length > 0 && (
              <>
                {/* Controls row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.6rem', color: includedCount === totalCount ? 'var(--color-brand-400)' : 'var(--color-warning)', fontWeight: 600 }}>
                    {includedCount}/{totalCount} seleccionadas
                  </span>
                  <button
                    onClick={() => onToggleAll(id, true)}
                    style={{ fontSize: '0.55rem', padding: '1px 5px', borderRadius: 3, cursor: 'pointer', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: 'var(--color-brand-400)' }}
                  >✓ Todas</button>
                  <button
                    onClick={() => onToggleAll(id, false)}
                    style={{ fontSize: '0.55rem', padding: '1px 5px', borderRadius: 3, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--color-surface-500)' }}
                  >✗ Ninguna</button>
                </div>

                {/* Mini data table */}
                <div style={{ maxHeight: '180px', overflowY: 'auto', borderRadius: 5, border: '1px solid rgba(255,255,255,0.06)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.62rem' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <th style={{ width: 20, padding: '3px 4px' }}></th>
                        {entry.columns.slice(0, 3).map(col => (
                          <th key={col.key} style={{ padding: '3px 5px', textAlign: 'left', color: 'var(--color-surface-400)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {entry.data.map((item, i) => {
                        const excluded = entry.excludedIndexes.has(i);
                        return (
                          <tr
                            key={i}
                            onClick={() => onToggleItem(id, i)}
                            style={{
                              cursor: 'pointer',
                              background: excluded ? 'transparent' : 'rgba(99,102,241,0.04)',
                              opacity: excluded ? 0.35 : 1,
                              transition: 'all 0.1s',
                              borderTop: '1px solid rgba(255,255,255,0.03)',
                            }}
                            onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = excluded ? 'rgba(255,255,255,0.02)' : 'rgba(99,102,241,0.1)'}
                            onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = excluded ? 'transparent' : 'rgba(99,102,241,0.04)'}
                          >
                            <td style={{ padding: '3px 4px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={!excluded}
                                onChange={() => onToggleItem(id, i)}
                                onClick={e => e.stopPropagation()}
                                style={{ accentColor: 'var(--color-brand-500)', width: 11, height: 11 }}
                              />
                            </td>
                            {entry.columns.slice(0, 3).map(col => {
                              const val = item[col.key];
                              const display = val === undefined || val === null ? '—'
                                : typeof val === 'boolean' ? (val ? '✓' : '✗')
                                : String(val).slice(0, 45);
                              return (
                                <td key={col.key} style={{ padding: '3px 5px', color: 'var(--color-surface-300)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {display}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Empty data */}
            {entry && !entry.isLoading && !entry.error && entry.data.length === 0 && (
              <p style={{ fontSize: '0.63rem', color: 'var(--color-surface-600)', fontStyle: 'italic', margin: '0.3rem 0' }}>
                Sin datos disponibles en este momento
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── TipTap Toolbar ─────────────────────────────────────── */

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;
  const a = (active: boolean) => active ? 'is-active' : '';
  return (
    <div className="tiptap-toolbar">
      <button className={a(editor.isActive('bold'))}      onClick={() => editor.chain().focus().toggleBold().run()}      title="Negrita"><Bold      className="w-4 h-4" /></button>
      <button className={a(editor.isActive('italic'))}    onClick={() => editor.chain().focus().toggleItalic().run()}    title="Cursiva"><Italic    className="w-4 h-4" /></button>
      <button className={a(editor.isActive('underline'))} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Subrayado"><UnderlineIcon className="w-4 h-4" /></button>
      <button className={a(editor.isActive('highlight'))} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Resaltar"><Highlighter className="w-4 h-4" /></button>
      <div className="w-px h-6 bg-surface-700/30 mx-1" />
      <button className={a(editor.isActive('heading', { level: 1 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Título 1"><Heading1 className="w-4 h-4" /></button>
      <button className={a(editor.isActive('heading', { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Título 2"><Heading2 className="w-4 h-4" /></button>
      <div className="w-px h-6 bg-surface-700/30 mx-1" />
      <button className={a(editor.isActive('bulletList'))}  onClick={() => editor.chain().focus().toggleBulletList().run()}  title="Lista"><List        className="w-4 h-4" /></button>
      <button className={a(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numerada"><ListOrdered className="w-4 h-4" /></button>
      <div className="w-px h-6 bg-surface-700/30 mx-1" />
      <button onClick={() => editor.chain().focus().setTextAlign('left').run()}   className={a(editor.isActive({ textAlign: 'left' }))}   title="Izquierda"><AlignLeft   className="w-4 h-4" /></button>
      <button onClick={() => editor.chain().focus().setTextAlign('center').run()} className={a(editor.isActive({ textAlign: 'center' }))} title="Centro"><AlignCenter className="w-4 h-4" /></button>
      <div className="w-px h-6 bg-surface-700/30 mx-1" />
      <button onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Deshacer"><Undo2 className="w-4 h-4" /></button>
      <button onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Rehacer"><Redo2 className="w-4 h-4" /></button>
    </div>
  );
}
