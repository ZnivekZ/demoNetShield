/**
 * AssetSearch — Debounced search bar for GLPI assets.
 * 300ms debounce to avoid excessive API calls while typing.
 */
import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function AssetSearch({ value, onChange, placeholder = 'Buscar por nombre, IP o serial…' }: Props) {
  const [local, setLocal] = useState(value);

  // Sync external value
  useEffect(() => { setLocal(value); }, [value]);

  // Debounce 300ms
  useEffect(() => {
    const t = setTimeout(() => onChange(local), 300);
    return () => clearTimeout(t);
  }, [local, onChange]);

  return (
    <div style={{ position: 'relative', width: 280 }}>
      <Search
        size={14}
        style={{
          position: 'absolute',
          left: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--color-surface-400)',
        }}
      />
      <input
        id="assets-search-input"
        className="input"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        style={{ paddingLeft: 32, paddingRight: local ? 32 : undefined }}
      />
      {local && (
        <button
          onClick={() => { setLocal(''); onChange(''); }}
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-surface-400)',
            display: 'flex',
          }}
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
