import { Link, useParams } from 'react-router-dom';
import { WidgetHeader } from '../common';

/** Opens the report preparation flow with the view's data sources preselected. */
export function ViewReportGenerator() {
  const { id } = useParams<{ id: string }>();
  return <div className="space-y-3 p-3">
    <WidgetHeader title="Informe de esta vista" />
    <p className="text-xs text-surface-400">Seleccioná los datos, revisá el prompt y prepará un documento editable.</p>
    <Link className="btn btn-primary" to={id ? `/reports?view=${encodeURIComponent(id)}` : '/reports'}>Preparar informe</Link>
  </div>;
}
