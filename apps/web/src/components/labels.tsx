import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, LABEL_COLORS, type Board, type Label } from '../api';
import { labelTextColor } from '../lib';
import { Button, cx, ErrorText, Icon, Input } from './ui';

/** Create/edit/delete a board label. */
export function LabelForm({
  board,
  label,
  onDone,
}: {
  board: Board;
  label?: Label;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(label?.name ?? '');
  const [color, setColor] = useState(label?.color ?? LABEL_COLORS[0]);
  const [error, setError] = useState<unknown>(null);

  const save = async () => {
    try {
      if (label) await api.patch(`/labels/${label.id}`, { name, color });
      else await api.post(`/boards/${board.id}/labels`, { name, color });
      await qc.invalidateQueries({ queryKey: ['board', board.id] });
      onDone();
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex h-12 items-center justify-center rounded bg-[#f7f8f9]">
        <span className="max-w-full truncate rounded px-3 py-1 text-sm font-semibold" style={{ background: color, color: labelTextColor(color) }}>
          {name || ' '}
        </span>
      </div>
      <Input autoFocus value={name} placeholder="Label name (optional)" onChange={(e) => setName(e.target.value)} />
      <div className="grid grid-cols-6 gap-1">
        {LABEL_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={c}
            onClick={() => setColor(c)}
            className={cx('h-8 rounded', color === c && 'ring-2 ring-[#0c66e4] ring-offset-1')}
            style={{ background: c }}
          />
        ))}
      </div>
      <ErrorText error={error} />
      <div className="flex justify-between">
        <Button variant="primary" onClick={save}>
          {label ? 'Save' : 'Create'}
        </Button>
        {label && (
          <Button
            variant="danger"
            onClick={async () => {
              if (!confirm('Delete this label? It will be removed from all cards.')) return;
              await api.del(`/labels/${label.id}`);
              await qc.invalidateQueries({ queryKey: ['board', board.id] });
              onDone();
            }}
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

/** Label list with optional checkboxes (card) and edit buttons. */
export function LabelPicker({
  board,
  selected,
  onToggle,
  canEdit,
}: {
  board: Board;
  selected?: string[];
  onToggle?: (labelId: string, on: boolean) => void;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<Label | 'new' | null>(null);
  const [search, setSearch] = useState('');

  if (editing) {
    return (
      <div>
        <button type="button" onClick={() => setEditing(null)} className="mb-2 flex items-center gap-1 text-xs text-[#44546f]">
          <Icon name="back" size={14} /> Back
        </button>
        <LabelForm board={board} label={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />
      </div>
    );
  }

  const labels = board.labels.filter((l) => l.name.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <div className="space-y-2">
      <Input value={search} placeholder="Search labels…" onChange={(e) => setSearch(e.target.value)} />
      <div className="space-y-1">
        {labels.map((l) => {
          const on = selected?.includes(l.id) ?? false;
          return (
            <div key={l.id} className="flex items-center gap-2">
              {onToggle && (
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!canEdit}
                  onChange={() => onToggle(l.id, !on)}
                  className="h-4 w-4 accent-[#0c66e4]"
                />
              )}
              <button
                type="button"
                disabled={!onToggle || !canEdit}
                onClick={() => onToggle?.(l.id, !on)}
                className="h-8 min-w-0 flex-1 truncate rounded px-3 text-left text-sm font-medium hover:opacity-90"
                style={{ background: l.color, color: labelTextColor(l.color) }}
              >
                {l.name}
              </button>
              {canEdit && (
                <button type="button" aria-label="Edit label" onClick={() => setEditing(l)} className="rounded p-1.5 hover:bg-[#091e420f]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 20h4L19 9l-4-4L4 16v4z" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>
      {canEdit && (
        <Button className="w-full" onClick={() => setEditing('new')}>
          Create a new label
        </Button>
      )}
    </div>
  );
}
