/**
 * UsersView — Hotspot user management tab.
 * Search + filter bar, user table, create/bulk-import modals.
 */
import { useState } from 'react';
import { Search, UserPlus, Upload, RefreshCw } from 'lucide-react';
import { usePortalUsers, useCreatePortalUser } from '../../hooks/usePortalUsers';
import { usePortalProfiles } from '../../hooks/usePortalConfig';
import { UserTable } from './UserTable';
import { UserFormModal } from './UserFormModal';
import { BulkImportModal } from './BulkImportModal';
import type { PortalUserCreate } from '../../types';

export function UsersView() {
  const [search, setSearch] = useState('');
  const [filterProfile, setFilterProfile] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  // Debounce search — only query after 1+ chars
  const searchParam = search.length >= 1 ? search : undefined;

  const { data: users = [], isLoading, refetch } = usePortalUsers({
    search: searchParam,
    profile: filterProfile || undefined,
  });
  const { data: profiles = [] } = usePortalProfiles();
  const createMutation = useCreatePortalUser();

  const handleCreate = (data: PortalUserCreate) => {
    createMutation.mutate(data, {
      onSuccess: () => setShowCreate(false),
    });
  };

  return (
    <div className="portal-view">
      {/* Toolbar */}
      <div className="portal-toolbar">
        <div className="portal-search-wrap">
          <Search size={14} className="portal-search-icon" />
          <input
            id="portal-user-search"
            className="portal-search-input"
            type="text"
            placeholder="Buscar por nombre o MAC…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select
          id="portal-profile-filter"
          className="portal-form-select portal-filter-select"
          value={filterProfile}
          onChange={e => setFilterProfile(e.target.value)}
        >
          <option value="">Todos los perfiles</option>
          {profiles.filter(p => !p.is_unregistered).map(p => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>

        <div className="portal-toolbar-actions">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => refetch()}
            disabled={isLoading}
            title="Actualizar"
          >
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
          </button>
          <button
            id="portal-bulk-import-btn"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowBulk(true)}
          >
            <Upload size={14} /> Importar CSV
          </button>
          <button
            id="portal-create-user-btn"
            className="btn btn-primary btn-sm"
            onClick={() => setShowCreate(true)}
          >
            <UserPlus size={14} /> Nuevo usuario
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="portal-users-summary">
        <span>{users.length} usuario{users.length !== 1 ? 's' : ''}</span>
        {search && <span> — filtrando por "{search}"</span>}
      </div>

      {/* Table */}
      <div className="glass-card portal-table-card">
        {isLoading ? (
          <div className="portal-loading">
            <span className="loading-spinner" />
            <span>Cargando usuarios…</span>
          </div>
        ) : (
          <UserTable users={users} profiles={profiles} />
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <UserFormModal
          mode="create"
          profiles={profiles}
          isLoading={createMutation.isPending}
          onSubmit={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}
      {showBulk && <BulkImportModal onClose={() => setShowBulk(false)} />}
    </div>
  );
}
