# Wazuh

## Objetivo funcional

Wazuh aporta visibilidad de seguridad: agentes, alertas, alertas criticas, resumen MITRE, timeline, top agentes, health y active response. En NetShield funciona como origen de eventos para decisiones de bloqueo, enriquecimiento de assets y widgets de postura de seguridad.

## Flujo usuario -> frontend -> backend -> servicio -> externo/mock

1. El usuario abre el dashboard de seguridad, widgets, inventory health o una accion de respuesta.
2. Hooks como `useWazuhSummary`, `useSecurityAlerts`, `useGlpiHealth` o widgets hibridos consultan el backend.
3. Los routers `backend/routers/wazuh.py`, `backend/routers/security.py` y `backend/routers/glpi.py` llaman a `WazuhService`.
4. `WazuhService` autentica contra Wazuh si usa modo real.
5. Si `settings.should_mock_wazuh` esta activo, responde con `MockData`.
6. Los datos de Wazuh se cruzan con MikroTik y GLPI cuando se calcula health, network context o acciones de cuarentena.

## Archivos principales involucrados

- `backend/services/wazuh_service.py`: singleton, auth, httpx, agentes, alertas, MITRE, active response y health.
- `backend/routers/wazuh.py`: endpoints directos de Wazuh.
- `backend/routers/security.py`: auto-block, quarantine y acciones que usan Wazuh.
- `backend/routers/glpi.py`: health de assets cruzando GLPI/Wazuh/MikroTik.
- `backend/config.py`: URL, usuario, password, verify SSL y `MOCK_WAZUH`.
- `backend/services/mock_data.py`: agentes, alertas, MITRE y health mock.
- Frontend: `QuickView`, widgets de seguridad, inventory health y vistas hibridas.

## Endpoints, hooks y componentes relevantes

- Endpoints Wazuh: familia `/api/wazuh/*` para agentes, alertas, resumen, MITRE, active response y health.
- Endpoints seguridad: `/api/security/auto-block`, `/api/security/quarantine`.
- Endpoints GLPI relacionados: `/api/glpi/assets/health`, `/api/glpi/assets/{id}/network-context`.
- Hooks: `useWazuhSummary`, `useSecurityAlerts`, `useSecurityActions`, `useGlpiHealth`.
- Componentes/widgets: `QuickView`, `AlertsFeed`, `AgentsThermometer`, `AgentAlertHeatmap`, `MitreMatrix`, `IncidentLifecycle`, `ConfirmedThreats`, `QuarantineTracker`.

## Datos que lee/escribe

- Lee agentes, estado de agentes, IPs asociadas, alertas, severidad, reglas, MITRE tactics/techniques y timestamps.
- Ejecuta active response si el endpoint/servicio lo solicita.
- Puede alimentar decisiones de `auto_block` y `quarantine`.
- No guarda alertas Wazuh localmente como tabla propia; se consultan a demanda o se usan para construir respuestas.
- Registra acciones derivadas en `ActionLog` cuando el router realiza una accion de seguridad.

## Errores, limites y pendientes

- En real, la autenticacion Wazuh depende de token, permisos y certificados. El mock no prueba expiracion de token ni TLS.
- La identidad fuerte agente/IP/asset no siempre esta garantizada: puede cambiar por DHCP, NAT, multiples NICs o datos incompletos.
- El endpoint `auto-block` inyecta Wazuh, pero el flujo actual debe revisarse si se espera validar formalmente una alerta especifica antes de bloquear.
- Active response requiere validar nombre de comando, agente destino y permisos en Wazuh real.
- Los mocks prueban que la UI y los contratos respondan, no que Wazuh tenga indices, reglas o agentes reales correctos.

## Pruebas recomendadas

- Con mock: listar agentes, alertas, MITRE y resumen; probar widgets que dependen de Wazuh.
- Contra Wazuh real: validar login, health, certificados, paginacion y estructura de alertas.
- Probar active response en un agente de laboratorio.
- Probar correlacion GLPI/Wazuh con activos que tengan IP coincidente y tambien con datos incompletos.
- Confirmar que acciones de seguridad dejan `ActionLog` con `action_type`, target y detalles suficientes.
