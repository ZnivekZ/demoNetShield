/**
 * NSMPage.tsx — Vista de Network Security Monitoring (NSM).
 * Flujos de red, DNS, HTTP y TLS capturados por Suricata en modo forense.
 *
 * Layout:
 *   ┌─ Tabs: Flujos │ DNS │ HTTP │ TLS ──────────────────────────────────────┐
 *   ├─ Stats row (top protocolos + IPs + puertos) ──────────────────────────┤
 *   └─ Tabla de datos según tab activo ─────────────────────────────────────┘
 */
import { useState } from 'react';
import { Eye, Globe, Lock, FileCode, ArrowLeftRight, AlertTriangle } from 'lucide-react';
import { useSuricataFlows } from '../../hooks/useSuricataFlows';
import type { NetworkFlow, DnsQuery, HttpTransaction, TlsHandshake } from '../../types';

// ── Tab types ─────────────────────────────────────────────────────────────────

type TabId = 'flows' | 'dns' | 'http' | 'tls';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'flows', label: 'Flujos', icon: ArrowLeftRight },
  { id: 'dns', label: 'DNS', icon: Globe },
  { id: 'http', label: 'HTTP', icon: FileCode },
  { id: 'tls', label: 'TLS', icon: Lock },
];

// ── Suspicious badge ──────────────────────────────────────────────────────────

function SuspBadge({ suspicious }: { suspicious: boolean }) {
  if (!suspicious) return null;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-red-500/15 text-red-400">
      <AlertTriangle className="w-3 h-3" />
      Sospechoso
    </span>
  );
}

// ── Flow Table ────────────────────────────────────────────────────────────────

function FlowsTable({ flows, isLoading }: { flows: NetworkFlow[]; isLoading: boolean }) {
  if (isLoading) return <TableSkeleton rows={8} cols={8} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-surface-800/50 bg-surface-900/50">
            {['Hora', 'Proto', 'App Proto', 'Src IP', 'Dst IP:Port', 'Estado', 'Bytes ↑', 'Bytes ↓', 'Alerta'].map(h => (
              <th key={h} className="px-3 py-2.5 text-xs text-surface-400 font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {flows.length === 0 ? (
            <tr><td colSpan={9} className="px-4 py-8 text-center text-surface-500 text-sm">Sin flujos</td></tr>
          ) : flows.map(f => (
            <tr key={f.id} className="border-b border-surface-800/30 hover:bg-surface-800/15 transition-colors">
              <td className="px-3 py-2 text-xs text-surface-400 font-mono">{new Date(f.timestamp).toLocaleTimeString()}</td>
              <td className="px-3 py-2 text-xs text-surface-300">{f.protocol}</td>
              <td className="px-3 py-2 text-xs text-violet-300">{f.app_proto ?? '—'}</td>
              <td className="px-3 py-2 text-xs text-surface-300 font-mono">{f.src_ip}</td>
              <td className="px-3 py-2 text-xs text-surface-300 font-mono">{f.dst_ip}:{f.dst_port}</td>
              <td className="px-3 py-2">
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                  f.state === 'established' ? 'bg-emerald-500/10 text-emerald-400' :
                  f.state === 'new' ? 'bg-blue-500/10 text-blue-400' :
                  'bg-surface-700 text-surface-400'
                }`}>{f.state}</span>
              </td>
              <td className="px-3 py-2 text-xs text-surface-400">{fmtBytes(f.bytes_toserver)}</td>
              <td className="px-3 py-2 text-xs text-surface-400">{fmtBytes(f.bytes_toclient)}</td>
              <td className="px-3 py-2">
                {f.has_alert && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── DNS Table ────────────────────────────────────────────────────────────────

function DnsTable({ queries, isLoading }: { queries: DnsQuery[]; isLoading: boolean }) {
  const [suspOnly, setSuspOnly] = useState(false);
  const displayed = suspOnly ? queries.filter(q => q.is_suspicious) : queries;

  if (isLoading) return <TableSkeleton rows={8} cols={6} />;
  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-surface-800/30">
        <label className="flex items-center gap-1.5 text-xs text-surface-400 cursor-pointer">
          <input type="checkbox" checked={suspOnly} onChange={e => setSuspOnly(e.target.checked)} className="w-3 h-3" />
          Solo sospechosos
        </label>
        <span className="text-xs text-surface-500 ml-auto">{displayed.length} resultados</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-surface-800/50 bg-surface-900/50">
              {['Hora', 'Src IP', 'Query', 'Tipo', 'Respuesta', 'Estado'].map(h => (
                <th key={h} className="px-3 py-2.5 text-xs text-surface-400 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-surface-500 text-sm">Sin consultas DNS</td></tr>
            ) : displayed.map(q => (
              <tr key={q.id} className={`border-b border-surface-800/30 hover:bg-surface-800/15 transition-colors ${q.is_suspicious ? 'bg-red-500/5' : ''}`}>
                <td className="px-3 py-2 text-xs text-surface-400 font-mono">{new Date(q.timestamp).toLocaleTimeString()}</td>
                <td className="px-3 py-2 text-xs text-surface-300 font-mono">{q.src_ip}</td>
                <td className="px-3 py-2 text-xs text-surface-200 font-mono max-w-[200px] truncate">{q.query}</td>
                <td className="px-3 py-2 text-xs text-violet-300">{q.type}</td>
                <td className="px-3 py-2 text-xs text-surface-400 max-w-[120px] truncate">{q.response}</td>
                <td className="px-3 py-2"><SuspBadge suspicious={q.is_suspicious} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── HTTP Table ───────────────────────────────────────────────────────────────

function HttpTable({ transactions, isLoading }: { transactions: HttpTransaction[]; isLoading: boolean }) {
  if (isLoading) return <TableSkeleton rows={8} cols={7} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-surface-800/50 bg-surface-900/50">
            {['Hora', 'Src IP', 'Host', 'URL', 'Método', 'Status', 'Bytes', 'Estado'].map(h => (
              <th key={h} className="px-3 py-2.5 text-xs text-surface-400 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {transactions.length === 0 ? (
            <tr><td colSpan={8} className="px-4 py-8 text-center text-surface-500 text-sm">Sin transacciones HTTP</td></tr>
          ) : transactions.map(tx => (
            <tr key={tx.id} className={`border-b border-surface-800/30 hover:bg-surface-800/15 transition-colors ${tx.is_suspicious ? 'bg-red-500/5' : ''}`}>
              <td className="px-3 py-2 text-xs text-surface-400 font-mono">{new Date(tx.timestamp).toLocaleTimeString()}</td>
              <td className="px-3 py-2 text-xs text-surface-300 font-mono">{tx.src_ip}</td>
              <td className="px-3 py-2 text-xs text-surface-300 font-mono max-w-[100px] truncate">{tx.hostname}</td>
              <td className="px-3 py-2 text-xs text-surface-400 max-w-[160px] truncate">{tx.url}</td>
              <td className="px-3 py-2">
                <span className="text-xs font-mono font-bold text-blue-400">{tx.method}</span>
              </td>
              <td className="px-3 py-2">
                <span className={`text-xs font-mono font-bold ${tx.status >= 400 ? 'text-red-400' : tx.status >= 300 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {tx.status}
                </span>
              </td>
              <td className="px-3 py-2 text-xs text-surface-400">{fmtBytes(tx.response_bytes)}</td>
              <td className="px-3 py-2"><SuspBadge suspicious={tx.is_suspicious} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── TLS Table ────────────────────────────────────────────────────────────────

function TlsTable({ handshakes, isLoading }: { handshakes: TlsHandshake[]; isLoading: boolean }) {
  if (isLoading) return <TableSkeleton rows={8} cols={7} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-surface-800/50 bg-surface-900/50">
            {['Hora', 'Src IP', 'Dst IP', 'SNI', 'Versión', 'JA3', 'Estado'].map(h => (
              <th key={h} className="px-3 py-2.5 text-xs text-surface-400 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {handshakes.length === 0 ? (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-surface-500 text-sm">Sin handshakes TLS</td></tr>
          ) : handshakes.map(h => (
            <tr key={h.id} className={`border-b border-surface-800/30 hover:bg-surface-800/15 transition-colors ${h.is_suspicious ? 'bg-red-500/5' : ''}`}>
              <td className="px-3 py-2 text-xs text-surface-400 font-mono">{new Date(h.timestamp).toLocaleTimeString()}</td>
              <td className="px-3 py-2 text-xs text-surface-300 font-mono">{h.src_ip}</td>
              <td className="px-3 py-2 text-xs text-surface-300 font-mono">{h.dst_ip}:{h.dst_port}</td>
              <td className="px-3 py-2 text-xs text-surface-200 font-mono max-w-[160px] truncate">{h.sni ?? '—'}</td>
              <td className="px-3 py-2 text-xs text-surface-400">{h.version}</td>
              <td className="px-3 py-2 text-xs text-surface-500 font-mono max-w-[100px] truncate" title={h.ja3 ?? undefined}>{h.ja3?.slice(0, 12) ?? '—'}…</td>
              <td className="px-3 py-2"><SuspBadge suspicious={h.is_suspicious} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="p-4 space-y-2">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="flex gap-3">
          {[...Array(cols)].map((_, j) => (
            <div key={j} className="h-5 bg-surface-800/50 rounded animate-pulse flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)}KB`;
  return `${bytes}B`;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function SuricataNSMPage() {
  const [activeTab, setActiveTab] = useState<TabId>('flows');
  const { flows, flowsStats, dns, http, tls, isLoading, isDnsLoading, isHttpLoading, isTlsLoading } = useSuricataFlows();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Eye className="w-5 h-5 text-violet-400" />
          <h1 className="text-2xl font-bold text-surface-100">Red NSM</h1>
        </div>
        <p className="text-sm text-surface-400">Flujos y metadatos de red capturados por Suricata para análisis forense</p>
      </div>

      {/* Stats row */}
      {flowsStats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card p-4">
            <p className="text-xs text-surface-400 mb-1">Flujos totales</p>
            <p className="text-xl font-bold text-surface-100">{flowsStats.total_flows.toLocaleString()}</p>
            <p className="text-xs text-surface-500 mt-0.5">{flowsStats.active_flows} activos</p>
          </div>
          {flowsStats.top_protocols.slice(0, 3).map(p => (
            <div key={p.proto} className="glass-card p-4">
              <p className="text-xs text-surface-400 mb-1">{p.proto}</p>
              <p className="text-xl font-bold text-surface-100">{p.count.toLocaleString()}</p>
              <p className="text-xs text-surface-500 mt-0.5">{fmtBytes(p.bytes)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="glass-card overflow-hidden">
        <div className="flex border-b border-surface-800/50 bg-surface-900/30">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-violet-500 text-violet-300 bg-violet-500/5'
                    : 'border-transparent text-surface-400 hover:text-surface-200 hover:bg-surface-800/30'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div>
          {activeTab === 'flows' && <FlowsTable flows={flows} isLoading={isLoading} />}
          {activeTab === 'dns' && <DnsTable queries={dns} isLoading={isDnsLoading} />}
          {activeTab === 'http' && <HttpTable transactions={http} isLoading={isHttpLoading} />}
          {activeTab === 'tls' && <TlsTable handshakes={tls} isLoading={isTlsLoading} />}
        </div>
      </div>
    </div>
  );
}
