/**
 * BlocklistView — IPs a bloquear con revisión humana y push MANUAL.
 *
 * MikroTik es de sólo lectura: nada se aplica hasta que alguien revisa la
 * lista y presiona "Aplicar al router". El archivo también se exporta por
 * HTTP para que el propio router (o un script) haga pull.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  ClipboardCopy,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  ShieldBan,
  Trash2,
  Upload,
} from 'lucide-react';
import { blocklistApi } from '../../services/api';
import type { BlocklistEntry, BlocklistSettings } from '../../types';

const INTERVAL_PRESETS = [0, 1, 5, 15, 30, 60, 180, 720, 1440];

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Manual',
  firewall: 'Firewall',
  security: 'Seguridad',
  phishing: 'Phishing',
  wazuh: 'Wazuh',
};

const DURATION_LABELS: Record<string, string> = { m: 'min', h: 'h', d: 'días', w: 'sem' };

function fmtDuration(value?: string | null): string {
  if (!value) return 'permanente';
  const m = /^(\d+)([mhdw])$/.exec(value.trim());
  if (!m) return value;
  const n = Number(m[1]);
  const unit = DURATION_LABELS[m[2]] ?? m[2];
  return `${n} ${unit}`;
}

function fmt(ts?: string | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

export function BlocklistView() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['blocklist'],
    queryFn: () => blocklistApi.list(),
    refetchInterval: 30_000,
  });

  const entries = data?.data?.entries ?? [];
  const settings = data?.data?.settings;
  const lastPush = data?.data?.last_push;
  const active = data?.data?.active ?? 0;


  const [ip, setIp] = useState('');
  const [comment, setComment] = useState('');
  const [durAmount, setDurAmount] = useState('24');
  const [durUnit, setDurUnit] = useState<'m' | 'h' | 'd' | 'w' | 'perm'>('h');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState('');
  const [intervalInput, setIntervalInput] = useState('');
  const [permOn, setPermOn] = useState(false);

  const canPush = permOn;
  useEffect(() => {
    const v = String(settings?.push_interval_minutes ?? 0);
    setIntervalInput(v);
  }, [settings?.push_interval_minutes]);

  // El server es la fuente de verdad; el estado local permite que el check
  // responda al instante (antes rebotaba si el GET venía cacheado).
  useEffect(() => {
    const server = data?.data?.api_write_enabled ?? data?.data?.settings?.api_write_enabled ?? false;
    setPermOn(Boolean(server));
  }, [data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['blocklist'] });

  const addMut = useMutation({
    mutationFn: () =>
      blocklistApi.add(
        ip.trim(),
        comment.trim(),
        durUnit === 'perm' ? '' : `${durAmount}${durUnit}`,
      ),
    onSuccess: (res) => {
      if (!res.success) {
        setError(res.error ?? 'No se pudo agregar');
        return;
      }
      setIp('');
      setComment('');
      setDurAmount('24');
      setDurUnit('h');
      setError('');
      invalidate();
    },
    onError: () => setError('No se pudo agregar la IP'),
  });

  const delMut = useMutation({
    mutationFn: (target: string) => blocklistApi.remove(target),
    onSuccess: invalidate,
  });

  const toggleMut = useMutation({
    mutationFn: (v: { ip: string; enabled: boolean }) => blocklistApi.toggle(v.ip, v.enabled),
    onSuccess: invalidate,
  });

  const pushMut = useMutation({
    mutationFn: () => blocklistApi.push(),
    onSuccess: (res) => {
      const d = res.data;
      setNotice(
        res.success && d?.ok
          ? `Aplicado: ${d.added} agregadas · ${d.removed} quitadas · ${d.total} en la lista`
          : `No se pudo aplicar: ${res.error ?? d?.error ?? 'error desconocido'}`,
      );
      invalidate();
      setTimeout(() => setNotice(''), 6000);
    },
    onError: () => setNotice('No se pudo aplicar la lista'),
  });

  const settingsMut = useMutation({
    mutationFn: (patch: Partial<BlocklistSettings>) => blocklistApi.saveSettings(patch),
    onSuccess: invalidate,
  });

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      /* clipboard bloqueado */
    }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="bl-page">
      <div className="bl-head">
        <div>
          <h1 className="bl-title">
            <ShieldBan size={22} /> Lista de bloqueo
          </h1>
          <p className="bl-sub">
            MikroTik es <b>sólo lectura</b>: las IPs se acumulan acá y se aplican al firewall
            únicamente con el push manual.
          </p>
        </div>
        <button
          className="btn btn-primary"
          disabled={pushMut.isPending || !canPush}
          onClick={() => pushMut.mutate()}
          title={
            canPush
              ? 'Escribe la lista en la address-list del router'
              : 'La API no tiene permisos de escritura: usá /blocklist.txt'
          }
        >
          {pushMut.isPending ? <Loader2 size={15} className="pt-spin" /> : <Upload size={15} />}
          {pushMut.isPending ? 'Aplicando…' : 'Aplicar al router'}
        </button>
      </div>

      <p className="bl-hint">
        Las IPs <b>se borran automáticamente del archivo a las 24 h</b> de cargadas.
      </p>

      {!canPush && (
        <div className="bl-alert bl-alert--warn">
          <AlertCircle size={15} />
          La cuenta de API no tiene permisos de escritura en el router: los bloqueos se aplican
          con el archivo <code>/blocklist.txt</code> (pull desde el MikroTik o un script).
        </div>
      )}

      {notice && (
        <div className={`bl-alert ${notice.startsWith('Aplicado') ? 'bl-alert--ok' : ''}`}>
          {notice.startsWith('Aplicado') ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {notice}
        </div>
      )}

      <div className="bl-stats">
        <div className="bl-stat"><span>{data?.data?.count ?? 0}</span><small>en la lista</small></div>
        <div className="bl-stat"><span>{active}</span><small>activas</small></div>
        <div className="bl-stat">
          <span>{lastPush ? fmt(lastPush.at) : '—'}</span>
          <small>último push {lastPush?.ok === false ? '(con error)' : ''}</small>
        </div>
        <div className="bl-stat">
          <span>{settings?.push_interval_minutes ? `${settings.push_interval_minutes} min` : 'Nunca'}</span>
          <small>push automático</small>
        </div>
      </div>

      {/* Alta manual */}
      <div className="bl-card">
        <h2 className="bl-card__title"><Plus size={15} /> Agregar IP manualmente</h2>
        <div className="bl-form">
          <input
            className="input"
            placeholder="203.0.113.10 o 10.0.0.0/24"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && ip.trim()) addMut.mutate(); }}
          />
          <input
            className="input"
            placeholder="Comentario (motivo, origen…)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={200}
          />
          <div className="bl-duration">
            <input
              className="input"
              type="number"
              min={1}
              max={999}
              value={durAmount}
              onChange={(e) => setDurAmount(e.target.value)}
              disabled={durUnit === 'perm'}
              placeholder="24"
              title="Cantidad"
            />
            <select
              className="input"
              value={durUnit}
              onChange={(e) => setDurUnit(e.target.value as 'm' | 'h' | 'd' | 'w' | 'perm')}
            >
              <option value="m">minutos</option>
              <option value="h">horas</option>
              <option value="d">días</option>
              <option value="w">semanas</option>
              <option value="perm">permanente</option>
            </select>
          </div>
          <button className="btn btn-primary" disabled={!ip.trim() || addMut.isPending} onClick={() => addMut.mutate()}>
            {addMut.isPending ? <Loader2 size={14} className="pt-spin" /> : <Plus size={14} />} Agregar
          </button>
        </div>
        {error && <div className="bl-alert"><AlertCircle size={14} /> {error}</div>}
      </div>

      {/* Tabla */}
      <div className="bl-card bl-card--flush">
        <div className="bl-card__title bl-card__title--bar">
          <span><Ban size={15} /> IPs en la lista</span>
          <button className="btn btn-ghost" onClick={() => invalidate()} title="Refrescar">
            <RefreshCw size={14} />
          </button>
        </div>

        {isLoading ? (
          <div className="bl-empty"><Loader2 size={16} className="pt-spin" /></div>
        ) : entries.length === 0 ? (
          <div className="bl-empty">
            La lista está vacía. Las IPs que bloquees desde Alertas, Firewall o Phishing se van a
            ir acumulando acá.
          </div>
        ) : (
          <table className="bl-table">
            <thead>
              <tr>
                <th>IP</th>
                <th>Comentario</th>
                <th>Origen</th>
                <th>Duración</th>
                <th>Agregada</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((e: BlocklistEntry) => (
                <tr key={e.ip} className={e.enabled ? '' : 'is-off'}>
                  <td className="bl-ip">{e.ip}</td>
                  <td className="bl-comment">{e.comment || '—'}</td>
                  <td><span className={`bl-chip bl-chip--${e.source}`}>{SOURCE_LABEL[e.source] ?? e.source}</span></td>
                  <td className="bl-date">{fmtDuration(e.duration)}</td>
                  <td className="bl-date">{fmt(e.added_at)}</td>
                  <td>
                    <label className="bl-switch" title={e.enabled ? 'Activa' : 'Deshabilitada'}>
                      <input
                        type="checkbox"
                        checked={e.enabled}
                        onChange={(ev) => toggleMut.mutate({ ip: e.ip, enabled: ev.target.checked })}
                      />
                      <span />
                    </label>
                  </td>
                  <td>
                    <button
                      className="bl-del"
                      title="Quitar de la lista"
                      onClick={() => delMut.mutate(e.ip)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Push + export */}
      <div className="bl-grid">
        <div className="bl-card">
          <h2 className="bl-card__title"><Upload size={15} /> Push hacia MikroTik</h2>

          <div className="bl-check" style={{ marginBottom: '.7rem' }}>
            <input
              id="bl-api-perms"
              type="checkbox"
              style={{ cursor: 'pointer', width: 15, height: 15, accentColor: '#6366f1' }}
              checked={canPush}
              onChange={(ev) => {
                const next = ev.target.checked;
                setPermOn(next);            // feedback inmediato
                settingsMut.mutate(
                  { api_write_enabled: next },
                  { onError: () => setPermOn(!next) },
                );
              }}
            />
            <label htmlFor="bl-api-perms" style={{ cursor: 'pointer' }}>
              <b>La API tiene permisos de escritura</b> en el router
            </label>
          </div>

          <div className={canPush ? '' : 'bl-disabled'}>
            <label className="bl-field">
              <span>Intervalo de push (minutos · 0 = nunca)</span>
              <div className="bl-inline">
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={43200}
                  value={intervalInput}
                  onChange={(ev) => setIntervalInput(ev.target.value)}
                  onBlur={() => {
                    const n = Number(intervalInput);
                    if (Number.isFinite(n) && n >= 0) settingsMut.mutate({ push_interval_minutes: Math.trunc(n) });
                  }}
                  disabled={!canPush}
                />
                <div className="bl-presets">
                  {INTERVAL_PRESETS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`bl-preset ${Number(intervalInput) === m ? 'is-active' : ''}`}
                      onClick={() => {
                        setIntervalInput(String(m));
                        settingsMut.mutate({ push_interval_minutes: m });
                      }}
                      disabled={!canPush}
                    >
                      {m === 0 ? 'Nunca' : m < 60 ? `${m}m` : m % 60 === 0 ? `${m / 60}h` : `${m}m`}
                    </button>
                  ))}
                </div>
              </div>
            </label>

            <label className="bl-field">
              <span>Nombre de la address-list</span>
              <input
                className="input"
                defaultValue={settings?.list_name ?? 'Blacklist_Automatica'}
                onBlur={(ev) => settingsMut.mutate({ list_name: ev.target.value })}
                disabled={!canPush}
              />
            </label>

            <label className="bl-check">
              <input
                type="checkbox"
                checked={settings?.remove_missing ?? false}
                onChange={(ev) => settingsMut.mutate({ remove_missing: ev.target.checked })}
                disabled={!canPush}
              />
              <span>Quitar del router las IPs que ya no estén en la lista</span>
            </label>
          </div>

          <p className="bl-hint">
            {canPush
              ? 'El push escribe la address-list en el MikroTik. En 0 (nunca) sólo se aplica con el botón “Aplicar al router”.'
              : 'Deshabilitado: la cuenta de API no tiene permisos de escritura en el MikroTik. Los bloqueos se aplican con el archivo /blocklist.txt.'}
          </p>
        </div>

        <div className="bl-card">
          <h2 className="bl-card__title"><Download size={15} /> Export para la LAN</h2>
          <p className="bl-hint">
            Sin autenticación, para que el MikroTik o un script hagan pull del archivo:
          </p>
          {[
            { key: 'txt', url: `${origin}/blocklist.txt`, label: 'IPs en texto plano' },
            { key: 'json', url: `${origin}/blocklist.json`, label: 'JSON completo' },
          ].map(({ key, url, label }) => (
            <div className="bl-url" key={key}>
              <div>
                <small>{label}</small>
                <code>{url}</code>
              </div>
              <button className="btn btn-ghost" onClick={() => copy(url, key)} title="Copiar URL">
                {copied === key ? <CheckCircle2 size={13} /> : <ClipboardCopy size={13} />}
              </button>
            </div>
          ))}
          <p className="bl-hint bl-hint--mono">
            /tool fetch url="{origin}/blocklist.txt" dst-path=blocklist.txt
          </p>
          <p className="bl-hint">Archivo local: <code>{data?.data?.path ?? '—'}</code></p>
        </div>
      </div>
    </div>
  );
}
