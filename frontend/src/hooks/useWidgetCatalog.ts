import { useQuery } from '@tanstack/react-query';
import { viewsApi } from '../services/api';
import type { WidgetCategory, WidgetCatalogItem } from '../types';

const CATALOG_KEY = ['widget-catalog'] as const;

/**
 * Carga el catálogo categorizado de widgets del backend.
 * Retorna `categories` (array de WidgetCategory) y helpers de búsqueda.
 */
export function useWidgetCatalog() {
  const query = useQuery({
    queryKey: CATALOG_KEY,
    queryFn: async () => {
      const res = await viewsApi.getWidgetCatalog();
      if (!res.success) throw new Error(res.error ?? 'Error al cargar catálogo');
      return res.data!;
    },
    staleTime: 5 * 60_000, // 5 min
  });

  /** Aplana todas las categorías en una sola lista */
  const allWidgets: WidgetCatalogItem[] = query.data
    ? query.data.categories.flatMap(c => c.widgets)
    : [];

  /** Busca un widget por type en cualquier categoría */
  const findWidget = (type: string): WidgetCatalogItem | undefined =>
    allWidgets.find(w => w.type === type);

  /** Filtra widgets por texto en todas las categorías */
  const search = (term: string): WidgetCategory[] => {
    if (!query.data || !term.trim()) return query.data?.categories ?? [];
    const q = term.toLowerCase();
    return query.data.categories
      .map(cat => ({
        ...cat,
        widgets: cat.widgets.filter(
          w =>
            w.title.toLowerCase().includes(q) ||
            w.description.toLowerCase().includes(q) ||
            w.source.toLowerCase().includes(q)
        ),
      }))
      .filter(cat => cat.widgets.length > 0);
  };

  return {
    ...query,
    categories: query.data?.categories ?? [],
    allWidgets,
    findWidget,
    search,
  };
}
