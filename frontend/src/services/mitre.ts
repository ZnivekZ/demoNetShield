/**
 * MITRE ATT&CK helpers shared by the dashboards.
 *
 * The Wazuh Indexer already aggregates each technique under its real tactic
 * name (`tactic` field). Group by it directly — bucketing by the technique-id
 * numeric range collapses unrelated tactics into "Resource Development"/"Other".
 */
import type { MitreSummaryItem } from '../types';

export interface MitreTacticGroup {
  tactic_id: string;
  tactic_name: string;
  count: number;
}

/** MITRE tactic name → TA id (mirrors backend _tactic_id_for_name). */
const TACTIC_ID_BY_NAME: Record<string, string> = {
  Reconnaissance: 'TA0043',
  'Resource Development': 'TA0042',
  'Initial Access': 'TA0001',
  Execution: 'TA0002',
  Persistence: 'TA0003',
  'Privilege Escalation': 'TA0004',
  'Defense Evasion': 'TA0005',
  'Credential Access': 'TA0006',
  Discovery: 'TA0007',
  'Lateral Movement': 'TA0008',
  Collection: 'TA0009',
  'Command and Control': 'TA0011',
  Exfiltration: 'TA0010',
  Impact: 'TA0040',
};

export function tacticIdForName(name: string): string {
  return TACTIC_ID_BY_NAME[name] ?? `TA-${name.slice(0, 16).toUpperCase().replace(/\s+/g, '_')}`;
}

/** Resolve one summary row to {id,name}: prefer the real tactic the Indexer
 *  already aggregated; fall back to the technique-id heuristic. */
export function tacticForRow(row: MitreSummaryItem): { id: string; name: string } {
  const name = (row.tactic ?? '').trim();
  return name
    ? { id: tacticIdForName(name), name }
    : inferTacticFromTechnique(row.technique_id);
}

/**
 * Group summary rows into tactics and aggregate their alert counts.
 * Falls back to the technique-id heuristic only when the row has no tactic.
 */
export function groupMitreTactics(rows: MitreSummaryItem[]): MitreTacticGroup[] {
  const map = new Map<string, MitreTacticGroup>();
  for (const row of rows) {
    const { id, name } = tacticForRow(row);
    const cur = map.get(id);
    if (cur) cur.count += row.count;
    else map.set(id, { tactic_id: id, tactic_name: name, count: row.count });
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

/** Last-resort fallback when a row carries no tactic name. */
function inferTacticFromTechnique(techniqueId: string): { id: string; name: string } {
  const num = parseInt(techniqueId.replace(/\D/g, ''), 10);
  if (isNaN(num)) return { id: 'TA0000', name: 'Other' };
  const buckets: [number, string, string][] = [
    [3000, 'TA0001', 'Initial Access'],
    [4000, 'TA0002', 'Execution'],
    [5000, 'TA0003', 'Persistence'],
    [6000, 'TA0004', 'Privilege Escalation'],
    [7000, 'TA0005', 'Defense Evasion'],
    [8000, 'TA0006', 'Credential Access'],
    [9000, 'TA0007', 'Discovery'],
    [10000, 'TA0008', 'Lateral Movement'],
    [11000, 'TA0009', 'Collection'],
    [12000, 'TA0011', 'Command and Control'],
    [13000, 'TA0010', 'Exfiltration'],
    [14000, 'TA0040', 'Impact'],
  ];
  const hit = buckets.find(([max]) => num < max);
  return hit ? { id: hit[1], name: hit[2] } : { id: 'TA0000', name: 'Other' };
}
