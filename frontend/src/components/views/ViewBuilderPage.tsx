import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Plus,
  Trash2,
  Save,
  ArrowLeft,
  Loader,
  Search,
  LayoutDashboard,
  Sparkles,
  Terminal,
  GitMerge,
} from 'lucide-react';
import { useWidgetCatalog } from '../../hooks/useWidgetCatalog';
import { useCustomView, useCreateView, useUpdateView } from '../../hooks/useCustomViews';
import type { WidgetConfig, WidgetCatalogItem } from '../../types';


/** IDs de categorías disponibles */
type CategoryId = 'standard' | 'visual' | 'technical' | 'hybrid';

const CATEGORY_ICONS: Record<CategoryId, React.FC<{ size?: number }>> = {
  standard: LayoutDashboard,
  visual: Sparkles,
  technical: Terminal,
  hybrid: GitMerge,
};



/** Genera un ID de widget único */
function generateWidgetId() {
  return `widget_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Item sortable de un widget en el canvas */
function SortableWidgetItem({
  widget,
  onRemove,
  onSizeChange,
}: {
  widget: WidgetConfig;
  onRemove: (id: string) => void;
  onSizeChange: (id: string, size: WidgetConfig['size']) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const SIZE_LABELS: Record<WidgetConfig['size'], string> = {
    small: 'Pequeño',
    medium: 'Mediano',
    large: 'Grande',
    full: 'Completo',
  };

  return (
    <div ref={setNodeRef} style={style} className="builder-widget-item">
      <button
        className="builder-widget-item__drag"
        {...attributes}
        {...listeners}
        aria-label="Arrastrar widget"
      >
        <GripVertical size={14} />
      </button>

      <div className="builder-widget-item__info">
        <span className="builder-widget-item__title">{widget.title}</span>
        <span className="builder-widget-item__type">{widget.type}</span>
      </div>

      <select
        className="builder-widget-item__size input"
        value={widget.size}
        onChange={e => onSizeChange(widget.id, e.target.value as WidgetConfig['size'])}
      >
        {(['small', 'medium', 'large', 'full'] as WidgetConfig['size'][]).map(s => (
          <option key={s} value={s}>{SIZE_LABELS[s]}</option>
        ))}
      </select>

      <button
        className="btn btn-ghost builder-widget-item__remove"
        onClick={() => onRemove(widget.id)}
        aria-label="Eliminar widget"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

/** Tarjeta de widget en el catálogo */
function CatalogWidgetCard({
  item,
  onAdd,
}: {
  item: WidgetCatalogItem;
  onAdd: (item: WidgetCatalogItem) => void;
}) {
  const SOURCE_COLORS: Record<string, string> = {
    wazuh: '#f97316',
    mikrotik: '#6366f1',
    crowdsec: '#22c55e',
    suricata: '#3b82f6',
    glpi: '#a855f7',
    phishing: '#ec4899',
    general: '#64748b',
    mixed: '#f59e0b',
  };

  const previewColor = item.preview_color ?? SOURCE_COLORS[item.source] ?? '#64748b';

  return (
    <button
      className="catalog-card"
      onClick={() => onAdd(item)}
      title={item.description}
    >
      {/* Franja de color superior */}
      <div className="catalog-card__stripe" style={{ background: previewColor }} />

      {/* Badge de fuente */}
      <span
        className="catalog-card__source"
        style={{ background: SOURCE_COLORS[item.source] ?? '#64748b' }}
      >
        {item.source}
      </span>

      {/* Badge de tamaño */}
      <span className="catalog-card__size">
        {item.default_size === 'small' ? 'S' : item.default_size === 'medium' ? 'M' : item.default_size === 'large' ? 'L' : 'Full'}
      </span>

      <p className="catalog-card__title">{item.title}</p>
      <p className="catalog-card__desc">{item.description}</p>

      <span className="catalog-card__add">
        <Plus size={12} /> Agregar
      </span>
    </button>
  );
}

/**
 * ViewBuilderPage — Editor de vistas personalizadas.
 * Permite agregar widgets del catálogo y reordenarlos con drag-and-drop.
 * Si se envía ?viewId, entra en modo edición.
 */
export default function ViewBuilderPage() {
  const navigate = useNavigate();
  const { id: viewId } = useParams<{ id?: string }>();
  const isEditing = !!viewId && viewId !== 'new';

  // Cargar vista existente si editamos
  const { data: existingView, isLoading: loadingView } = useCustomView(isEditing ? viewId! : null);

  // Catálogo de widgets (categorizado)
  const { categories, isLoading: loadingCatalog, search } = useWidgetCatalog();

  // Tab activo en el catálogo
  const [activeCategory, setActiveCategory] = useState<CategoryId>('standard');


  // Form state
  const [name, setName] = useState(existingView?.name ?? '');
  const [description, setDescription] = useState(existingView?.description ?? '');
  const [widgets, setWidgets] = useState<WidgetConfig[]>(existingView?.widgets ?? []);
  const [catalogFilter, setCatalogFilter] = useState('');

  // Sincronizar si se cargan los datos de la vista existente
  useMemo(() => {
    if (existingView) {
      setName(existingView.name);
      setDescription(existingView.description ?? '');
      setWidgets(existingView.widgets);
    }
  }, [existingView]);

  const createView = useCreateView();
  const updateView = useUpdateView();

  // dnd-kit sensors
  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setWidgets(prev => {
      const oldIndex = prev.findIndex(w => w.id === String(active.id));
      const newIndex = prev.findIndex(w => w.id === String(over.id));
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const addWidget = (item: WidgetCatalogItem) => {
    setWidgets(prev => [...prev, {
      id: generateWidgetId(),
      type: item.type,
      title: item.title,
      size: item.default_size,
      config: Object.fromEntries(
        Object.entries(item.config_schema).map(([k, v]) => [k, v.default])
      ),
    }]);
  };

  const removeWidget = (id: string) => {
    setWidgets(prev => prev.filter(w => w.id !== id));
  };

  const changeWidgetSize = (id: string, size: WidgetConfig['size']) => {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, size } : w));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert('El nombre de la vista es requerido');
      return;
    }

    const payload = { name: name.trim(), description: description.trim() || undefined, widgets };

    if (isEditing && viewId) {
      await updateView.mutateAsync({ id: viewId, data: payload });
      navigate(`/views/${viewId}`);
    } else {
      const res = await createView.mutateAsync(payload);
      if (res.success && res.data) {
        navigate(`/views/${res.data.id}`);
      }
    }
  };

  // Widgets del tab activo filtrados por búsqueda
  const filteredCategories = catalogFilter.trim() ? search(catalogFilter) : categories;
  const activeWidgets = filteredCategories.find(c => c.id === activeCategory)?.widgets ?? [];
  const noResults = filteredCategories.every(c => c.widgets.length === 0);

  const isSaving = createView.isPending || updateView.isPending;

  if (isEditing && loadingView) {
    return (
      <div className="views-page">
        <div className="views-loading">
          <Loader size={20} className="animate-spin" />
          <span>Cargando vista…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="builder-page">
      {/* Toolbar */}
      <div className="builder-toolbar glass-card">
        <button className="btn btn-ghost" onClick={() => navigate('/views')}>
          <ArrowLeft size={14} /> Vistas
        </button>
        <div className="builder-toolbar__meta">
          <input
            id="view-name-input"
            className="builder-toolbar__name input"
            placeholder="Nombre de la vista"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={100}
          />
          <input
            id="view-desc-input"
            className="builder-toolbar__desc input"
            placeholder="Descripción (opcional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={255}
          />
        </div>
        <button
          id="btn-save-view"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={isSaving || !name.trim()}
        >
          {isSaving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
          {isEditing ? 'Guardar cambios' : 'Crear vista'}
        </button>
      </div>

      {/* Body: Canvas + Catálogo */}
      <div className="builder-body">
        {/* Canvas: widgets seleccionados */}
        <div className="builder-canvas glass-card">
          <div className="builder-canvas__header">
            <LayoutDashboard size={14} />
            <h3 className="builder-canvas__title">
              Widgets de la vista ({widgets.length})
            </h3>
          </div>

          {widgets.length === 0 && (
            <div className="builder-canvas__empty">
              <p>Seleccioná widgets del catálogo para agregarlos a tu vista.</p>
            </div>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={widgets.map(w => w.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="builder-widget-list">
                {widgets.map(w => (
                  <SortableWidgetItem
                    key={w.id}
                    widget={w}
                    onRemove={removeWidget}
                    onSizeChange={changeWidgetSize}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* Catálogo de widgets */}
        <div className="builder-catalog glass-card">
          <div className="builder-catalog__header">
            <h3 className="builder-catalog__title">Catálogo de Widgets</h3>
            <div className="builder-catalog__search" style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
              <input
                id="catalog-search"
                className="input"
                placeholder="Buscar widget…"
                value={catalogFilter}
                onChange={e => setCatalogFilter(e.target.value)}
                style={{ paddingLeft: '1.75rem', fontSize: '0.78rem' }}
              />
            </div>
          </div>

          {/* Tabs por categoría */}
          {!catalogFilter.trim() && (
            <div className="catalog-tabs" role="tablist">
              {categories.map(cat => {
                const Icon = CATEGORY_ICONS[cat.id as CategoryId] ?? LayoutDashboard;
                return (
                  <button
                    key={cat.id}
                    role="tab"
                    aria-selected={activeCategory === cat.id}
                    className={`catalog-tab${activeCategory === cat.id ? ' catalog-tab--active' : ''}`}
                    onClick={() => setActiveCategory(cat.id as CategoryId)}
                    title={cat.description}
                  >
                    <Icon size={12} />
                    <span>{cat.label}</span>
                    <span className="catalog-tab__badge">{cat.widgets.length}</span>
                  </button>
                );
              })}
            </div>
          )}

          {loadingCatalog ? (
            <div className="views-loading">
              <Loader size={16} className="animate-spin" />
              <span>Cargando catálogo…</span>
            </div>
          ) : (
            <div className="builder-catalog__grid">
              {(catalogFilter.trim() ? filteredCategories.flatMap(c => c.widgets) : activeWidgets).map(item => (
                <CatalogWidgetCard
                  key={item.type}
                  item={item}
                  onAdd={addWidget}
                />
              ))}
              {(catalogFilter.trim() ? noResults : activeWidgets.length === 0) && (
                <p className="views-empty" style={{ padding: '1rem', fontSize: '0.8rem' }}>
                  {catalogFilter ? `Sin resultados para "${catalogFilter}"` : 'Sin widgets en esta categoría'}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
