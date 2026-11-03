/**
 * AgentCategoryTabs.tsx
 * Tabs: Global Summary | Proxies | Mail | Notebooks | Servers
 * Each tab lists agents in that category with per-agent delta tables.
 * Includes override button to manually reclassify an agent.
 * Styled with NetShield glass-card / design-system tokens.
 */
import React, { useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import type { DigestAgent, AgentCategory } from '../../types';
import { AgentDeltaTable } from './AgentDeltaTable';

interface Props {
  agentsByCategory: Record<AgentCategory, DigestAgent[]>;
  onUpdateCategory: (agentId: string, category: AgentCategory) => void;
  isUpdating?: boolean;
}

const TABS: { key: AgentCategory | 'all'; label: string; icon: string }[] = [
  { key: 'all',      label: 'Resumen Global', icon: '📊' },
  { key: 'proxy',    label: 'Proxies',        icon: '🌐' },
  { key: 'mail',     label: 'Correo',         icon: '✉️' },
  { key: 'notebook', label: 'Notebooks',      icon: '💻' },
  { key: 'server',   label: 'Servidores',     icon: '🖥️' },
];

const ALL_CATEGORIES: AgentCategory[] = ['proxy', 'mail', 'notebook', 'server'];
const CATEGORY_LABELS: Record<AgentCategory, string> = {
  proxy:    'Proxy',
  mail:     'Correo',
  notebook: 'Notebook',
  server:   'Servidor',
};

interface OverrideModalProps {
  agent: DigestAgent;
  onConfirm: (cat: AgentCategory) => void;
  onClose: () => void;
}

const OverrideModal: React.FC<OverrideModalProps> = ({ agent, onConfirm, onClose }) => {
  const [selected, setSelected] = useState<AgentCategory>(agent.category);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="glass-card p-7 w-full max-w-sm mx-4 animate-fade-in-up"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-surface-100 mb-1">Reclasificar agente</h3>
        <p className="text-xs text-surface-400 mb-5">
          {agent.agent_name} <span className="text-surface-500">({agent.agent_id})</span>
        </p>

        <div className="flex flex-col gap-2 mb-6">
          {ALL_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelected(cat)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm text-left transition-all"
              style={{
                background: selected === cat ? 'rgba(99,102,241,0.12)' : 'var(--bg-primary, #000)',
                border: selected === cat ? '2px solid #6366f1' : '1px solid var(--border-default, #1f1f1f)',
                color: selected === cat ? '#818cf8' : '#cbd5e1',
                fontWeight: selected === cat ? 700 : 400,
              }}
            >
              {TABS.find(t => t.key === cat)?.icon} {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => { onConfirm(selected); onClose(); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}
          >
            <Check className="w-4 h-4" /> Confirmar
          </button>
          <button
            onClick={onClose}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm text-surface-400 transition-colors border border-surface-800 hover:text-surface-200"
          >
            <X className="w-4 h-4" /> Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};

export const AgentCategoryTabs: React.FC<Props> = ({ agentsByCategory, onUpdateCategory, isUpdating }) => {
  const [activeTab, setActiveTab] = useState<AgentCategory | 'all'>('all');
  const [overrideAgent, setOverrideAgent] = useState<DigestAgent | null>(null);

  const allAgents = ALL_CATEGORIES.flatMap(cat => agentsByCategory[cat] ?? []);

  const agentsToShow = activeTab === 'all'
    ? allAgents
    : (agentsByCategory[activeTab] ?? []);

  return (
    <div>
      {/* Tab bar */}
      <div
        className="flex gap-1 mb-5 p-1 overflow-x-auto rounded-xl"
        style={{ background: 'var(--bg-primary, #000)', border: '1px solid var(--border-default, #1f1f1f)' }}
      >
        {TABS.map(tab => {
          const count = tab.key === 'all'
            ? allAgents.length
            : (agentsByCategory[tab.key as AgentCategory]?.length ?? 0);

          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs whitespace-nowrap transition-all"
              style={{
                background: isActive ? '#1e40af' : 'transparent',
                color: isActive ? '#fff' : 'var(--text-tertiary, #525252)',
                fontWeight: isActive ? 700 : 400,
                border: 'none',
              }}
            >
              {tab.icon} {tab.label}
              {count > 0 && (
                <span
                  className="rounded-full px-2 py-px text-[10px]"
                  style={{
                    background: isActive ? 'rgba(255,255,255,0.2)' : 'var(--bg-tertiary, #111)',
                    color: isActive ? '#fff' : 'var(--text-secondary, #a3a3a3)',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Agent list */}
      {agentsToShow.length === 0 ? (
        <div
          className="rounded-xl py-10 text-center text-sm text-surface-500"
          style={{ background: 'var(--bg-primary, #000)', border: '1px solid var(--border-default, #1f1f1f)' }}
        >
          Sin agentes en esta categoría
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {agentsToShow.map(agent => (
            <div key={agent.agent_id} className="relative">
              <AgentDeltaTable agent={agent} />
              <button
                onClick={() => setOverrideAgent(agent)}
                disabled={isUpdating}
                title="Reclasificar este agente"
                className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-surface-400 hover:text-amber-400 transition-colors disabled:opacity-50 border border-surface-800 hover:border-amber-400/30"
                style={{ background: 'var(--bg-secondary, #0a0a0a)' }}
              >
                <Pencil className="w-3 h-3" />
                Reclasificar
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Override modal */}
      {overrideAgent && (
        <OverrideModal
          agent={overrideAgent}
          onConfirm={(cat) => onUpdateCategory(overrideAgent.agent_id, cat)}
          onClose={() => setOverrideAgent(null)}
        />
      )}
    </div>
  );
};
