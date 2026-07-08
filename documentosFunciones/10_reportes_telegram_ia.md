# Reportes, Telegram e IA

## Objetivo funcional

Reportes, Telegram e IA convierten datos operativos en salidas comunicables: reportes PDF, resumen asistido por Claude/Anthropic, mensajes Telegram, scheduler, configuraciones recurrentes, logs y mensajes pendientes. Es la capa de comunicacion y automatizacion informativa del proyecto.

## Flujo usuario -> frontend -> backend -> servicio -> externo/mock

1. El usuario abre `/reports`.
2. `ReportsPage` y componentes Telegram llaman hooks de reportes/configuracion/logs.
3. `frontend/src/services/api.ts` envia requests al router `backend/routers/reports.py`.
4. El router consulta servicios de IA, PDF y Telegram segun accion.
5. `AIService` puede llamar Anthropic/Claude o devolver mock.
6. `PDFService` genera documentos.
7. `TelegramService` envia mensajes o consulta estado del bot.
8. `TelegramScheduler` maneja envios programados durante el ciclo de vida del backend.
9. Se escriben configuraciones y logs en modelos Telegram; acciones relevantes pueden registrarse en `ActionLog`.

## Archivos principales involucrados

- `backend/routers/reports.py`: endpoints de reportes, Telegram y configs.
- `backend/services/ai_service.py`: integracion Anthropic/Claude y tools/resumen.
- `backend/services/pdf_service.py`: generacion PDF.
- `backend/services/telegram_service.py`: bot, envio y estado.
- `backend/services/telegram_scheduler.py`: planificador.
- `backend/models/telegram.py`: configs, logs y pendientes.
- `backend/main.py`: inicializa servicio/scheduler Telegram en lifespan.
- `backend/config.py`: Anthropic, Telegram, scheduler y flags mock.
- `backend/services/mock_data.py`: respuestas AI/reportes/Telegram mock.
- Frontend: `frontend/src/components/reports/*`, hooks `useTelegramStatus`, `useTelegramLogs`, `useTelegramConfigs`.

## Endpoints, hooks y componentes relevantes

- Reportes: familia `/api/reports/*` para generar/descargar reportes, resumen IA y PDF.
- Telegram: endpoints de status, configs, logs, quick actions, preview, pending messages o envio segun router.
- Hooks: `useTelegramStatus`, `useTelegramLogs`, `useTelegramConfigs`.
- Componentes: `ReportsPage`, `TelegramTab`, `TelegramStatusCard`, `TelegramQuickActions`, `TelegramHistory`, `TelegramConfigModal`, `TelegramConfigList`, `MessagePreview`, `CronBuilder`, `BotConversation`.

## Datos que lee/escribe

- Lee datos de seguridad/red/inventario para construir reportes.
- Lee configuracion Anthropic y Telegram desde `settings`.
- Escribe `TelegramReportConfig`: frecuencia, destino, plantilla y estado.
- Escribe `TelegramMessageLog`: envios, errores y metadatos.
- Escribe `TelegramPendingMessage`: mensajes pendientes o confirmables.
- Puede escribir `ActionLog` para reportes generados o acciones administrativas.
- En mock, `MockData` simula respuesta de IA, estado Telegram y datos de reporte.

## Errores, limites y pendientes

- Anthropic/Claude real requiere API key, modelo correcto, limites de tokens y manejo de errores externos.
- PDF puede depender de librerias del sistema y fuentes; hay que probar generacion en la maquina destino.
- Telegram real requiere bot token, chat ids autorizados y manejo de rate limits.
- Scheduler debe validarse con reinicios: que pasa con tareas pendientes, duplicados y zona horaria.
- Los mocks muestran el flujo, pero no garantizan entrega real de Telegram ni calidad de resumen IA.

## Pruebas recomendadas

- Con mock: generar preview, PDF y logs Telegram.
- Probar creacion/edicion/eliminacion de configuraciones recurrentes.
- Contra Telegram real: enviar mensaje a chat de prueba y revisar log de exito/error.
- Contra Anthropic real: generar un resumen corto con datos controlados y validar coste/latencia.
- Descargar PDF y abrirlo para confirmar formato.
- Reiniciar backend y confirmar que scheduler no duplica envios.
