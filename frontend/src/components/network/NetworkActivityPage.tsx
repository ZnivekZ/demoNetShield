import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, RefreshCw, Search } from 'lucide-react';
import { networkActivityApi } from '../../services/api';
import type { ActivityAccess, ActivityDirection, ActivityIdentity, ActivityPage, ActivityParticipant } from '../../types';

const SOURCE: Record<ActivityIdentity['source'], string> = {
  glpi_ip: 'GLPI · IP', glpi_mac: 'GLPI · MAC', dhcp: 'DHCP', ip: 'Sin identificar',
};
const DIRECTIONS: { id: ActivityDirection; label: string }[] = [
  { id: 'outbound', label: 'Hacia Internet' },
  { id: 'inbound', label: 'Desde Internet' },
  { id: 'internal', label: 'Entre IPs internas' },
];

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

function Identity({ value, ip }: { value: ActivityIdentity | null; ip: string }) {
  if (!value || value.source === 'ip') return <span className="text-surface-500">{ip}</span>;
  return <span className="inline-flex flex-col">
    <span className="text-surface-100">{value.label}</span>
    <span className="text-[11px] text-surface-500">{SOURCE[value.source]}</span>
  </span>;
}

function ReverseName({ ip }: { ip: string }) {
  const [requested, setRequested] = useState(false);
  const query = useQuery({
    queryKey: ['network-activity', 'ptr', ip],
    queryFn: () => networkActivityApi.reverseDns(ip),
    enabled: requested,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  if (!requested) return <button className="text-[11px] text-brand-400 hover:underline" onClick={() => setRequested(true)}>Buscar PTR</button>;
  if (query.isLoading) return <span className="text-[11px] text-surface-500">Buscando…</span>;
  if (query.isError) return <span className="text-[11px] text-surface-500">Sin PTR disponible</span>;
  return <span className="text-[11px] text-surface-400" title="Nombre inverso orientativo; no confirma el sitio visitado">{query.data?.data?.name || 'Sin PTR'}</span>;
}

function PageControls({ total, offset, limit, onChange }: { total: number; offset: number; limit: number; onChange: (value: number) => void }) {
  if (total <= limit) return null;
  return <div className="flex items-center justify-end gap-3 pt-3 text-xs text-surface-400">
    <button className="rounded-lg border border-surface-700 px-3 py-1 disabled:opacity-40" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>Anterior</button>
    <span>{offset + 1}–{Math.min(offset + limit, total)} de {total}</span>
    <button className="rounded-lg border border-surface-700 px-3 py-1 disabled:opacity-40" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>Siguiente</button>
  </div>;
}

function ScopeNote({ cidr }: { cidr: string }) {
  return <p className="text-xs text-surface-500">Red considerada interna: <strong className="text-surface-300">{cidr}</strong>. Si hay otras VLAN, VPN o IPv6, deben añadirse al alcance para completar la vista.</p>;
}

function Participants() {
  const [all, setAll] = useState(false);
  const [ip, setIp] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = all ? 25 : 10;
  const query = useQuery({
    queryKey: ['network-activity', 'participants', ip, offset, limit],
    queryFn: () => networkActivityApi.participants({ ip, offset, limit }),
    refetchInterval: 20_000,
  });
  const page = query.data?.data as ActivityPage<ActivityParticipant> | null | undefined;
  return <section className="glass-card p-4 sm:p-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-surface-100">Quién consume</h2>
        <p className="text-xs text-surface-500">{all ? 'Todas las IPs observadas' : 'Top 10'} por bytes acumulados en conexiones que siguen activas</p>
        {page && <p className="text-[11px] text-surface-500">Captura: {new Date(page.observed_at).toLocaleString('es-AR')}</p>}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-surface-500" />
          <input aria-label="Filtrar equipos por IP" className="input pl-8 w-36 sm:w-44" placeholder="Filtrar IP" value={ip} onChange={e => { setIp(e.target.value.trim()); setOffset(0); }} />
        </div>
        <button className="rounded-lg border border-surface-700 px-3 py-2 text-xs text-surface-200 hover:bg-surface-800" onClick={() => { setAll(!all); setOffset(0); }}>{all ? 'Top 10' : 'Ver todas'}</button>
      </div>
    </div>
    {query.isError && <p className="text-sm text-red-300">No se pudo consultar MikroTik. {String(query.error)}</p>}
    {query.isLoading && <p className="text-sm text-surface-400">Cargando actividad…</p>}
    {page && <>
      <div className="overflow-x-auto"><table className="data-table w-full">
        <thead><tr><th>IP interna</th><th>Equipo</th><th>MAC</th><th>Tráfico observado</th><th>Conexiones</th><th>Participación</th></tr></thead>
        <tbody>{page.items.map(row => <tr key={row.ip}>
          <td className="font-mono text-xs">{row.ip}</td>
          <td><Identity value={row.identity} ip={row.ip} /></td>
          <td className="text-xs font-mono text-surface-400">{row.identity.mac || '—'}{row.identity.mac_kind === 'local_o_aleatoria' && <span className="block text-amber-300 font-sans">MAC local o aleatoria</span>}</td>
          <td className="font-medium">{bytes(row.bytes)}</td><td>{row.connections}</td><td>{row.percent.toFixed(1)} %</td>
        </tr>)}</tbody>
      </table>{page.items.length === 0 && <p className="py-6 text-center text-sm text-surface-500">No hay IPs que coincidan en la actividad actual.</p>}</div>
      {all && <PageControls total={page.total} offset={offset} limit={limit} onChange={setOffset} />}
      <ScopeNote cidr={page.cidr} />
      <p className="text-xs text-amber-200/80">Estimación: se omiten conexiones ya cerradas; el tráfico entre dos IPs internas se atribuye a ambas. El porcentaje usa la suma atribuida a todos los equipos observados. Para historial más completo: Traffic Flow/IPFIX y verificar tráfico procesado por hardware.</p>
      <p className="text-xs text-surface-500">La MAC ayuda a comparar DHCP, ARP y GLPI, pero no confirma tipo ni modelo. Una base OUI puede sugerir fabricante; el inventario GLPI actualizado permite identificar el equipo.</p>
      {page.sources && (!page.sources.arp || !page.sources.dhcp) && <p className="text-xs text-amber-200/80">Identificación incompleta: no se pudo leer {[!page.sources.arp ? 'ARP' : null, !page.sources.dhcp ? 'DHCP' : null].filter(Boolean).join(' y ')}. Revisar permisos de lectura y disponibilidad del MikroTik.</p>}
      {!page.glpi_ip_available && <p className="text-xs text-amber-200/80">Sin mapa de IPs de GLPI disponible. Para cruces confiables: acceso a IP/MAC de GLPI (API clásica con App Token y User Token) e inventario actualizado. DHCP y MAC sirven como pistas.</p>}
    </>}
  </section>;
}

function AccessRow({ row, direction }: { row: ActivityAccess; direction: ActivityDirection }) {
  return <tr>
    <td className="font-mono text-xs">{row.source_ip}{row.source_identity && row.source_identity.source !== 'ip' && <span className="block font-sans text-surface-400">{row.source_identity.label}</span>}</td>
    <td className="font-mono text-xs">{row.destination_ip}:{row.destination_port || '—'}
      {direction === 'internal' && row.target_ip !== row.destination_ip && <span className="block text-surface-400">↳ {row.target_ip}:{row.target_port || '—'} (NAT)</span>}
      {direction === 'outbound' && <span className="block font-sans"><ReverseName ip={row.destination_ip} /></span>}
    </td>
    {direction === 'inbound' && <td className="font-mono text-xs">{row.target_ip}:{row.target_port || '—'}
      {row.target_identity && row.target_identity.source !== 'ip' && <span className="block font-sans text-surface-400">{row.target_identity.label}</span>}
      {row.target_source === 'nat_rule_inferred' && <span className="block font-sans text-amber-300">Destino inferido por NAT</span>}
    </td>}
    <td className="text-xs uppercase">{row.protocol || '—'}</td>
    <td>{row.connections}</td>
    <td className="text-xs">{row.responded} con respuesta · {row.without_reply} sin respuesta observada</td>
    <td>{bytes(row.bytes)}</td>
  </tr>;
}

function Accesses() {
  const [direction, setDirection] = useState<ActivityDirection>('outbound');
  const [all, setAll] = useState(false);
  const [ip, setIp] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = all ? 25 : 10;
  const query = useQuery({
    queryKey: ['network-activity', 'accesses', direction, ip, offset, limit],
    queryFn: () => networkActivityApi.accesses({ direction, ip, offset, limit }),
    refetchInterval: 20_000,
  });
  const page = query.data?.data as ActivityPage<ActivityAccess> | null | undefined;
  const note = direction === 'outbound'
    ? 'Destino IP observado. PTR es un nombre inverso orientativo, no el sitio visitado. Para dominio consultado: logs DNS con IP cliente y hora; para web solicitada: logs del proxy o servidor.'
    : direction === 'inbound'
      ? 'Solo conexiones rastreadas con destino interno identificable. «Sin respuesta» no significa bloqueo. Para bloqueos: logs de firewall; para distinguir webs y recuperar la IP cliente si hay un proxy/CDN: logs del proxy o servidor.'
      : 'Solo conexiones que atraviesan el MikroTik. Para ver tráfico dentro de una misma red conmutada localmente: logs de equipos o sensor en ese segmento.';
  return <section className="glass-card p-4 sm:p-5 space-y-4">
    <div><h2 className="text-base font-semibold text-surface-100">Accesos observados</h2><p className="text-xs text-surface-500">{all ? 'Todos los accesos' : 'Top 10'} por conexiones · agrupados por origen, destino, puerto y protocolo</p>
      {page && <p className="text-[11px] text-surface-500">Vistos en captura: {new Date(page.observed_at).toLocaleString('es-AR')}. No hay hora del último paquete por conexión.</p>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-1 rounded-xl bg-surface-900/50 p-1">
        {DIRECTIONS.map(tab => <button key={tab.id} className={`rounded-lg px-3 py-1.5 text-xs ${direction === tab.id ? 'bg-brand-600 text-white' : 'text-surface-400 hover:text-surface-100'}`} onClick={() => { setDirection(tab.id); setOffset(0); }}>{tab.label}</button>)}
      </div>
      <div className="flex gap-2">
        <input aria-label="Filtrar accesos por IP de origen o destino" className="input w-36 sm:w-44" placeholder="Filtrar IP" value={ip} onChange={e => { setIp(e.target.value.trim()); setOffset(0); }} />
        <button className="rounded-lg border border-surface-700 px-3 py-2 text-xs text-surface-200 hover:bg-surface-800" onClick={() => { setAll(!all); setOffset(0); }}>{all ? 'Top 10' : 'Ver todas'}</button>
      </div>
    </div>
    {query.isError && <p className="text-sm text-red-300">No se pudieron consultar los accesos. {String(query.error)}</p>}
    {query.isLoading && <p className="text-sm text-surface-400">Cargando accesos…</p>}
    {page && <>
      <div className="overflow-x-auto"><table className="data-table w-full">
        <thead><tr><th>Origen</th><th>Destino</th>{direction === 'inbound' && <th>Servidor interno</th>}<th>Protocolo</th><th>Conexiones</th><th>Respuesta</th><th>Tráfico</th></tr></thead>
        <tbody>{page.items.map(row => <AccessRow key={`${row.source_ip}-${row.destination_ip}-${row.destination_port}-${row.protocol}-${row.target_ip}`} row={row} direction={direction} />)}</tbody>
      </table>{page.items.length === 0 && <p className="py-6 text-center text-sm text-surface-500">No hay accesos observados con este filtro.</p>}</div>
      {all && <PageControls total={page.total} offset={offset} limit={limit} onChange={setOffset} />}
      <p className="text-xs text-amber-200/80">{note}</p>
      {direction === 'inbound' && page.sources?.nat === false && <p className="text-xs text-amber-200/80">No se pudieron leer las reglas NAT. Algunos destinos internos pueden faltar; revisar permisos de lectura de NAT en MikroTik.</p>}
    </>}
  </section>;
}

export default function NetworkActivityPage() {
  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-xl font-bold text-surface-100"><Activity className="h-5 w-5 text-brand-400" />Actividad de red</h1>
        <p className="mt-1 text-sm text-surface-400">Vista rápida de conexiones actuales. No representa historial ni confirma sitios visitados.</p></div>
      <span className="rounded-lg border border-surface-700 px-3 py-1.5 text-xs text-surface-300"><RefreshCw className="mr-1 inline h-3 w-3" />Actualiza cada 20 s</span>
    </header>
    <Participants />
    <Accesses />
  </div>;
}
