/**
 * TelegramTab — Main Telegram integration tab inside ReportsPage.
 * Three sections: Estado, Configuraciones, Historial/Bot.
 */
import { useState } from 'react';
import { Bot, Settings, History } from 'lucide-react';
import { TelegramStatusCard } from './TelegramStatusCard';
import { TelegramQuickActions } from './TelegramQuickActions';
import { TelegramConfigList } from './TelegramConfigList';
import { TelegramHistory } from './TelegramHistory';
import { BotConversation } from './BotConversation';

type Section = 'status' | 'configs' | 'history';

const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'status', label: 'Estado y Acciones', icon: <Bot size={14} /> },
  { id: 'configs', label: 'Reportes Automáticos', icon: <Settings size={14} /> },
  { id: 'history', label: 'Historial y Bot', icon: <History size={14} /> },
];

export function TelegramTab() {
  const [section, setSection] = useState<Section>('status');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Section nav */}
      <div style={{
        display: 'flex', gap: '0.25rem',
        background: 'var(--color-surface-800)',
        padding: '0.3rem',
        borderRadius: 10,
        width: 'fit-content',
      }}>
        {SECTIONS.map(s => (
          <button
            key={s.id}
            id={`telegram-section-${s.id}`}
            onClick={() => setSection(s.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.4rem 0.85rem', borderRadius: 7,
              border: 'none', cursor: 'pointer',
              fontSize: '0.8rem', fontWeight: 600,
              transition: 'all 0.15s',
              background: section === s.id ? 'rgba(34,163,238,0.18)' : 'transparent',
              color: section === s.id ? '#22a3ee' : 'var(--color-surface-400)',
              boxShadow: section === s.id ? '0 0 0 1px rgba(34,163,238,0.3)' : 'none',
            }}
          >
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {/* Status + Quick Actions */}
      {section === 'status' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <TelegramStatusCard />
          <div className="glass-card" style={{ padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-surface-300)', marginBottom: '0.75rem' }}>
              Acciones manuales
            </div>
            <TelegramQuickActions />
          </div>
        </div>
      )}

      {/* Report configs */}
      {section === 'configs' && (
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <TelegramConfigList />
        </div>
      )}

      {/* History + Bot conversation */}
      {section === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <History size={15} color="var(--color-brand-400)" />
              Historial de mensajes
            </div>
            <TelegramHistory />
          </div>
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Bot size={15} color="#22a3ee" />
              Conversaciones con el bot
            </div>
            <BotConversation />
          </div>
        </div>
      )}
    </div>
  );
}
