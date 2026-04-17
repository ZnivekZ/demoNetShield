/**
 * NetworkTypeBadge — badge visual para el tipo de red de una IP.
 *
 * Tipos: "Hosting" | "ISP" | "Business" | "Residential" | "Local" | null
 * Casos especiales: is_datacenter → "Datacenter", is_tor → "Tor" con emoji
 */

interface NetworkTypeBadgeProps {
  networkType: string | null;
  isDatacenter?: boolean;
  isTor?: boolean;
  className?: string;
}

export function NetworkTypeBadge({
  networkType,
  isDatacenter = false,
  isTor = false,
  className = '',
}: NetworkTypeBadgeProps) {
  if (!networkType && !isDatacenter && !isTor) return null;

  if (isTor) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 ${className}`}
        title="Nodo Tor"
      >
        🧅 Tor
      </span>
    );
  }

  if (isDatacenter) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 ${className}`}
        title="IP de datacenter / hosting"
      >
        🏢 DC
      </span>
    );
  }

  const typeConfig: Record<string, { bg: string; text: string; label: string }> = {
    ISP: {
      bg: 'bg-blue-500/20 border-blue-500/30',
      text: 'text-blue-300',
      label: 'ISP',
    },
    Hosting: {
      bg: 'bg-amber-500/20 border-amber-500/30',
      text: 'text-amber-300',
      label: 'Hosting',
    },
    Business: {
      bg: 'bg-cyan-500/20 border-cyan-500/30',
      text: 'text-cyan-300',
      label: 'Business',
    },
    Residential: {
      bg: 'bg-green-500/20 border-green-500/30',
      text: 'text-green-300',
      label: 'Residential',
    },
    Local: {
      bg: 'bg-slate-500/20 border-slate-500/30',
      text: 'text-slate-300',
      label: 'Local',
    },
  };

  const config = typeConfig[networkType ?? ''];
  if (!config) return null;

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${config.bg} ${config.text} ${className}`}
    >
      {config.label}
    </span>
  );
}
