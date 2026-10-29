/**
 * IpReputationView — validar una IP contra AbuseIPDB y VirusTotal.
 *
 * Sólo lectura: no bloquea nada por sí sola. Si una fuente no tiene clave,
 * se muestra "no configurada" y la otra sigue funcionando.
 * Reportar como maliciosa queda como "Próximamente" hasta tener credenciales.
 */

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, ExternalLink, Flag, Info, Loader2,
  Search, ShieldAlert, ShieldQuestion, ShieldX, Plus,
} from 'lucide-react';

import { blocklistApi, reputationApi } from '../../services/api';
import type { IpReputation, ReputationSource } from '../../types';

const VERDICT_META = {
  malicious: { label: 'Maliciosa', cls: 'is-bad', icon: ShieldX },
  suspicious: { label: 'Sospechosa', cls: 'is-warn', icon: ShieldAlert },
  clean: { label: 'Sin reportes', cls: 'is-ok', icon: CheckCircle2 },
  unknown: { label: 'Sin datos', cls: 'is-unknown', icon: ShieldQuestion },
} as const;

function fmtDate(ts?: string | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-AR');
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rep-row">
      <span>{label}</span>
      <b>{value ?? '—'}</b>
    </div>
  );
}

function SourceCard({
  title,
  link,
  data,
  children,
}: {
  title: string;
  link: string;
  data: ReputationSource;
  children: React.ReactNode;
}) {
  return (
    <div className="rep-card">
      <div className="rep-card__head">
        <h2>{title}</h2>
        <a href={link} target="_blank" rel="noreferrer" className="rep-link">
          Ver <ExternalLink size={12} />
        </a>
      </div>

      {!data.configured && (
        <p className="rep-muted">
          <Info size={13} /> No configurada — falta la API key en el <code>.env</code>.
        </p>
      )}
      {data.configured && !data.ok && (
        <p className="rep-error"><AlertTriangle size={13} /> {data.error}</p>
      )}
      {data.ok && children}
    </div>
  );
}

export function IpReputationView() {
  const [ip, setIp] = useState('');
  const [query, setQuery] = useState('');
  const [added, setAdded] = useState('');
  const [reportIp, setReportIp] = useState('');
  const [cats, setCats] = useState<number[]>([]);
  const [reportComment, setReportComment] = useState('');
  const [incidentAt, setIncidentAt] = useState('');
  const [reportMsg, setReportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const { data: caps } = useQuery({
    queryKey: ['reputation-caps'],
    queryFn: () => reputationApi.capabilities(),
  });

  const { data, isFetching, error } = useQuery({
    queryKey: ['reputation', query],
    queryFn: () => reputationApi.lookup(query),
    enabled: query.length > 0,
    retry: false,
  });

  const addMut = useMutation({
    mutationFn: (payload: { ip: string; comment: string }) =>
      blocklistApi.add(payload.ip, payload.comment, '24h'),
    onSuccess: (_d, v) => setAdded(v.ip),
    onError: (e: Error) => setAdded(`error: ${e.message}`),
  });

  const reportMut = useMutation({
    mutationFn: (payload: { ip: string; categories: number[]; comment: string; timestamp?: string | null }) =>
      reputationApi.report(payload.ip, {
        categories: payload.categories,
        comment: payload.comment,
        timestamp: payload.timestamp,
      }),
    onSuccess: (r) => {
      const d = r.data as { abuse_confidence_score?: number } | null;
      setReportMsg({
        ok: true,
        text: `Reporte enviado a AbuseIPDB${d?.abuse_confidence_score != null ? ` · score actual ${d.abuse_confidence_score}%` : ''}.`,
      });
      setCats([]);
      setReportComment('');
    },
    onError: (e: Error) => setReportMsg({ ok: false, text: e.message }),
  });

  const result: IpReputation | undefined = data?.data ?? undefined;
  const meta = result ? VERDICT_META[result.verdict] ?? VERDICT_META.unknown : null;
  const VerdictIcon = meta?.icon ?? ShieldQuestion;
  const report = caps?.data?.report;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = ip.trim();
    if (!value) return;
    setAdded('');
    setReportIp(value);
    setReportMsg(null);
    setQuery(value);
  };

  return (
    <div className="rep-page">
      <header className="rep-head">
        <div>
          <h1 className="rep-title"><ShieldQuestion size={20} /> Reputación IP</h1>
          <p className="rep-sub">
            Consultá una IP en AbuseIPDB y VirusTotal antes de bloquearla. Es sólo lectura:
            no se envía nada al MikroTik desde acá.
          </p>
        </div>
      </header>

      <form className="rep-search" onSubmit={submit}>
        <input
          className="input"
          placeholder="185.220.101.44 o 2001:db8::1"
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          spellCheck={false}
        />
        <button className="btn btn-primary" type="submit" disabled={!ip.trim() || isFetching}>
          {isFetching ? <Loader2 size={14} className="rep-spin" /> : <Search size={14} />}
          Validar
        </button>
      </form>

      {error && (
        <div className="rep-alert is-bad">
          <AlertTriangle size={14} /> {(error as Error).message}
        </div>
      )}

      {isFetching && !result && (
        <div className="rep-loading"><Loader2 size={16} className="rep-spin" /> Consultando fuentes…</div>
      )}

      {result && meta && (
        <>
          <div className={`rep-verdict ${meta.cls}`}>
            <VerdictIcon size={22} />
            <div>
              <b>{meta.label}</b>
              <span className="rep-verdict__ip">{result.ip}</span>
            </div>
            <div className="rep-verdict__actions">
              {result.is_private && <span className="rep-chip">IP privada — poco útil afuera</span>}
              {result.cached && <span className="rep-chip">cache</span>}
              <span className="rep-chip">{fmtDate(result.checked_at)}</span>
              <button
                type="button"
                className="btn btn-ghost rep-add"
                disabled={addMut.isPending || added === result.ip}
                onClick={() =>
                  addMut.mutate({
                    ip: result.ip,
                    comment: `Reputación: ${meta.label.toLowerCase()} (24h)`,
                  })
                }
              >
                <Plus size={13} />
                {added === result.ip ? 'En la lista' : 'A la lista de bloqueo'}
              </button>
            </div>
          </div>

          {added.startsWith('error:') && (
            <div className="rep-alert is-bad"><AlertTriangle size={14} /> {added.slice(7)}</div>
          )}

          <div className="rep-grid">
            <SourceCard
              title="AbuseIPDB"
              link={`https://www.abuseipdb.com/check/${result.ip}`}
              data={result.sources.abuseipdb}
            >
              <div className="rep-score">
                <span>{result.sources.abuseipdb.abuse_confidence_score ?? 0}%</span>
                <small>confianza de abuso</small>
              </div>
              <Row label="Reportes" value={result.sources.abuseipdb.total_reports ?? 0} />
              <Row label="Usuarios distintos" value={result.sources.abuseipdb.num_distinct_users ?? 0} />
              <Row label="Último reporte" value={fmtDate(result.sources.abuseipdb.last_reported_at)} />
              <Row label="País" value={result.sources.abuseipdb.country_code} />
              <Row label="ISP" value={result.sources.abuseipdb.isp} />
              <Row label="Uso" value={result.sources.abuseipdb.usage_type} />
              <Row label="Tor" value={result.sources.abuseipdb.is_tor ? 'Sí' : 'No'} />
              <Row label="Whitelist" value={result.sources.abuseipdb.is_whitelisted ? 'Sí' : 'No'} />
            </SourceCard>

            <SourceCard
              title="VirusTotal"
              link={`https://www.virustotal.com/gui/ip-address/${result.ip}`}
              data={result.sources.virustotal}
            >
              <div className="rep-score">
                <span>{result.sources.virustotal.malicious ?? 0}</span>
                <small>
                  motores lo marcan malicioso
                  {typeof result.sources.virustotal.suspicious === 'number'
                    ? ` · ${result.sources.virustotal.suspicious} sospechoso/s`
                    : ''}
                </small>
              </div>
              <Row label="Reputación" value={result.sources.virustotal.reputation} />
              <Row label="ASN" value={result.sources.virustotal.asn} />
              <Row label="Proveedor" value={result.sources.virustotal.as_owner} />
              <Row label="Red" value={result.sources.virustotal.network} />
              <Row label="País" value={result.sources.virustotal.country} />
              <Row label="Último análisis" value={fmtDate(result.sources.virustotal.last_analysis_date)} />
            </SourceCard>
          </div>
        </>
      )}

      <div className="rep-card rep-report">
        <div className="rep-card__head">
          <h2><Flag size={14} /> Reportar IP como maliciosa</h2>
          <span className={`rep-badge ${report?.available ? 'is-on' : ''}`}>
            {report?.available ? 'Disponible' : 'Falta API key'}
          </span>
        </div>

        {!report?.available && (
          <p className="rep-muted" style={{ marginBottom: '.75rem' }}>
            <Info size={13} />{' '}
            {report?.reason ?? 'Falta ABUSEIPDB_API_KEY en el .env.'}
          </p>
        )}

        <div className="rep-form">
          <label className="rep-field">
            <span>IP a reportar</span>
            <input
              className="input"
              placeholder="185.220.101.44"
              value={reportIp}
              onChange={(e) => setReportIp(e.target.value)}
              spellCheck={false}
            />
          </label>

          <label className="rep-field">
            <span>Fecha del incidente (opcional · últimas 24 h)</span>
            <input
              className="input"
              type="datetime-local"
              value={incidentAt}
              max={new Date().toISOString().slice(0, 16)}
              onChange={(e) => setIncidentAt(e.target.value)}
            />
          </label>
        </div>

        <div className="rep-field">
          <span>Categorías * ({cats.length} seleccionadas)</span>
          <div className="rep-cats">
            {(report?.categories ?? []).map((c) => {
              const on = cats.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`rep-cat ${on ? 'is-on' : ''}`}
                  onClick={() => setCats((prev) => (on ? prev.filter((x) => x !== c.id) : [...prev, c.id]))}
                  title={c.group}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <label className="rep-field">
          <span>
            Comentario * ({reportComment.trim().length}/{report?.limits?.min_comment ?? 32} mínimo)
          </span>
          <textarea
            className="input"
            rows={3}
            style={{ minHeight: 78, resize: 'vertical' }}
            placeholder="Qué se observó: escaneo de puertos, intentos de SSH, user-agent, ventana horaria…"
            value={reportComment}
            onChange={(e) => setReportComment(e.target.value)}
            maxLength={1024}
          />
        </label>

        <div className="rep-report__actions">
          <button
            className="btn btn-danger"
            disabled={
              !report?.available ||
              reportMut.isPending ||
              !reportIp.trim() ||
              cats.length === 0 ||
              reportComment.trim().length < (report?.limits?.min_comment ?? 32)
            }
            title={report?.available ? 'Enviar el reporte a AbuseIPDB' : 'Requiere ABUSEIPDB_API_KEY'}
            onClick={() =>
              reportMut.mutate({
                ip: reportIp.trim(),
                categories: cats,
                comment: reportComment.trim(),
                timestamp: incidentAt ? new Date(incidentAt).toISOString() : null,
              })
            }
          >
            {reportMut.isPending ? <Loader2 size={13} className="rep-spin" /> : <Flag size={13} />}
            Reportar en AbuseIPDB
          </button>

          {reportMsg && (
            <span className={reportMsg.ok ? 'rep-msg is-ok' : 'rep-msg is-bad'}>
              {reportMsg.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
              {reportMsg.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default IpReputationView;
