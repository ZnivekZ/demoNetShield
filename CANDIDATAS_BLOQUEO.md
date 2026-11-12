# Candidatas a bloqueo (piloto aislado)

Ruta web: **Wazuh SIEM → Candidatas (prueba)** (`/wazuh/candidates`).

## Flujo

1. El proceso consulta `wazuh-alerts-4.x-*` para todos los agentes. Si está habilitado, también consulta `wazuh-archives-*`. La presencia de la pestaña Archives en Wazuh no garantiza que cada agente mande todos los logs: el Manager archiva lo que recibe según la configuración de cada agente. Si el índice de archives no existe, el análisis continúa solo con alertas y lo informa.
2. Se extrae una IP de origen, el agente, la hora, la regla y el log. Alertas y archives del mismo evento se deduplican por ID, agente e IP. Un evento sin IP identificable no participa.
3. Las reglas activas se evalúan en ventanas temporales. Los valores iniciales son 5 fallos SSH, Windows/RDP o web en 10 minutos (SI automático) y alerta Wazuh nivel 12 o mayor (consulta a Groq).
4. Groq usa `openai/gpt-oss-120b` y, si falla, `openai/gpt-oss-20b`. La instrucción completa se edita desde la web. Cada evaluación queda en **SI** o **NO**; si no hay respuesta de IA, queda **NO técnico** con la causa. Hay un tope de 100 consultas IA por análisis; las restantes se registran como NO técnico.
5. Cada evaluación conserva la versión de la regla, la instrucción, el payload preparado y la respuesta de IA. `block_candidates` contiene una fila por IP y día solo si hubo al menos un SI. La web agrupa por día ART (00:00 a 23:59) y permite consultar reincidencia e historial de decisiones, incluidos los NO.

El monitoreo periódico comienza **desactivado**. Se puede hacer un análisis manual de un día desde la web y luego activar la consulta periódica (mínimo 60 segundos). Un análisis manual antiguo puede tardar por el volumen de archives. El sistema fracciona intervalos con más de 10.000 eventos para evitar resultados silenciosamente incompletos.

## Aislamiento

Este módulo escribe solamente en `candidate_config`, `candidate_rules`, `candidate_evaluations` y `block_candidates` dentro de la base de NetShield. No invoca la lista de bloqueo, el push ni operaciones de escritura sobre MikroTik. Para quitarlo de la interfaz y detenerlo, se retiran el router y el scheduler de `backend/main.py` y la ruta/enlace del frontend; las tablas pueden quedar como historial para auditoría.

Sin acceso al laboratorio real, la disponibilidad del índice archives, la cobertura de agentes y las reglas de producción deben comprobarse con un análisis manual. El estado y los errores de la última consulta se muestran en la pantalla.
