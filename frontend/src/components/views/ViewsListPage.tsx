import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  LayoutDashboard,
  Star,
  Trash2,
  Edit3,
  ExternalLink,
  Loader,
  AlertTriangle,
} from 'lucide-react';
import {
  useCustomViews,
  useDeleteView,
  useSetDefaultView,
} from '../../hooks/useCustomViews';
import type { CustomView } from '../../types';

/**
 * ViewsListPage — Lista de todas las vistas personalizadas.
 * Permite crear, editar, eliminar y marcar como default.
 */
export default function ViewsListPage() {
  const navigate = useNavigate();
  const { data: views = [], isLoading, isError } = useCustomViews();
  const deleteView = useDeleteView();
  const setDefault = useSetDefaultView();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (view: CustomView) => {
    if (!confirm(`¿Eliminar la vista "${view.name}"? Esta acción no se puede deshacer.`)) return;
    setDeletingId(view.id);
    try {
      await deleteView.mutateAsync(view.id);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSetDefault = async (id: string) => {
    await setDefault.mutateAsync(id);
  };

  if (isLoading) {
    return (
      <div className="views-page">
        <div className="views-loading">
          <Loader size={20} className="animate-spin" />
          <span>Cargando vistas…</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="views-page">
        <div className="views-empty">
          <AlertTriangle size={32} />
          <p>Error al cargar las vistas</p>
        </div>
      </div>
    );
  }

  return (
    <div className="views-page">
      {/* Header */}
      <div className="views-header">
        <div className="views-header__info">
          <h1 className="views-header__title">Mis Vistas</h1>
          <p className="views-header__subtitle">
            {views.length} vista{views.length !== 1 ? 's' : ''} personalizada{views.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          id="btn-create-view"
          className="btn btn-primary"
          onClick={() => navigate('/views/new')}
        >
          <Plus size={15} />
          Nueva Vista
        </button>
      </div>

      {/* Empty state */}
      {views.length === 0 && (
        <div className="views-empty glass-card">
          <LayoutDashboard size={40} />
          <h3>Sin vistas personalizadas</h3>
          <p>Creá tu primer dashboard personalizado con los widgets que más usás.</p>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/views/new')}
          >
            <Plus size={14} /> Crear primera vista
          </button>
        </div>
      )}

      {/* Grid de vistas */}
      {views.length > 0 && (
        <div className="views-grid">
          {views.map(view => (
            <div
              key={view.id}
              className={`view-card glass-card ${view.is_default ? 'view-card--default' : ''}`}
            >
              {/* Header de la card */}
              <div className="view-card__header">
                <div
                  className="view-card__icon"
                  style={{ color: view.color ?? 'var(--accent-primary)' }}
                >
                  <LayoutDashboard size={20} />
                </div>
                <div className="view-card__meta">
                  <h3 className="view-card__name">{view.name}</h3>
                  {view.description && (
                    <p className="view-card__desc">{view.description}</p>
                  )}
                </div>
                {view.is_default && (
                  <span className="view-card__default-badge">
                    <Star size={10} /> Default
                  </span>
                )}
              </div>

              {/* Stats */}
              <div className="view-card__stats">
                <span className="view-card__stat">
                  {view.widgets.length} widget{view.widgets.length !== 1 ? 's' : ''}
                </span>
                {view.created_at && (
                  <span className="view-card__stat">
                    {new Date(view.created_at).toLocaleDateString('es-AR', {
                      day: '2-digit', month: '2-digit', year: '2-digit',
                    })}
                  </span>
                )}
              </div>

              {/* Acciones */}
              <div className="view-card__actions">
                <Link
                  to={`/views/${view.id}`}
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  <ExternalLink size={13} /> Ver
                </Link>
                <Link
                  to={`/views/${view.id}/edit`}
                  className="btn btn-ghost"
                >
                  <Edit3 size={13} />
                </Link>
                {!view.is_default && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => handleSetDefault(view.id)}
                    title="Marcar como default"
                    disabled={setDefault.isPending}
                  >
                    <Star size={13} />
                  </button>
                )}
                <button
                  className="btn btn-ghost"
                  onClick={() => handleDelete(view)}
                  disabled={deletingId === view.id}
                  title="Eliminar vista"
                >
                  {deletingId === view.id
                    ? <Loader size={13} className="animate-spin" />
                    : <Trash2 size={13} />
                  }
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
