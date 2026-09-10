# Lista de Pendientes - NetShield

- [ ] **Eliminar referencias de ReportsPage del CrowdSec**
  - Quitar importaciones y llamadas a `crowdsecApi` en `frontend/src/components/reports/ReportsPage.tsx`.
  - Quitar la categoría y fuentes de datos de CrowdSec (`crowdsec_decisions`, `crowdsec_alerts`, `crowdsec_metrics`) de la interfaz de generación de reportes (alineado con la integración a Wazuh).

- [ ] **Actualizar el API para consumir modelo IA**
  - Configurar y ajustar el endpoint/cliente para el consumo real del modelo de Inteligencia Artificial (OpenRouter / OpenAI).
  - Verificar variables de entorno, claves de API y manejo de errores cuando el servicio o las cuotas no estén disponibles.

- [ ] **Revisar el generador de reportes**
  - Probar la generación end-to-end de reportes (frontend + backend).
  - Verificar la integración con las fuentes de datos activas (Wazuh, MikroTik, GLPI, Suricata, GeoIP, Historial de acciones).
  - Validar el editor TipTap, la exportación (HTML/PDF) y el envío a Telegram.

- [ ] **Terminar lo de hacerle un Docker**
  - Completar la containerización de la aplicación (Dockerfile backend, frontend / Nginx, y docker-compose).
  - Asegurar la persistencia de bases de datos (SQLite/PostgreSQL) y configuración de redes internas para la comunicación entre servicios.




ver que hacer con postman, y si metemos una bd liviana para guardar 