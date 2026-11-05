import type { ReactNode } from 'react';

function inline(value: string): ReactNode[] {
  return value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index} className="text-surface-100">{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="text-cyan-300">{part.slice(1, -1)}</code>;
    return part;
  });
}

function cells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(cell => cell.trim().replaceAll('\\|', '|'));
}

export default function ReportMarkdown({ markdown }: { markdown: string }) {
  const lines = markdown.split('\n');
  const blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (!line.trim()) continue;
    if (line.startsWith('|')) {
      const table: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        const row = cells(lines[i]);
        if (!row.every(cell => /^:?-+:?$/.test(cell))) table.push(row);
        i++;
      }
      i--;
      if (table.length) blocks.push(<div key={`table-${i}`} className="overflow-x-auto my-3">
        <table className="w-full text-xs border-collapse">
          <thead><tr>{table[0].map((cell, col) => <th key={col} className="text-left border-b border-surface-600 px-2 py-2 text-surface-200">{inline(cell)}</th>)}</tr></thead>
          <tbody>{table.slice(1).map((row, rowIndex) => <tr key={rowIndex} className="border-b border-surface-800">
            {row.map((cell, col) => <td key={col} className="px-2 py-2 text-surface-300 align-top">{inline(cell)}</td>)}
          </tr>)}</tbody>
        </table>
      </div>);
      continue;
    }
    if (line.startsWith('# ')) blocks.push(<h3 key={i} className="text-lg font-bold text-surface-100 mt-3">{line.slice(2)}</h3>);
    else if (line.startsWith('## ')) blocks.push(<h4 key={i} className="text-base font-semibold text-surface-100 mt-5 mb-1">{line.slice(3)}</h4>);
    else if (line.startsWith('### ')) blocks.push(<h5 key={i} className="text-sm font-semibold text-cyan-200 mt-4">{inline(line.slice(4))}</h5>);
    else if (/^\d+\. /.test(line)) blocks.push(<p key={i} className="text-sm text-surface-300 pl-2 my-1">{inline(line)}</p>);
    else if (line.trimStart().startsWith('- ')) blocks.push(<p key={i} className={`text-sm text-surface-300 my-1 ${line.startsWith('  ') ? 'pl-6' : 'pl-2'}`}>• {inline(line.trimStart().slice(2))}</p>);
    else blocks.push(<p key={i} className="text-sm text-surface-300 my-1 leading-relaxed">{inline(line.trim())}</p>);
  }
  return <div className="space-y-1 min-w-0 break-words">{blocks}</div>;
}
