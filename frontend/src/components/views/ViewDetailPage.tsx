import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Edit3,
  Loader,
  AlertTriangle,
  LayoutDashboard,
  Star,
} from 'lucide-react';
import { useCustomView } from '../../hooks/useCustomViews';
import WidgetRenderer from './WidgetRenderer';

/**
 * ViewDetailPage — Renderiza una vista personalizada guardada.
 * Cada widget se renderiza con datos reales vía WidgetRenderer.
 */
export default function ViewDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: view, isLoading, isError } = useCustomView(id ?? null);

  if (isLoading) {
    return (
      <div className="views-page">
        <div className="views-loading">
          <Loader size={20} className="animate-spin" />
          <span>Cargando vista…</span>
        </div>
      </div>
    );
  }

  if (isError || !view) {
    return (
      <div className="views-page">
        <div className="views-empty glass-card">
          <AlertTriangle size={32} />
          <h3>Vista no encontrada</h3>
          <p>La vista solicitada no existe o fue eliminada.</p>
          <button className="btn btn-primary" onClick={() => navigate('/views')}>
            <ArrowLeft size={14} /> Volver a Mis Vistas
          </button>
        </div>
      </div>
    );
  }

  const SIZE_GRID: Record<string, string> = {
    small: '1',
    medium: '2',
    large: '3',
    full: '4',
  };

  return (
    <div className="views-page">
      {/* Toolbar */}
      <div className="builder-toolbar glass-card">
        <button className="btn btn-ghost" onClick={() => navigate('/views')}>
          <ArrowLeft size={14} /> Vistas
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <LayoutDashboard size={18} style={{ color: view.color ?? 'var(--accent-primary)' }} />
          <div>
            <h1 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {view.name}
            </h1>
            {view.description && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', margin: '0.1rem 0 0' }}>
                {view.description}
              </p>
            )}
          </div>
          {view.is_default && (
            <span className="view-card__default-badge">
              <Star size={10} /> Default
            </span>
          )}
        </div>
        <button
          className="btn btn-ghost"
          onClick={() => navigate(`/views/${id}/edit`)}
        >
          <Edit3 size={14} /> Editar
        </button>
      </div>

      {/* Widgets grid */}
      {view.widgets.length === 0 ? (
        <div className="views-empty glass-card">
          <LayoutDashboard size={32} />
          <h3>Vista vacía</h3>
          <p>Esta vista no tiene widgets configurados.</p>
          <button className="btn btn-primary" onClick={() => navigate(`/views/${id}/edit`)}>
            <Edit3 size={14} /> Agregar widgets
          </button>
        </div>
      ) : (
        <div className="view-detail-grid">
          {view.widgets.map(widget => (
            <div
              key={widget.id}
              className="view-detail-widget glass-card"
              style={{ gridColumn: `span ${SIZE_GRID[widget.size] ?? '2'}` }}
            >
              <div className="view-detail-widget__header">
                <h3 className="view-detail-widget__title">{widget.title}</h3>
              </div>
              <div className="view-detail-widget__body">
                <WidgetRenderer widget={widget} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
