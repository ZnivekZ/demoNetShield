/**
 * PublicTicketPage — portal público de soporte (`/soporte`).
 *
 * Sin autenticación: el email es el identificador. Dos pestañas:
 *  - Cargar ticket: mismos campos que el form interno + adjunto.
 *  - Consultar estado: pide ID + email (el ID solo no alcanza).
 *
 * Al crear muestra el número de ticket, que es lo único que el usuario
 * tiene que guardar.
 */
import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Loader2,
  Paperclip,
  Search,
  Shield,
  Ticket,
  Upload,
  X,
} from 'lucide-react';
import {
  publicErrorMessage,
  publicTicketsApi,
  type PublicCategory,
  type PublicTicketStatus,
} from '../../services/publicApi';

type Tab = 'create' | 'status';

const CATEGORIES: { value: PublicCategory; label: string }[] = [
  { value: 'red', label: 'Red / Conectividad' },
  { value: 'hardware', label: 'Hardware' },
  { value: 'so', label: 'Sistema operativo / Software' },
  { value: 'seguridad', label: 'Seguridad' },
];

const PRIORITIES = [
  { value: 1, label: 'Muy baja' },
  { value: 2, label: 'Baja' },
  { value: 3, label: 'Media' },
  { value: 4, label: 'Alta' },
  { value: 5, label: 'Muy alta' },
];

const STATUS_COLORS: Record<number, string> = {
  1: '#60a5fa',
  2: '#818cf8',
  3: '#818cf8',
  4: '#f59e0b',
  5: '#22c55e',
  6: '#94a3b8',
};

const STEPS = [
  { n: '1', text: 'Completá tus datos y contanos qué pasa.' },
  { n: '2', text: 'Guardá el número de ticket que te damos.' },
  { n: '3', text: 'Seguí el estado con ese número y tu email.' },
];

const MAX_MB = 5;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function PublicTicketPage() {
  const [tab, setTab] = useState<Tab>('create');

  // ── Formulario de alta ──
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<PublicCategory | ''>('');
  const [priority, setPriority] = useState(3);
  const [equipment, setEquipment] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ id: number; email: string; attachment?: string; warning?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // ── Consulta de estado ──
  const [queryId, setQueryId] = useState('');
  const [queryEmail, setQueryEmail] = useState('');
  const [querying, setQuerying] = useState(false);
  const [queryError, setQueryError] = useState('');
  const [status, setStatus] = useState<PublicTicketStatus | null>(null);

  const handleFile = (selected: File | null) => {
    if (!selected) {
      setFile(null);
      return;
    }
    if (selected.size > MAX_MB * 1024 * 1024) {
      setError(`El archivo supera ${MAX_MB} MB`);
      return;
    }
    setError('');
    setFile(selected);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!EMAIL_RE.test(email.trim())) return setError('Ingresá un email válido.');
    if (title.trim().length < 3) return setError('El asunto debe tener al menos 3 caracteres.');
    if (description.trim().length < 10) return setError('La descripción debe tener al menos 10 caracteres.');

    setSubmitting(true);
    try {
      const res = await publicTicketsApi.create({
        email: email.trim().toLowerCase(),
        title: title.trim(),
        description: description.trim(),
        category: category || undefined,
        priority,
        equipment: equipment.trim() || undefined,
        website: honeypot,
      });
      const ticketId = res.data?.ticket_id;
      if (!ticketId) throw new Error('sin id');

      let attachment: string | undefined;
      let warning: string | undefined;
      if (file) {
        try {
          const up = await publicTicketsApi.attach(ticketId, email.trim().toLowerCase(), file);
          attachment = up.data?.attachment;
        } catch (err) {
          warning = `El ticket se creó, pero el adjunto no se pudo subir: ${publicErrorMessage(err)}`;
        }
      }

      setCreated({ id: ticketId, email: email.trim().toLowerCase(), attachment, warning });
      setTitle('');
      setDescription('');
      setCategory('');
      setPriority(3);
      setEquipment('');
      setFile(null);
    } catch (err) {
      setError(publicErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    setQueryError('');
    setStatus(null);

    const id = Number(queryId.trim());
    if (!Number.isInteger(id) || id <= 0) return setQueryError('Ingresá un número de ticket válido.');
    if (!EMAIL_RE.test(queryEmail.trim())) return setQueryError('Ingresá el email con el que creaste el ticket.');

    setQuerying(true);
    try {
      const res = await publicTicketsApi.status(id, queryEmail.trim().toLowerCase());
      if (!res.data) throw new Error('sin datos');
      setStatus(res.data);
    } catch (err) {
      setQueryError(publicErrorMessage(err));
    } finally {
      setQuerying(false);
    }
  };

  const copyId = async (id: number) => {
    try {
      await navigator.clipboard.writeText(String(id));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard bloqueado: el número queda visible igual */
    }
  };

  return (
    <div className="pt-shell">
      {/* Fondo ambiental */}
      <div className="pt-bg" aria-hidden="true">
        <span className="pt-orb pt-orb--1" />
        <span className="pt-orb pt-orb--2" />
        <span className="pt-orb pt-orb--3" />
        <span className="pt-grid" />
      </div>

      <div className="pt-wrap">
        {/* Columna informativa */}
        <aside className="pt-hero">
          <div className="pt-brand">
            <span className="pt-brand__mark"><Shield size={18} /></span>
            <span className="pt-brand__name">NetShield</span>
          </div>
          <h1 className="pt-title">
            Soporte técnico
            <span className="pt-title__org">Universidad Nacional de Mar del Plata</span>
          </h1>
          <p className="pt-sub">
            Reportá un problema con tu equipo y el área de redes lo revisa.
          </p>

          <ol className="pt-steps">
            {STEPS.map((s) => (
              <li key={s.n} className="pt-step">
                <span className="pt-step__n">{s.n}</span>
                <span className="pt-step__text">{s.text}</span>
              </li>
            ))}
          </ol>

        </aside>

        {/* Tarjeta */}
        <main className="pt-card">
          <div className="pt-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'create'}
              className={`pt-tab ${tab === 'create' ? 'is-active' : ''}`}
              onClick={() => setTab('create')}
            >
              <Ticket size={15} /> Cargar ticket
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'status'}
              className={`pt-tab ${tab === 'status' ? 'is-active' : ''}`}
              onClick={() => setTab('status')}
            >
              <Search size={15} /> Consultar estado
            </button>
          </div>

          {/* ── Alta ── */}
          {tab === 'create' && created && (
            <section className="pt-success">
              <CheckCircle2 size={38} className="pt-success__icon" />
              <p className="pt-success__label">Ticket creado</p>
              <p className="pt-success__id">#{created.id}</p>
              <p className="pt-success__hint">
                Guardá este número. Para consultar el estado vas a necesitar el número y tu email.
              </p>
              {created.attachment && (
                <p className="pt-success__file"><Paperclip size={13} /> {created.attachment}</p>
              )}
              {created.warning && (
                <div className="pt-alert pt-alert--warn"><AlertCircle size={15} /> {created.warning}</div>
              )}
              <div className="pt-success__actions">
                <button type="button" className="btn btn-secondary" onClick={() => copyId(created.id)}>
                  <Copy size={14} /> {copied ? 'Copiado' : 'Copiar número'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setQueryId(String(created.id));
                    setQueryEmail(created.email);
                    setStatus(null);
                    setQueryError('');
                    setTab('status');
                  }}
                >
                  <Search size={14} /> Consultar estado
                </button>
              </div>
              <button type="button" className="pt-link" onClick={() => setCreated(null)}>
                Cargar otro ticket
              </button>
            </section>
          )}

          {tab === 'create' && !created && (
            <form className="pt-form" onSubmit={handleSubmit} noValidate>
              <div className="pt-row">
                <label className="pt-field">
                  <span>Email <em>*</em></span>
                  <input
                    className="input"
                    type="email"
                    autoComplete="email"
                    placeholder="nombre@ejemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>
                <label className="pt-field">
                  <span>Equipo / ubicación</span>
                  <input
                    className="input"
                    type="text"
                    placeholder="PC-SALA3, Aula 12…"
                    value={equipment}
                    onChange={(e) => setEquipment(e.target.value)}
                    maxLength={120}
                  />
                </label>
              </div>

              <label className="pt-field">
                <span>Asunto <em>*</em></span>
                <input
                  className="input"
                  type="text"
                  placeholder="No navega ninguna página"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                  required
                />
              </label>

              <div className="pt-row">
                <label className="pt-field">
                  <span>Categoría</span>
                  <select className="input" value={category} onChange={(e) => setCategory(e.target.value as PublicCategory | '')}>
                    <option value="">Sin categoría</option>
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </label>
                <label className="pt-field">
                  <span>Prioridad</span>
                  <select className="input" value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
                    {PRIORITIES.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="pt-field">
                <span>Descripción <em>*</em></span>
                <textarea
                  className="input pt-textarea"
                  placeholder="Contanos qué pasa, desde cuándo y qué mensaje ves…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={4000}
                  rows={6}
                  required
                />
                <small className="pt-counter">{description.length}/4000</small>
              </label>

              <div
                className={`pt-file ${dragging ? 'is-dragging' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  handleFile(e.dataTransfer.files?.[0] ?? null);
                }}
              >
                <input
                  id="pt-file"
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf,.txt"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                />
                <label htmlFor="pt-file" className="pt-file__drop">
                  <Upload size={16} />
                  <span>{file ? file.name : `Adjuntar archivo (opcional, hasta ${MAX_MB} MB)`}</span>
                </label>
                {file && (
                  <button type="button" className="pt-file__clear" onClick={() => setFile(null)} aria-label="Quitar adjunto">
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Honeypot: invisible para personas */}
              <label className="pt-honeypot" aria-hidden="true">
                <span>No completar</span>
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </label>

              {error && <div className="pt-alert"><AlertCircle size={15} /> {error}</div>}

              <button type="submit" className="btn btn-primary pt-submit" disabled={submitting}>
                {submitting ? (<><Loader2 size={15} className="pt-spin" /> Enviando…</>) : 'Enviar ticket'}
              </button>
            </form>
          )}

          {/* ── Consulta ── */}
          {tab === 'status' && (
            <form className="pt-form" onSubmit={handleQuery} noValidate>
              <div className="pt-row">
                <label className="pt-field">
                  <span>Número de ticket <em>*</em></span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    placeholder="12"
                    value={queryId}
                    onChange={(e) => setQueryId(e.target.value)}
                    required
                  />
                </label>
                <label className="pt-field">
                  <span>Email <em>*</em></span>
                  <input
                    className="input"
                    type="email"
                    autoComplete="email"
                    placeholder="nombre@ejemplo.com"
                    value={queryEmail}
                    onChange={(e) => setQueryEmail(e.target.value)}
                    required
                  />
                </label>
              </div>

              {queryError && <div className="pt-alert"><AlertCircle size={15} /> {queryError}</div>}

              <button type="submit" className="btn btn-primary pt-submit" disabled={querying}>
                {querying ? (<><Loader2 size={15} className="pt-spin" /> Buscando…</>) : 'Consultar'}
              </button>

              {status && (
                <section className="pt-status">
                  <div className="pt-status__head">
                    <span className="pt-status__id">#{status.ticket_id}</span>
                    <span
                      className="pt-status__badge"
                      style={{
                        color: STATUS_COLORS[status.status] ?? '#94a3b8',
                        borderColor: `${STATUS_COLORS[status.status] ?? '#94a3b8'}55`,
                        background: `${STATUS_COLORS[status.status] ?? '#94a3b8'}18`,
                      }}
                    >
                      {status.status_label}
                    </span>
                  </div>
                  <p className="pt-status__title">{status.title}</p>
                  <dl className="pt-status__meta">
                    <div><dt>Creado</dt><dd>{formatDate(status.created_at)}</dd></div>
                    <div><dt>Última actualización</dt><dd>{formatDate(status.updated_at)}</dd></div>
                    {status.attachment && <div><dt>Adjunto</dt><dd>{status.attachment}</dd></div>}
                  </dl>
                </section>
              )}
            </form>
          )}
        </main>
      </div>

      <footer className="pt-footer">NetShield · Universidad Nacional de Mar del Plata</footer>
    </div>
  );
}
