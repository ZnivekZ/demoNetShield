# Plan de implementación de Fibot

Fibot será un ítem del menú de NetShield que abrirá el chat de investigación. El técnico elegirá agentes, preguntará en castellano y podrá revisar la evidencia y el recorrido de cada consulta. El chat de uso operativo consultará el lab real. Si una fuente está desconectada, indicará su estado. Los datos y servicios simulados se usarán exclusivamente en las pruebas automáticas de desarrollo.

## Estado del piloto al 18 de noviembre de 2026

La ruta autenticada `/fibot` está integrada en el menú de NetShield. El historial y las trazas se guardan por usuario en la base configurada por NetShield. Al abrir el detalle se ven los intercambios con Groq, los filtros de Wazuh y una consulta copiable a Dev Tools. El operador puede abrir los eventos de una fila o gráfico, comprobar qué agentes tienen documentos en la fuente y guardar una consulta para actualizarla más tarde.

El presupuesto inicial es de cuatro llamadas a Groq por pregunta, incluidas las búsquedas públicas, y 18.000 tokens estimados para el turno. El primer envío toma hasta tres turnos previos del mismo alcance y reduce ese historial si supera la mitad del presupuesto. La API de Wazuh proporciona la lista de agentes. El Indexer recibe sus identificadores y agrega los resultados. Los errores de acceso, cuota o tiempo dejan un estado visible en el chat.

La configuración de referencia está en [backend/.env.example](backend/.env.example). El piloto usa la clave Groq de NetShield con `openai/gpt-oss-120b` como modelo principal y `openai/gpt-oss-20b` como respaldo durante el turno. La búsqueda pública opcional comienza desactivada. Cuando se habilita, contrasta hasta tres identificadores encontrados con sus publicaciones en NVD. La previsualización de bloqueo comprueba la lista local vigente y termina en revisión.

### Validación local

Desde el directorio `backend`, ejecutar `../.venv/bin/python -m unittest discover -s tests -p test_fibot.py`. Las pruebas usan SQLite en memoria y respuestas de proveedores preparadas en el módulo de pruebas. Cubren el recorrido Archives → Alerts → seguimiento por hora, el alcance por agente, dos instalaciones con el mismo número de Proxy Host, paquetes JDK, CVE, reputación, cuotas, errores y la privacidad de las trazas. La comprobación de interfaz en Chromium recorrió el selector, el envío, el gráfico, la evidencia y el detalle desplegable con respuestas HTTP interceptadas.

La aceptación operativa queda pendiente de contrastar una misma ventana de `npm39` en Fibot y Dev Tools. Conviene registrar primero si ambos devuelven el mismo total de 404 y luego si una regla puede atribuirse a la IP ganadora. Más abajo se detallan los permisos, los campos y las muestras que faltan.

## Primera entrega que debería poder usar un técnico

Con el lab conectado, elegir `npm39`, preguntar «De las IP que recibieron 404 ayer, ¿cuál tuvo más y qué reglas disparó esa IP?» y obtener el conteo, las alertas atribuibles y los eventos de respaldo. Continuar con «graficame esos 404 por hora», abrir el detalle de las llamadas, copiar la consulta a Dev Tools y reabrir el chat conservando la selección y el resultado.

## Orden de construcción

| Etapa | Trabajo y criterio de aceptación |
| --- | --- |
| 1. Fuentes y consultas locales | Crear ejemplos reproducibles de Archives, Alerts, paquetes y CVE. Implementar las operaciones de lectura y probar que la consulta enviada contiene los agentes, fechas y campos esperados. Validar el ranking y los cruces con resultados conocidos antes de conectar el modelo. |
| 2. Chat completo con dos consultas encadenadas | Añadir la ruta Fibot, persistencia, selector de agentes y ciclo de herramientas. Implementar desde esta etapa la traza visible en vivo y al reabrir. Completar el ejemplo de la primera entrega con un sustituto de Groq que pida dos herramientas consecutivas. |
| 3. Investigación interactiva | Habilitar varios agentes o todos los autorizados, comparación entre IP y períodos, desglose por instalación y Proxy Host, búsqueda de errores y reglas, tabla, gráfico y acceso a evidencia. Guardar una vista con su consulta para volver a ejecutarla. Probar un seguimiento que haga referencia a las filas de un resultado anterior. |
| 4. Inventario, vulnerabilidades y reputación | Incorporar preguntas de paquetes/versiones, CVE exacto y agentes afectados. Enriquecer las IP públicas de un resultado con AbuseIPDB. Mostrar procedencia, hora, cobertura y resultados parciales si falla una fuente. Estas operaciones se pueden desarrollar en paralelo al piloto de tráfico. |
| 5. Avisos recientes y acción de bloqueo | Añadir búsqueda pública opcional para avisos sin identificador conocido y previsualización de una selección de IP para la lista de NetShield. Tienen validaciones independientes. El chat de investigación funciona aunque ambas estén deshabilitadas. |

Las cantidades estimadas de instalaciones y Hosts no determinan la interfaz. El inventario de agentes será dinámico. MikroTik y GLPI quedan en pausa. Para el alcance y los campos ya observados en el proxy, ver el [inventario del lab](WAZUH_PROXY_ARCHIVES_LAB_REAL.md).

## Cómo se resuelve un turno

1. Al enviar el mensaje, FastAPI registra usuario, conversación, agentes autorizados elegidos y período efectivo. Para «ayer» fija las fechas en horario de Buenos Aires y envía límites UTC al Indexer. Una comparación reutiliza ese intervalo aunque el técnico reabra el chat otro día.
2. El backend envía a Groq la pregunta, las funciones disponibles y un contexto breve con los filtros activos y referencias a resultados previos. Groq puede responder, solicitar una aclaración o devolver una llamada de herramienta. El backend comprueba sus argumentos y restringe cualquier consulta al alcance elegido por el técnico.
3. Una función de NetShield traduce campos, filtros, métricas, agrupaciones y orden a OpenSearch. El modelo elige entre operaciones permitidas. Solo el backend construye la consulta ejecutable, limita el período y el número de resultados y comprueba si hubo errores, fallos de shards o recortes.
4. NetShield guarda el resultado y devuelve a Groq un resumen asociado a la llamada. Si Groq pide otra herramienta, repite el paso 3. El texto final, una aclaración, una cancelación o el agotamiento del presupuesto terminan el turno. Si repite una llamada idéntica sin avanzar, se conserva la evidencia obtenida y se explica qué quedó pendiente.

**Parámetros iniciales propuestos para el piloto.** Hasta cuatro llamadas a Groq por pregunta, un presupuesto de tokens configurable por modelo y resúmenes acotados para cada herramienta. Medirlos con el caso encadenado y el top con reputación antes de fijar valores de producción. Consultar AbuseIPDB para diez IP puede ser una sola operación solicitada por Groq y hasta diez lecturas externas. Aplicar caché y límites por proveedor.

## Qué consulta cada herramienta

| Fuente | Preguntas y tratamiento |
| --- | --- |
| Archives | Top por IP, comparación entre IP, errores por ruta, host o período y series horarias. Para NPM filtrar por decoder y origen. Identificar el Proxy Host por instalación y archivo. Distinguir el estado HTTP final del upstream. Si se pide «tráfico erróneo», explicitar si se cuentan 4xx, 5xx o ambos. Agrupar en el Indexer y recuperar pocos eventos de ejemplo. |
| Alerts | Buscar por regla, IP, agente y tiempo. Un evento de volumen que solo identifica un archivo sirve como evidencia sobre ese archivo. Atribuirlo a una IP requiere que figure como origen o exista un vínculo inequívoco con la petición. |
| Paquetes y CVE | Buscar software en `wazuh-states-inventory-packages-*` y CVE exacto en `wazuh-states-vulnerabilities-*`. Contar equipos distintos por agente y mostrar paquete, versión y fecha disponible. Respetar el alcance seleccionado aunque solo un agente tenga Archives. Distinguir inventario vacío, fuente inaccesible e inventario de antigüedad desconocida. |
| AbuseIPDB | Enriquecer las IP exactas del resultado guardado. Mostrar puntuación y momento de consulta. Conservar filas privadas, agotamiento de cuota y errores con estados propios. El servicio [ip_reputation.py](backend/services/ip_reputation.py) consulta también VirusTotal en su flujo general. Para Fibot exponer lectura específica de AbuseIPDB sin reportar IP al proveedor. |
| Avisos públicos | Con un CVE conocido, reutilizar [remediation_sources.py](backend/services/remediation_sources.py) para NVD y referencias del fabricante. Para «el aviso de PHP de ayer», buscar por tema y fecha con una petición pública separada, validar la fuente y distinguir publicación de descubrimiento. Luego consultar el lab por el CVE identificado. Si el aviso es ambiguo, pedir precisión. |

## Interfaz, persistencia y traza

- **Chat.** Historial lateral por usuario, conversación central, selector junto al prompt y alcance visible en cada turno. Una consulta posterior hereda la selección salvo cambio explícito. Indicar para cada fuente y agente si hay datos observados en el período, cobertura parcial o cobertura desconocida. Conservar la diferencia entre «ninguna coincidencia» y «no se pudo comprobar».
- **Resultados.** El backend entrega columnas, filas, series, unidades, filtros, totales y referencias a eventos. React usa tabla, barras o líneas con Recharts. Un clic abre la evidencia con los mismos filtros. Guardar la vista conserva el plan y la representación. Actualizarla crea una ejecución nueva con su propia fecha.
- **SQLite.** Registrar conversaciones, turnos, pasos, resultados resumidos y vistas con propietario. Vincular cada seguimiento con el resultado que menciona. Guardar los identificadores de fila necesarios para «esas IP». El historial conserva las cifras mostradas aunque los eventos de Wazuh caduquen. Un turno interrumpido debe poder reabrirse con su estado y reintentarse sin duplicar mensajes ni acciones.
- **Ver detalle / Ocultar detalle.** Por turno, mostrar cada envío a Groq (modelo, mensajes efectivos, contexto y herramientas), respuesta recibida (texto y llamadas), consulta a Wazuh (método, índice, JSON copiable), respuesta del Indexer y resumen enviado al modelo. Añadir orden, tiempos, tokens, errores y motivo de finalización. Ofrecer la traza durante la ejecución mediante actualizaciones incrementales y al reabrir desde SQLite. Son intercambios observables de la API.
- **Fidelidad de la traza.** Sanear el contenido antes de enviar a Groq y guardar ese mismo contenido para inspección. De Wazuh conservar agregados y muestras acotadas, total y cantidad visible. Marcar explícitamente todo recorte o redacción. Evitar guardar claves, cabeceras de autorización, parámetros sensibles de URL o logs crudos completos. Aplicar los permisos del propietario a mensajes, trazas, evidencias y vistas.
- **Dos indicadores junto al chat.** «Contexto» muestra alcance, presupuesto estimado del próximo turno y si se resumió el historial. Al acercarse al límite, permitir continuar con resumen o iniciar otro chat. «Groq» muestra consumo por modelo, cuota comunicada por el proveedor y hora de lectura, o estimación local identificada como tal. Ante un 429 guardar la pregunta y mostrar cuándo reintentar. Reutilizar [groq_usage.py](backend/services/groq_usage.py).

**Integración en el repositorio.** Registrar el router Fibot en [main.py](backend/main.py), sus modelos en [database.py](backend/database.py) y la página en [App.tsx](frontend/src/App.tsx). Reutilizar [el cliente del Indexer](backend/services/wazuh_indexer.py), [la agrupación de CVE](backend/services/active_cve_inventory.py) y [el listado de agentes](frontend/src/hooks/useWazuh.ts). Mantener el flujo de herramientas de Fibot separado de los prompts de diagnóstico y reportes existentes.

## Pruebas que podemos preparar sin el lab

| Caso | Resultado esperado |
| --- | --- |
| Captura de Dev Tools aportada por el usuario | La búsqueda por `*jdk*` devuelve 10 documentos con un único nombre de agente, `fvacaninb`. Cuatro paquetes OpenJDK 17, cuatro OpenJDK 21 y dos `default-jdk*`. Conservar las versiones originales. Esta captura respalda una consulta histórica de paquetes. El ID del agente y el estado de sus CVE requieren otras consultas. |
| Pregunta compuesta sobre 404 y alertas | Con datos sintéticos, la IP del ranking se usa en la segunda consulta. Una alerta de volumen sin IP queda fuera de las coincidencias atribuibles. La traza permite comparar JSON ejecutado, resultado recibido y mensaje devuelto a Groq. |
| Cambio de alcance y de período | Dos instalaciones simuladas pueden tener un `proxy-host-7`. No mezclar sus conteos. Si un agente solo tiene inventario, sigue disponible para preguntas de paquetes o CVE. Un intervalo sin cobertura queda señalado en el gráfico. |
| Reabrir chat, cuotas y fallos | Recuperar filas y alcance originales. Simular 429, timeout del Indexer, respuesta parcial y fin del presupuesto. Mostrar los pasos completados y comprobar que otro usuario no accede al chat ni a sus trazas. |
| Enriquecimiento y acciones | Sobre un ranking fijo con IP públicas y privadas, mantener el orden aunque falle AbuseIPDB. Para «poné esas IP en la lista» mostrar la selección exacta, existentes y efecto previsto. La confirmación explícita por un usuario autorizado será una operación separada y auditable, idempotente al reintentar. |

## Pendientes para cuando haya acceso

| Dónde | Qué conviene traer o verificar | Decisión que permite tomar |
| --- | --- | --- |
| Lab · NetShield e Indexer | Probar lectura desde el entorno del backend de Archives, Alerts, paquetes y vulnerabilidades. Registrar por fuente índice accesible, fecha, resultado o error y mecanismo TLS efectivo. | Habilitar cada fuente por separado y contrastar sus resultados con Dev Tools. |
| Lab · agentes y NPM | Listado saneado de agentes, instalación y origen de los access logs. En `npm39`, una ventana con inicio, fin y zona, muestras 4xx/5xx reales y conteos de referencia para una IP. Verificar desde cuándo hay campos del decoder y qué representa `data.srcip` tras los proxies anteriores. | Validar el piloto, la cobertura por Host y la atribución a cliente antes de usar una IP para una acción. |
| Lab · Alerts | Consultar el mapping de `timestamp` y `@timestamp`. Para el intervalo anterior, traer una regla con IP si existe y otra de volumen sin IP, con campos anonimizados y totales. | Elegir el campo temporal correcto y validar la correlación. |
| Lab · inventario | Repetir la búsqueda JDK incluyendo `agent.id`. Elegir un CVE visible y guardar el ID exacto, número de agentes distintos, paquete, versión y fecha de detección. Anotar si se puede conocer la antigüedad del inventario. | Confirmar el selector por ID y distinguir hallazgos actuales de capturas anteriores. |
| Cuenta de proveedores | Con una consulta pública, verificar acceso a Groq `browser_search`, fuentes recuperables, consumo y límites. Probar un resultado de AbuseIPDB con una IP pública adecuada. | Habilitar búsqueda pública y reputación de forma independiente. |
| Despliegue · lista de bloqueo | Comprobar quién puede escribir, posibles consumidores de la lista y sincronización vigente. Mientras ese efecto esté pendiente o implique una integración pausada, el piloto llega hasta la previsualización. | Decidir si se habilita la confirmación sobre la lista local y describir al técnico el efecto real. |

Para completar estos pendientes alcanzan consultas de lectura, conteos y muestras anonimizadas. Registrar fuente, fecha y alcance de cada comprobación para que pueda repetirse. El primer hito local termina cuando las pruebas automáticas verifican la secuencia, la traza y los conteos esperados. La primera prueba del técnico se hará en NetShield contra el lab real.
