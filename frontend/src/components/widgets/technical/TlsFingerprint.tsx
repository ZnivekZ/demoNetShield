import { useTlsFingerprint } from '../../../hooks/widgets/technical';
import { WidgetSkeleton, WidgetErrorState, WidgetHeader } from '../common';

interface TlsHandshake {
  sni?: string;
  ja3?: string;
  issuerdn?: string;
  subject?: string;
  notafter?: string;
  src_ip?: string;
  timestamp?: string;
  self_signed?: boolean;
}

/**
 * Tabla de TLS handshakes: SNI, JA3, issuer, expiración.
 * Resalta en rojo certs expirados o self-signed.
 */
export function TlsFingerprint({ config }: { config?: { limit?: number } }) {
  const limit = config?.limit ?? 20;
  const { data, isLoading, error, refetch } = useTlsFingerprint(limit);

  if (isLoading) return <WidgetSkeleton rows={5} />;
  if (error || !data) return <WidgetErrorState message={String(error)} onRetry={() => refetch()} />;

  const handshakes = data as TlsHandshake[];
  const now = Date.now();

  function isExpired(notafter?: string): boolean {
    if (!notafter) return false;
    return new Date(notafter).getTime() < now;
  }

  return (
    <div className="widget-tls-fingerprint">
      <WidgetHeader title="TLS Fingerprints" />
      {handshakes.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', textAlign: 'center' }}>Sin handshakes TLS</p>
      ) : (
        <div style={{ overflowY: 'auto', maxHeight: '240px' }}>
          <table className="data-table" style={{ fontSize: '0.68rem' }}>
            <thead>
              <tr>
                <th>SNI</th>
                <th>JA3</th>
                <th>Issuer</th>
                <th>Expira</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {handshakes.map((h, i) => {
                const expired = isExpired(h.notafter);
                const suspicious = expired || h.self_signed;
                return (
                  <tr key={i} style={{ background: suspicious ? 'rgba(239,68,68,0.07)' : undefined }}>
                    <td style={{ maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {h.sni ?? h.src_ip ?? '-'}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>
                      {h.ja3 ? h.ja3.slice(0, 10) + '…' : '-'}
                    </td>
                    <td style={{ maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {h.issuerdn ?? '-'}
                    </td>
                    <td style={{ color: expired ? 'var(--color-danger, #ef4444)' : 'var(--color-text-secondary)' }}>
                      {h.notafter ? new Date(h.notafter).toLocaleDateString() : '-'}
                    </td>
                    <td>
                      {expired && <span style={{ color: 'var(--color-danger)', fontSize: '0.6rem', marginRight: 4 }}>EXP</span>}
                      {h.self_signed && <span style={{ color: 'var(--color-warning)', fontSize: '0.6rem' }}>SELF</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
