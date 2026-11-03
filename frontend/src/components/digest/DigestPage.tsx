/**
 * DigestPage.tsx
 * Main page for /digest route.
 * Layout:
 *   ┌───────────────────────────────────────┬─────────────┐
 *   │  Header (title + DigestActions)       │             │
 *   ├───────────────────────────────────────┤  Date       │
 *   │  CISA KEV Alert (full width)          │  Picker     │
 *   ├───────────────────────────────────────┤  (sidebar)  │
 *   │  RiskSemaphore                        │             │
 *   ├───────────────────────────────────────┤             │
 *   │  DeltaSummaryCards (6 cards)          │             │
 *   ├───────────────────────────────────────┤             │
 *   │  TransientIncidents                   │             │
 *   ├───────────────────────────────────────┤             │
 *   │  AgentCategoryTabs                    │             │
 *   ├───────────────────────────────────────┘             │
 *   │  AiDiagnosticCard (full width)                      │
 *   └─────────────────────────────────────────────────────┘
 */
import React, { useState } from 'react';
import { CalendarClock, BarChart2, Zap, Monitor, Bot, RefreshCw, AlertTriangle } from 'lucide-react';
import {
  useDigestLatest,
  useDigestByDate,
  useDigestHistory,
  useDigestGenerate,
  useDigestUpdateCategory,
} from '../../hooks/useDigest';
import { RiskSemaphore }        from './RiskSemaphore';
import { DeltaSummaryCards }    from './DeltaSummaryCards';
import { TransientIncidents }   from './TransientIncidents';
import { CisaKevAlert }         from './CisaKevAlert';
import { AgentCategoryTabs }    from './AgentCategoryTabs';
import { AiDiagnosticCard }     from './AiDiagnosticCard';
import { DigestDatePicker }     from './DigestDatePicker';
import { DigestActions }        from './DigestActions';
import type { AgentCategory, DigestResponse } from '../../types';

// ── section heading ────────────────────────────────────────────
function SectionHeading({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-surface-400 w-4 h-4">{icon}</span>
      <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider">{label}</p>
    </div>
  );
}

// ── empty state ────────────────────────────────────────────────
function EmptyState({ onGenerate, isGenerating }: { onGenerate: () => void; isGenerating: boolean }) {
  return (
    <div className="glass-card flex flex-col items-center justify-center gap-5 text-center p-16 animate-fade-in-up">
      <div style={{ fontSize: 64, filter: 'grayscale(0.3)' }}>🛡️</div>
      <div>
        <h2 className="text-xl font-bold text-surface-100 mb-2">Sin digest generado hoy</h2>
        <p className="text-sm text-surface-400 max-w-md leading-relaxed">
          El Daily Security Digest consolida alertas, vulnerabilidades y delta de 24h en un
          informe único. Generá el primero ahora o habilitá la generación automática con{' '}
          <code className="bg-surface-900 text-surface-300 px-1.5 py-0.5 rounded text-xs">
            DIGEST_AUTO_GENERATE=true
          </code>.
        </p>
      </div>
      <button
        onClick={onGenerate}
        disabled={isGenerating}
        className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
          color: '#fff',
          boxShadow: '0 4px 20px rgba(99,102,241,0.3)',
        }}
      >
        <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
        {isGenerating ? 'Generando…' : 'Generar primer Digest'}
      </button>
    </div>
  );
}

// ── loading skeleton ───────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      {[96, 56, 180, 110].map((h, i) => (
        <div
          key={i}
          className="rounded-xl bg-surface-800/40"
          style={{ height: h, opacity: 0.7 - i * 0.1 }}
        />
      ))}
    </div>
  );
}

// ── error state ────────────────────────────────────────────────
function ErrorState({ message }: { message: string }) {
  return (
    <div className="glass-card p-5 flex items-start gap-3 border-danger/20">
      <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-danger mb-1">Error al cargar el digest</p>
        <p className="text-sm text-surface-400">{message}</p>
      </div>
    </div>
  );
}

// ── main digest content ────────────────────────────────────────
function DigestContent({ digest }: { digest: DigestResponse }) {
  const updateCategory = useDigestUpdateCategory();

  const handleUpdateCategory = (agentId: string, category: AgentCategory) => {
    updateCategory.mutate({ agentId, category });
  };

  // Normalize agents_by_category — may have missing keys
  const agentsByCategory = {
    proxy:    digest.agents_by_category?.proxy    ?? [],
    mail:     digest.agents_by_category?.mail     ?? [],
    notebook: digest.agents_by_category?.notebook ?? [],
    server:   digest.agents_by_category?.server   ?? [],
  };

  return (
    <div className="flex flex-col gap-6">
      {/* CISA KEV — top priority */}
      <CisaKevAlert
        matches={digest.cisa_kev_matches ?? []}
        possibleMatches={digest.cisa_kev_possible_matches ?? []}
        status={digest.cisa_kev_status ?? 'needs_regeneration'}
        totalChecked={digest.cisa_kev_total_checked ?? 0}
        lastUpdated={digest.cisa_kev_last_updated}
      />

      {/* Risk semaphore */}
      <RiskSemaphore
        level={digest.risk_level}
        score={digest.risk_score}
        reasoning={digest.risk_reasoning ?? ''}
        generatedAt={digest.generated_at}
        isMock={digest.ai_is_mock}
      />

      {/* Delta metric cards */}
      <section>
        <SectionHeading icon={<BarChart2 />} label="Delta 24h" />
        <DeltaSummaryCards delta={digest.delta} />
      </section>

      {/* Transient incidents */}
      <section>
        <SectionHeading icon={<Zap />} label="Incidentes transitorios" />
        <TransientIncidents incidents={digest.delta?.transient_incidents ?? []} />
      </section>

      {/* Agent tabs */}
      <section>
        <SectionHeading icon={<Monitor />} label="Agentes por categoría" />
        <AgentCategoryTabs
          agentsByCategory={agentsByCategory}
          onUpdateCategory={handleUpdateCategory}
          isUpdating={updateCategory.isPending}
        />
      </section>

      {/* AI diagnostic */}
      <section>
        <SectionHeading icon={<Bot />} label="Análisis IA" />
        <AiDiagnosticCard
          aiSummary={digest.ai_summary}
          aiModelUsed={digest.ai_model_used}
          aiIsMock={digest.ai_is_mock}
          aiPayloadSent={digest.ai_payload_sent}
          aiGeneratedAt={digest.ai_generated_at}
        />
      </section>
    </div>
  );
}

// ── page ───────────────────────────────────────────────────────
export default function DigestPage() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const latestQuery  = useDigestLatest();
  const byDateQuery  = useDigestByDate(selectedDate);
  const historyQuery = useDigestHistory(60);
  const generate     = useDigestGenerate();

  const isViewingLatest = selectedDate === null;
  const activeQuery     = isViewingLatest ? latestQuery : byDateQuery;

  const digest: DigestResponse | null = activeQuery.data ?? null;

  const handleGenerate = () => generate.mutate(true);

  return (
    <div className="space-y-6">
      {/* Page header — same pattern as WazuhDashboard */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CalendarClock className="w-5 h-5 text-indigo-400" />
            <h1 className="text-2xl font-bold text-surface-100">Daily Security Digest</h1>
          </div>
          <p className="text-sm text-surface-400">
            Resumen consolidado de postura de seguridad — Delta 24h con corte a las 08:00 AM
          </p>
        </div>
        <DigestActions
          onGenerate={handleGenerate}
          isGenerating={generate.isPending}
          lastGeneratedAt={digest?.generated_at}
          generationMethod={digest?.generation_method}
        />
      </div>

      {/* Two-column layout: main + sidebar */}
      <div
        className="digest-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 230px',
          gap: 24,
          alignItems: 'start',
        }}
      >
        {/* Main content */}
        <div>
          {activeQuery.isLoading && <LoadingSkeleton />}
          {activeQuery.isError && (
            <ErrorState message={(activeQuery.error as Error)?.message ?? 'Error desconocido'} />
          )}
          {!activeQuery.isLoading && !activeQuery.isError && !digest && (
            <EmptyState onGenerate={handleGenerate} isGenerating={generate.isPending} />
          )}
          {digest && <DigestContent digest={digest} />}
        </div>

        {/* Sidebar: date picker */}
        <div style={{ position: 'sticky', top: 20 }}>
          <DigestDatePicker
            history={historyQuery.data ?? []}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            isLoading={historyQuery.isLoading}
          />
        </div>
      </div>

      {/* Responsive override */}
      <style>{`
        @media (max-width: 768px) {
          .digest-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
