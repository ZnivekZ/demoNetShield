# Wazuh Archives del proxy en el lab real

**Estado documentado al 17/11/2026.** Este inventario incorpora el contexto exportado del proyecto Grafana/Wazuh y lo contrasta con su `MIGRACION-LAB-REAL.md`, que registra validaciones del **10/11/2026**. No se hizo una nueva consulta al lab desde NetShield. Los ejemplos del contexto exportado son ficticios y no constituyen eventos reales.

El usuario estima que el lab tiene **alrededor de cinco instalaciones distintas de Nginx Proxy Manager**, con **unos 15 Proxy Hosts por instalación**. Estas cantidades son orientativas y no deben fijarse en el código. La evidencia exportada identifica y valida en detalle solo una instalación: `npm39`, agente Wazuh `002`. Los identificadores de agente, nombres y cobertura de logs del resto todavía no están inventariados en este repositorio.

## Flujo confirmado por el proyecto Grafana/Wazuh

```text
Nginx Proxy Manager en npm39 (agente Wazuh 002)
  → /data/logs/proxy-host-N_access.log
  → Wazuh Agent → Wazuh Manager 4.14.9
  → decoder npm-proxy-access → archives.json
  → Filebeat, módulo wazuh/archives
  → Wazuh Indexer: wazuh-archives-*
  → Grafana en loki: datasource OpenSearch «Wazuh Archives»
```

El proyecto de Grafana registró documentos reales de `npm39` en `wazuh-archives-*`, con los campos nuevos del decoder. Esto prueba que el flujo hasta el Indexer funcionaba en la validación registrada. El contexto exportado indica `logall_json=yes` y Filebeat Archives habilitado; aquí no se leyó de nuevo la configuración activa del manager. Archives conserva los **eventos recibidos**, incluso cuando no disparan alertas; su cobertura depende de los archivos que recoge cada agente.

Grafana consulta el Indexer, no la API REST del Wazuh Manager. En `loki` usa el adaptador local de solo lectura `http://127.0.0.1:19200`, que conecta al Indexer por HTTPS con validación TLS y corrige una petición `_field_caps` del plugin. Los datasources OpenSearch de Archives y Alerts pasaron `Save & test`; Explore mostró documentos estructurados de Archives. Los dashboards **REAL** estaban generados, pero su importación y validación final seguían pendientes en el último registro.

## Contrato de datos observado para el proxy

El filtro de base para consultar tráfico del proxy es `agent.id=002`, `decoder.name=npm-proxy-access` y un rango de `timestamp`. `location` identifica el archivo `proxy-host-N_access.log`, por lo que permite separar Proxy Hosts. El decoder personalizado es hijo del decoder integrado `zeus` y extrae estos valores de los eventos **nuevos**:

**Jerarquía de consulta:** instalación NPM → Proxy Host → petición. `agent.id` identifica el agente/host Wazuh; `location` identifica el archivo `proxy-host-N_access.log` dentro de los logs recogidos por ese agente. El identificador operativo del Proxy Host debe combinar **instalación + `location`**: un `proxy-host-7_access.log` de dos instalaciones distintas no representa necesariamente el mismo Proxy Host. `data.http_host` es el host HTTP solicitado por el cliente y sirve como dato adicional, pero no debe sustituir por sí solo al identificador del Proxy Host. Antes de comparar instalaciones, hay que construir un inventario `instalación ↔ agent.id ↔ agent.name ↔ origen de log` y verificar si existe una relación uno a uno entre instalación y agente. Si un agente recoge varias instalaciones, se necesita además un identificador de origen que las distinga.

| Campo en Archives | Significado | Uso en NetShield |
| --- | --- | --- |
| `timestamp` | Hora del evento; tipo `date`. | Filtro de período y evolución temporal. |
| `agent.id`, `agent.name` | Agente `002`, `npm39`. | Limitar la consulta al proxy. |
| `location` | Archivo `proxy-host-N_access.log`. | Separar Proxy Hosts. |
| `decoder.name` | `npm-proxy-access`. | Limitar a accesos ya decodificados. |
| `data.srcip` | Valor `[Client ...]` del log. | Agrupar y comparar IP; su identidad como cliente efectivo sigue pendiente de validar. |
| `data.url` | URL solicitada, incluido posible query string. | Buscar rutas; quitar parámetros antes de mostrar o enviar a un modelo externo. |
| `data.http_host` | Host solicitado por HTTP. | Agrupar por host virtual. |
| `data.http_method`, `data.http_scheme` | Método y esquema HTTP. | Filtros y desglose. |
| `data.http_status` | Código final recibido por el cliente. | Conteos y filtros de 4xx/5xx. |
| `data.upstream_status` | Código del backend; puede diferir del final o ser `-`. | Diagnóstico del proxy/backend. |
| `full_log` | Línea original. | Evidencia bajo acceso controlado; puede contener tokens en la URL. |

La comprobación `_field_caps` registrada dio tipo `keyword` para `agent.id`, `decoder.name`, `location`, `data.srcip`, `data.http_host`, `data.url` y `data.http_status`. Se consultan **sin** sufijo `.keyword`. `data.http_status` es texto: los conteos por estado funcionan, pero no corresponde calcular promedios numéricos sobre ese campo. User agent y referer continúan en `full_log`; no figuran entre los siete campos extraídos por el decoder.

Los documentos anteriores a la activación del decoder pueden conservar solo `full_log`: no se enriquecieron retroactivamente. La prueba en el manager verificó una respuesta 200 real y una 404 sintética; faltaba validar respuestas 4xx/5xx **reales** y otros Proxy Hosts. También falta confirmar si `data.srcip` es el cliente original cuando existe otro proxy delante (`X-Forwarded-For`).

## Archives frente a Alerts

- **Archives** es la fuente observada para contar peticiones HTTP por IP, ruta, host y estado, aunque no haya regla Wazuh.
- **Alerts** contiene los eventos que dispararon reglas. En la muestra registrada para `proxy-host-*_access.log` aparecieron tres alertas de volumen del archivo `proxy-host-12_access.log`, regla 11 y nivel 4, **sin IP cliente ni detalles de una petición**. No se deben atribuir a una IP ni interpretar como detecciones de ataque por IP.
- Una petición real de `proxy-host-7_access.log` no generó una alerta específica en la prueba inicial. La validación posterior confirmó el decoder nuevo en Archives, pero no documentó todavía reglas HTTP por IP para esos Proxy Hosts.

Por eso, un «top 10 IP con más tráfico» se puede calcular en Archives. Un «top 10 IP maliciosas» requiere definir un criterio adicional, por ejemplo fallos HTTP repetidos en una ventana móvil y evidencia de reglas atribuibles a esa IP. Muchos 4xx/5xx por sí solos no prueban un ataque. La IP privada observada en la muestra tampoco sirve para una consulta de reputación pública como AbuseIPDB.

Como referencia para la futura vista por prompt, esta consulta de solo lectura cuenta documentos de acceso por IP en las últimas 24 horas. El resultado de `aggregations.ips.buckets` es **tráfico observado**, no un ranking de atacantes:

```http
GET /wazuh-archives-*/_search
{
  "size": 0,
  "query": {
    "bool": {
      "filter": [
        {"term": {"agent.id": "002"}},
        {"term": {"decoder.name": "npm-proxy-access"}},
        {"range": {"timestamp": {"gte": "now-24h"}}},
        {"exists": {"field": "data.srcip"}}
      ]
    }
  },
  "aggs": {
    "ips": {"terms": {"field": "data.srcip", "size": 10, "order": {"_count": "desc"}}}
  }
}
```

Para «¿en cuáles instalaciones y en cuáles de sus Proxy Hosts apareció esta IP?», se quita el filtro fijo `agent.id=002`, se agrega `term` sobre `data.srcip` con la IP buscada y se agrupa primero por `agent.id` **si el inventario confirma una instalación por agente**; dentro de cada agente se agrupa por `location`. `data.http_host` puede mostrarse como dato complementario. La respuesta debe distinguir instalaciones sin eventos de instalaciones cuya recolección no está comprobada.

Para «¿en cuáles instalaciones ocurrió el error HTTP 502?», se consulta Archives por `data.http_status=502` (o `data.upstream_status=502` si se pregunta por el backend) y se agrupa por el identificador de instalación confirmado. Para «¿en cuáles se disparó la regla X?», se consulta Alerts por `rule.id=X` y se usa ese mismo inventario para asociar agente y origen con la instalación. La atribución adicional de la regla a una IP exige que la alerta incluya esa IP o un vínculo inequívoco con una petición; compartir agente y período no alcanza.

## Implicaciones para este repositorio

NetShield ya tiene conexión configurada al Wazuh Indexer en `https://10.2.1.213:9200`, independiente del adaptador de Grafana. La configuración local de NetShield usa `WAZUH_INDEXER_VERIFY_SSL=false`; por ello, la validación TLS lograda por el adaptador de Grafana **no** equivale a validación TLS de NetShield. No se probó la conexión de NetShield al lab en este relevamiento.

El cliente general `backend/services/wazuh_indexer.py` consulta principalmente `wazuh-alerts-4.x-*`; su búsqueda paginada no implementa todavía las agregaciones sobre Archives necesarias para la vista por prompt. El módulo aislado de candidatas, `backend/services/block_candidate_service.py`, **sí** lee `wazuh-archives-*` cuando se habilita, además de Alerts. Conviene reutilizar la conexión y centralizar las nuevas consultas por período, agente, decoder y Proxy Host en el backend.

Para esta fuente, un plan estructurado de consulta puede traducirse a filtros sobre `timestamp`, `agent.id`, `decoder.name` y `location`, más agregaciones por `data.srcip`, `data.http_status` o `data.http_host`. El resultado debe distinguir cantidad de **documentos/peticiones** de cantidad de **alertas**. Los ejemplos previos al decoder deben señalarse como cobertura parcial.

Hay una discrepancia de código a revisar antes de unir series de las dos fuentes: el módulo de candidatas filtra Alerts con `@timestamp`, mientras la búsqueda general de alertas y el datasource Grafana usan `timestamp`. El campo efectivo de Alerts debe comprobarse en el índice real para evitar ventanas vacías o comparaciones falsas.

## Verificaciones pendientes para NetShield

1. Confirmar desde NetShield acceso de solo lectura a `wazuh-archives-*` y consultar eventos recientes de `agent.id=002`, `decoder.name=npm-proxy-access`.
2. Inventariar las demás instalaciones y sus `agent.id`; comprobar en cada una recepción de access logs, decoder, campos y cobertura temporal por Proxy Host. Validar ejemplos 4xx/5xx reales.
3. Confirmar cadena de proxies y significado de `data.srcip` antes de enriquecer IP o proponer bloqueos.
4. Verificar el campo temporal efectivo de Alerts, permisos de lectura y política de retención del índice Archives.
5. Definir qué consulta representa tráfico, error HTTP o evidencia de ataque; conservar esa definición junto al resultado mostrado.

## Procedencia

- Contexto exportado adjunto: `Contexto exportable: Wazuh Archives y logs de Nginx Proxy Manager` (17/11/2026).
- Registro de validación: `MIGRACION-LAB-REAL.md` del proyecto `grafana-wazuh` (10/11/2026).
- Decoder y prueba: `wazuh/npm_proxy_access_decoder.xml` y `wazuh/README.md` de ese mismo proyecto.
- Contraste con NetShield: `backend/services/wazuh_indexer.py`, `backend/services/block_candidate_service.py` y `backend/.env` local; no se copiaron credenciales.
