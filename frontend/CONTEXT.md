# Frontend — NetShield Dashboard

## Estructura de componentes

```
frontend/src/
├── main.tsx                           # Entry point, monta App en #root
├── App.tsx                            # QueryClientProvider + BrowserRouter + Routes
├── index.css                          # Design system completo (TailwindCSS v4 + clases custom)
├── types.ts                           # Tipos TypeScript (espejo de schemas Pydantic del backend)
│
├── services/
│   └── api.ts                         # Cliente Axios centralizado con todos los endpoints
│   │                                  # Módulos: mikrotikApi, wazuhApi, networkApi, reportsApi,
│   │                                  # actionsApi, healthApi, vlansApi, securityApi, phishingApi,
│   │                                  # cliApi, portalApi, glpiApi, systemApi (mock-status)
│
├── hooks/
│   └── useWebSocket.ts                # useWebSocket() y useTrafficStream() con reconexión
│
└── components/
    ├── Layout.tsx                      # Sidebar + top bar + Outlet (layout principal)
    │
    ├── common/
    │   ├── MockModeBadge.tsx           # ← Badge amarillo en topbar cuando hay servicios en mock
    │   ├── GlobalSearch.tsx            # Búsqueda global de IPs y hosts
    │   └── ConfirmModal.tsx            # Modal de confirmación genérico
    │
    ├── dashboard/
    │   ├── DashboardPage.tsx           # Página principal: stat cards + chart + tabla + feed
    │   ├── TrafficChart.tsx            # Recharts AreaChart con datos de WebSocket en vivo
    │   ├── ConnectionsTable.tsx        # Tabla filtrable de conexiones activas
    │   └── AlertsFeed.tsx             # Feed scrollable de alertas con badges de severidad
    │
    ├── firewall/
    │   └── FirewallPage.tsx           # Bloqueo de IPs + tabla de reglas + historial de acciones
    │
    ├── network/
    │   └── NetworkPage.tsx            # Tabs: Tabla ARP / Etiquetas / Grupos (con CRUD)
    │
    └── reports/
        └── ReportsPage.tsx            # IA: prompt + config + editor TipTap + exportar PDF
```

---

## Descripción de cada componente

### `Layout.tsx`
Layout raíz de la aplicación. Contiene:
- **Sidebar izquierdo** (`sidebar` class): Logo NetShield, navegación con `NavLink` de React Router, indicadores de estado del sistema
- **Top bar**: Botón hamburguesa móvil, búsqueda global, indicadores de conexión MikroTik/Wazuh, **`<MockModeBadge />`** (badge amarillo cuando hay mocks activos), campána de notificaciones
- **`<Outlet />`**: Renderiza la página activa según la ruta

### `components/common/MockModeBadge.tsx`
Badge visual que aparece en el topbar cuando uno o más servicios están en modo mock. Comportamiento:
- Llama a `systemApi.getMockStatus()` via TanStack Query con `refetchInterval: 30_000`
- Si `any_mock_active = false`, no renderiza nada (componente invisible)
- Si `mock_all = true`, muestra **`MOCK ALL`** en amarillo
- Si solo algunos servicios están en mock, muestra **`MOCK: MIKROTIK · WAZUH`** etc.
- Tooltip con descripción del modo activo

### `DashboardPage.tsx`
4 stat cards animadas (`StatCard` componente interno) que muestran: agentes Wazuh activos, reglas de firewall, alertas 24h (con conteo de críticas), conexiones activas. Usa `useQuery` con `refetchInterval` para polling (agentes: 10s, alertas: 5s, reglas: 15s, conexiones: 5s).

### `TrafficChart.tsx`
Gráfico de áreas apiladas con Recharts. Consume datos de `useTrafficStream()` (hook de WebSocket). Muestra RX (línea sólida con gradiente) y TX (línea punteada) por interfaz. Incluye tooltip custom con formato de bytes (`B/s`, `KB/s`, `MB/s`). Historial configurable (default: 60 puntos).

### `ConnectionsTable.tsx`
Tabla con la clase CSS `data-table`. Dos filtros: input de texto (filtra por IP src/dst) y select de protocolo (generado dinámicamente desde los datos). Muestra máximo 50 filas. Columnas: origen:puerto, destino:puerto, protocolo (badge), estado, bytes totales.

### `AlertsFeed.tsx`
Lista vertical scrollable de alertas. Cada alerta muestra: badge de severidad (4 niveles: crítico ≥12, alto ≥8, medio ≥4, bajo <4), descripción de la regla, nombre del agente, IP origen, tiempo relativo ("Hace 5m"). Máximo 20 alertas visibles.

### `FirewallPage.tsx`
Tres secciones:
1. **Formulario de bloqueo** (izquierda): IP + motivo + duración opcional → POST a `/api/mikrotik/firewall/block`
2. **Tabla de reglas** (derecha): Lista todas las reglas de firewall activas con buscador. Cada regla drop en chain=forward con src-address tiene botón de desbloqueo
3. **Historial** (abajo): Tabla de ActionLog filtrando acciones de tipo block/unblock

### `NetworkPage.tsx`
3 tabs:
- **Tabla ARP**: Muestra dispositivos descubiertos en la red con IP, MAC, interfaz, tipo (dinámico/estático), y etiqueta asignada
- **Etiquetas**: Formulario para crear etiqueta (IP + nombre + descripción + color) + lista de etiquetas existentes con botón borrar
- **Grupos**: Formulario para crear grupo (nombre + descripción + criterios JSON + color) + lista de grupos con sus miembros

### `ReportsPage.tsx`
Layout en dos columnas:
- **Columna izquierda** (configuración): textarea para prompt, selector de audiencia (3 radio buttons), checkboxes de fuentes de datos, selector de rango de fechas, botón de subir documentos, botón "Generar Borrador"
- **Columna derecha** (editor): Input de título, editor TipTap con toolbar completa (negrita, cursiva, subrayado, resaltado, H1, H2, listas, alineación, undo/redo), botón "Exportar PDF"

---

## Cómo funciona el WebSocket de tráfico en tiempo real

### Flujo completo

```
[Backend]                                [Frontend]
main.py /ws/traffic                      useWebSocket("/ws/traffic")
    │                                        │
    ├── accept() conexión                    ├── new WebSocket(wsUrl)
    │                                        │
    ╔══ loop cada 2s ══╗                     │
    ║ get_traffic()    ║                     │
    ║ get_connections()║                     │
    ║ send_json({      ║──── JSON ──────────→├── onmessage → setLastMessage()
    ║   type: "traffic"║                     │
    ║   data: {...}    ║                     useTrafficStream(maxHistory)
    ║ })               ║                     │
    ╚══════════════════╝                     ├── trafficHistory.push(data)
                                             ├── trafficHistory.slice(-60)
                                             │
                                             TrafficChart.tsx
                                             ├── chartData = trafficHistory.map(...)
                                             └── <AreaChart data={chartData} />
```

### Hook `useWebSocket(url)`
- Abre conexión WebSocket usando el protocolo y host del navegador
- Maneja reconexión automática con backoff exponencial: `delay = min(1000 * 2^intentos, 30000ms)`
- Expone: `{ isConnected: boolean, lastMessage: WSMessage | null }`

### Hook `useTrafficStream(maxHistory)`
- Usa `useWebSocket("/ws/traffic")` internamente
- Mantiene un array circular de los últimos `maxHistory` puntos de datos (default: 30)
- Cada punto contiene: `{ timestamp, traffic: TrafficData[] }`
- Expone: `{ isConnected, trafficHistory, activeConnections }`

### Proxy de Vite
En `vite.config.ts`, las rutas `/ws/*` se redirigen a `ws://localhost:8000` automáticamente. El frontend no necesita conocer la URL del backend.

---

## Cómo agregar un nuevo panel/página

### 1. Crear el componente
```tsx
// src/components/mi-panel/MiPanelPage.tsx
import { useQuery } from '@tanstack/react-query';
import { miApi } from '../../services/api';

export default function MiPanelPage() {
  const { data } = useQuery({
    queryKey: ['mi-dato'],
    queryFn: miApi.getDatos,
    refetchInterval: 10000, // polling cada 10s (opcional)
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-surface-100">Mi Panel</h1>
        <p className="text-sm text-surface-500 mt-0.5">Descripción</p>
      </div>
      <div className="glass-card p-5">
        {/* contenido */}
      </div>
    </div>
  );
}
```

### 2. Agregar la ruta en `App.tsx`
```tsx
import MiPanelPage from './components/mi-panel/MiPanelPage';

// Dentro de <Route element={<Layout />}>:
<Route path="/mi-panel" element={<MiPanelPage />} />
```

### 3. Agregar el link en la sidebar (`Layout.tsx`)
```tsx
import { MiIcono } from 'lucide-react';

// En el array navItems:
{ to: '/mi-panel', icon: MiIcono, label: 'Mi Panel' },
```

---

## Cómo conectar un nuevo endpoint del backend

### 1. Agregar el tipo en `types.ts`
```typescript
export interface MiDato {
  id: string;
  nombre: string;
  valor: number;
}
```

### 2. Agregar la función en `services/api.ts`
```typescript
export const miApi = {
  getDatos: () =>
    api.get<APIResponse<MiDato[]>>('/mi-dominio/datos').then(r => r.data),

  crearDato: (nombre: string, valor: number) =>
    api.post<APIResponse<MiDato>>('/mi-dominio/datos', { nombre, valor }).then(r => r.data),
};
```

### 3. Consumir en el componente con React Query
```tsx
// Para lectura (GET):
const { data, isLoading } = useQuery({
  queryKey: ['mi-dato'],
  queryFn: miApi.getDatos,
});
const datos = data?.data ?? [];

// Para escritura (POST/PUT/DELETE):
const mutation = useMutation({
  mutationFn: () => miApi.crearDato('test', 42),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['mi-dato'] });
  },
});
```

---

## Convenciones de naming

### Archivos
| Tipo | Convención | Ejemplo |
|------|-----------|---------|
| Componentes React | PascalCase + `.tsx` | `DashboardPage.tsx`, `AlertsFeed.tsx` |
| Hooks | camelCase con prefijo `use` + `.ts` | `useWebSocket.ts` |
| Servicios | camelCase + `.ts` | `api.ts` |
| Tipos | camelCase + `.ts` | `types.ts` |
| CSS | kebab-case + `.css` | `index.css` |

### Componentes
- Un componente por archivo, export default
- Componentes internos (no exportados) pueden estar en el mismo archivo (ej: `StatCard` dentro de `DashboardPage`)
- Carpeta por dominio: `dashboard/`, `firewall/`, `network/`, `reports/`

### Hooks
- Prefijo `use` obligatorio
- Retornan objetos con propiedades descriptivas: `{ isConnected, trafficHistory, activeConnections }`
- Se ubican en `src/hooks/`

### React Query keys
- Array descriptivo: `['wazuh-agents']`, `['firewall-rules']`, `['wazuh-alerts']`
- Con parámetros: `['alerts-agent', agentId]`

### Clases CSS reutilizables
Definidas en `index.css`, no como componentes TailwindCSS:
- Layout: `glass-card`, `stat-card`, `sidebar`, `sidebar-link`
- Datos: `data-table`, `badge`, `badge-critical/high/medium/low/info/success/danger`
- Interacción: `btn`, `btn-primary/danger/ghost/success`, `input`
- Estado: `status-dot active/disconnected/pending`
- Animación: `animate-fade-in-up`, `stagger-1/2/3/4`, `loading-spinner`
- Editor: `tiptap-editor`, `tiptap-toolbar`

### Tokens de color (`@theme` en `index.css`)
- `brand-50` a `brand-900` — Indigo/violeta para elementos de marca
- `surface-50` a `surface-950` — Escala de grises slate para fondos y texto
- `severity-critical/high/medium/low/info` — Colores semánticos para alertas
- `success/warning/danger` — Colores de estado
