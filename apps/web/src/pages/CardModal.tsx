import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import { formatDistanceToNow } from 'date-fns';
import { api, ApiError, COVER_COLORS, type Board, type CardDetail, type Checklist } from '../api';
import { useMe } from '../auth';
import { LabelPicker } from '../components/labels';
import { Avatar, Button, CloseButton, cx, ErrorText, Icon, InlineEdit, Input, Modal, Popover, Spinner } from '../components/ui';
import { dateTime, dueLabels, dueStatus, dueStyles, labelTextColor, toLocalInput } from '../lib';

export function CardModal({ cardId, board, onClose }: { cardId: string; board: Board; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: card, error, isLoading } = useQuery({
    queryKey: ['card', cardId],
    queryFn: () => api.get<{ card: CardDetail }>(`/cards/${cardId}`).then((r) => r.card),
    retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2,
  });
  const canEdit = board.myRole !== 'OBSERVER';
  const [actionError, setActionError] = useState<unknown>(null);

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['card', cardId] }),
      qc.invalidateQueries({ queryKey: ['board', board.id] }),
    ]);
  };
  const run = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(e);
    } finally {
      await refresh();
    }
  };
  const patch = (body: Record<string, unknown>) => run(() => api.patch(`/cards/${cardId}`, body));

  if (isLoading) {
    return (
      <Modal onClose={onClose} width={768}>
        <div className="p-10">
          <Spinner full />
        </div>
      </Modal>
    );
  }
  if (error || !card || card.boardId !== board.id) {
    return (
      <Modal onClose={onClose} title="Card not found" width={400}>
        <p className="p-5 text-sm">This card may have been deleted.</p>
      </Modal>
    );
  }

  const labels = card.labelIds.map((id) => board.labels.find((l) => l.id === id)).filter(Boolean);
  const members = card.memberIds.map((id) => board.members.find((m) => m.user.id === id)?.user).filter(Boolean);
  const due = dueStatus(card.dueDate, card.dueComplete);

  return (
    <Modal onClose={onClose} width={768}>
      {card.coverColor && <div className="h-28 rounded-t-xl" style={{ background: card.coverColor }} />}
      <CloseButton onClick={onClose} className={cx('absolute right-2 top-2 z-10', card.coverColor && 'bg-black/10')} />
      {card.archivedAt && (
        <div className={cx('flex items-center gap-2 bg-[#fff7d6] px-5 py-3 text-sm', !card.coverColor && 'rounded-t-xl')}>
          <Icon name="archive" /> This card is archived.
        </div>
      )}
      <div className="px-5 pb-5 pt-4">
        <div className="mb-4 flex gap-3 pr-8">
          <Icon name="card" size={20} className="mt-1.5" />
          <div className="min-w-0 flex-1">
            <InlineEdit
              value={card.title}
              disabled={!canEdit}
              multiline
              onSave={(title) => patch({ title })}
              className="break-words rounded px-1 py-0.5 text-xl font-semibold"
              inputClassName="text-xl font-semibold"
            />
            <p className="px-1 text-sm text-[#44546f]">
              in list <span className="underline">{card.list.title}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-6 md:flex-row">
          <div className="min-w-0 flex-1 space-y-6">
            {(members.length > 0 || labels.length > 0 || card.dueDate || card.startDate) && (
              <div className="flex flex-wrap gap-6 pl-8">
                {members.length > 0 && (
                  <Section label="Members">
                    <div className="flex flex-wrap gap-1">
                      {members.map((u) => (
                        <Avatar key={u!.id} user={u!} size={32} />
                      ))}
                    </div>
                  </Section>
                )}
                {labels.length > 0 && (
                  <Section label="Labels">
                    <div className="flex flex-wrap gap-1">
                      {labels.map((l) => (
                        <span
                          key={l!.id}
                          className="flex h-8 min-w-12 items-center rounded px-3 text-sm font-medium"
                          style={{ background: l!.color, color: labelTextColor(l!.color) }}
                        >
                          {l!.name}
                        </span>
                      ))}
                    </div>
                  </Section>
                )}
                {(card.dueDate || card.startDate) && (
                  <Section label={card.dueDate ? (card.startDate ? 'Dates' : 'Due date') : 'Start date'}>
                    <div className="flex items-center gap-2">
                      {card.dueDate && (
                        <input
                          type="checkbox"
                          aria-label="Mark complete"
                          checked={card.dueComplete}
                          disabled={!canEdit}
                          onChange={(e) => patch({ dueComplete: e.target.checked })}
                          className="h-4 w-4 accent-[#1f845a]"
                        />
                      )}
                      <span className="rounded bg-[#091e420f] px-3 py-1.5 text-sm">
                        {card.startDate && dateTime(card.startDate).replace(/ at .*/, '')}
                        {card.startDate && card.dueDate && ' – '}
                        {card.dueDate && dateTime(card.dueDate)}
                        {due && due !== 'normal' && (
                          <span className={cx('ml-2 rounded px-1 text-xs font-medium', dueStyles[due])}>{dueLabels[due]}</span>
                        )}
                      </span>
                    </div>
                  </Section>
                )}
              </div>
            )}

            <Description card={card} canEdit={canEdit} onSave={(description) => patch({ description })} />

            {card.checklists.map((cl) => (
              <ChecklistBlock key={cl.id} checklist={cl} board={board} canEdit={canEdit} run={run} />
            ))}

            <Comments card={card} canEdit={canEdit} isBoardAdmin={board.myRole === 'ADMIN'} run={run} />
          </div>

          {canEdit && (
            <div className="w-full shrink-0 space-y-2 md:w-44">
              <p className="text-xs font-semibold text-[#44546f]">Add to card</p>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
                <Popover title="Members" trigger={(t) => <SideButton icon="user" label="Members" onClick={t} />}>
                  {() => (
                    <div className="space-y-1">
                      {board.members.map((m) => {
                        const on = card.memberIds.includes(m.user.id);
                        return (
                          <button
                            key={m.user.id}
                            type="button"
                            onClick={() =>
                              run(() =>
                                on ? api.del(`/cards/${cardId}/members/${m.user.id}`) : api.put(`/cards/${cardId}/members/${m.user.id}`),
                              )
                            }
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[#091e420f]"
                          >
                            <Avatar user={m.user} size={28} />
                            <span className="flex-1 truncate">{m.user.fullName}</span>
                            {on && <Icon name="check" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Popover>
                <Popover title="Labels" trigger={(t) => <SideButton icon="tag" label="Labels" onClick={t} />}>
                  {() => (
                    <LabelPicker
                      board={board}
                      canEdit
                      selected={card.labelIds}
                      onToggle={(labelId, on) =>
                        run(() => (on ? api.put(`/cards/${cardId}/labels/${labelId}`) : api.del(`/cards/${cardId}/labels/${labelId}`)))
                      }
                    />
                  )}
                </Popover>
                <Popover title="Add checklist" trigger={(t) => <SideButton icon="checklist" label="Checklist" onClick={t} />}>
                  {(close) => (
                    <AddChecklist
                      onAdd={(title) => {
                        close();
                        return run(() => api.post(`/cards/${cardId}/checklists`, { title }));
                      }}
                    />
                  )}
                </Popover>
                <Popover title="Dates" trigger={(t) => <SideButton icon="clock" label="Dates" onClick={t} />}>
                  {(close) => (
                    <DatesForm
                      card={card}
                      onSave={(body) => {
                        close();
                        return patch(body);
                      }}
                    />
                  )}
                </Popover>
                <Popover title="Cover" trigger={(t) => <SideButton icon="image" label="Cover" onClick={t} />}>
                  {(close) => (
                    <div className="space-y-2">
                      <div className="grid grid-cols-5 gap-2">
                        {COVER_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-label={c}
                            onClick={() => patch({ coverColor: c })}
                            className={cx('h-8 rounded', card.coverColor === c && 'ring-2 ring-[#0c66e4] ring-offset-1')}
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                      {card.coverColor && (
                        <Button
                          className="w-full"
                          onClick={() => {
                            close();
                            patch({ coverColor: null });
                          }}
                        >
                          Remove cover
                        </Button>
                      )}
                    </div>
                  )}
                </Popover>
              </div>

              <p className="pt-3 text-xs font-semibold text-[#44546f]">Actions</p>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
                <Popover title="Move card" trigger={(t) => <SideButton icon="arrow" label="Move" onClick={t} />}>
                  {(close) => (
                    <div className="space-y-1">
                      {board.lists.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          disabled={l.id === card.list.id}
                          onClick={() => {
                            close();
                            const last = l.cards[l.cards.length - 1];
                            patch({ listId: l.id, position: (last?.position ?? 0) + 65536 });
                          }}
                          className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-[#091e420f] disabled:opacity-50"
                        >
                          {l.title} {l.id === card.list.id && '(current)'}
                        </button>
                      ))}
                    </div>
                  )}
                </Popover>
                {card.archivedAt ? (
                  <>
                    <SideButton icon="undo" label="Send to board" onClick={() => patch({ archived: false })} />
                    <SideButton
                      icon="trash"
                      label="Delete"
                      danger
                      onClick={async () => {
                        if (!confirm('Delete this card permanently? This cannot be undone.')) return;
                        await api.del(`/cards/${cardId}`);
                        qc.invalidateQueries({ queryKey: ['board', board.id] });
                        qc.invalidateQueries({ queryKey: ['archived', board.id] });
                        onClose();
                      }}
                    />
                  </>
                ) : (
                  <SideButton icon="archive" label="Archive" onClick={() => patch({ archived: true })} />
                )}
              </div>
            </div>
          )}
        </div>
        <ErrorText error={actionError} />
      </div>
    </Modal>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-[#44546f]">{label}</p>
      {children}
    </div>
  );
}

function SideButton({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <Button
      onClick={onClick}
      variant={danger ? 'danger' : 'secondary'}
      className="w-full justify-start"
    >
      <Icon name={icon} /> {label}
    </Button>
  );
}

function Description({ card, canEdit, onSave }: { card: CardDetail; canEdit: boolean; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.description);
  useEffect(() => {
    if (!editing) setDraft(card.description);
  }, [card.description, editing]);

  return (
    <div className="flex gap-3">
      <Icon name="text" size={20} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Description</h3>
          {canEdit && !editing && card.description && <Button onClick={() => setEditing(true)}>Edit</Button>}
        </div>
        {editing ? (
          <div className="space-y-2">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={8}
              placeholder="Add a more detailed description… (Markdown supported: **bold**, _italic_, - lists, # headings, [links](https://…))"
              className="w-full rounded border-2 border-[#388bff] bg-white p-2 text-sm outline-none"
            />
            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  onSave(draft);
                  setEditing(false);
                }}
              >
                Save
              </Button>
              <Button
                variant="subtle"
                onClick={() => {
                  setDraft(card.description);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : card.description ? (
          <div className="markdown text-sm" onClick={(e) => canEdit && (e.target as HTMLElement).tagName !== 'A' && setEditing(true)}>
            <ReactMarkdown components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer noopener" /> }}>{card.description}</ReactMarkdown>
          </div>
        ) : canEdit ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="h-14 w-full rounded bg-[#091e420f] px-3 text-left text-sm text-[#44546f] hover:bg-[#091e4224]"
          >
            Add a more detailed description…
          </button>
        ) : (
          <p className="text-sm text-[#626f86]">No description.</p>
        )}
      </div>
    </div>
  );
}

function DatesForm({ card, onSave }: { card: CardDetail; onSave: (body: Record<string, unknown>) => void }) {
  const [useStart, setUseStart] = useState(!!card.startDate);
  const [useDue, setUseDue] = useState(!!card.dueDate || !card.startDate);
  const [start, setStart] = useState(toLocalInput(card.startDate, false));
  const [due, setDue] = useState(
    toLocalInput(card.dueDate) || toLocalInput(new Date(Date.now() + 24 * 3600 * 1000).toISOString()).slice(0, 11) + '12:00',
  );
  return (
    <div className="space-y-3 text-sm">
      <label className="block">
        <span className="mb-1 flex items-center gap-2 text-xs font-semibold text-[#44546f]">
          <input type="checkbox" checked={useStart} onChange={(e) => setUseStart(e.target.checked)} className="accent-[#0c66e4]" />
          Start date
        </span>
        <Input type="date" disabled={!useStart} value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 flex items-center gap-2 text-xs font-semibold text-[#44546f]">
          <input type="checkbox" checked={useDue} onChange={(e) => setUseDue(e.target.checked)} className="accent-[#0c66e4]" />
          Due date
        </span>
        <Input type="datetime-local" disabled={!useDue} value={due} onChange={(e) => setDue(e.target.value)} />
      </label>
      <Button
        variant="primary"
        className="w-full"
        onClick={() =>
          onSave({
            startDate: useStart && start ? new Date(`${start}T00:00`).toISOString() : null,
            dueDate: useDue && due ? new Date(due).toISOString() : null,
            ...(useDue && due ? {} : { dueComplete: false }),
          })
        }
      >
        Save
      </Button>
      <Button className="w-full" onClick={() => onSave({ startDate: null, dueDate: null, dueComplete: false })}>
        Remove dates
      </Button>
    </div>
  );
}

function AddChecklist({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState('Checklist');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) onAdd(title.trim());
      }}
      className="space-y-2"
    >
      <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onFocus={(e) => e.target.select()} />
      <Button type="submit" variant="primary">
        Add
      </Button>
    </form>
  );
}

function ChecklistBlock({
  checklist,
  board,
  canEdit,
  run,
}: {
  checklist: Checklist;
  board: Board;
  canEdit: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [hideChecked, setHideChecked] = useState(false);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const done = checklist.items.filter((i) => i.checked).length;
  const total = checklist.items.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const items = hideChecked ? checklist.items.filter((i) => !i.checked) : checklist.items;

  return (
    <div className="flex gap-3">
      <Icon name="checklist" size={20} className="mt-1" />
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-2">
          <InlineEdit
            value={checklist.title}
            disabled={!canEdit}
            onSave={(title) => run(() => api.patch(`/checklists/${checklist.id}`, { title }))}
            className="flex-1 font-semibold"
            inputClassName="w-full font-semibold"
          />
          {done > 0 && (
            <Button onClick={() => setHideChecked((h) => !h)}>{hideChecked ? `Show checked (${done})` : 'Hide checked'}</Button>
          )}
          {canEdit && (
            <Button
              onClick={() => {
                if (confirm(`Delete checklist “${checklist.title}”?`)) run(() => api.del(`/checklists/${checklist.id}`));
              }}
            >
              Delete
            </Button>
          )}
        </div>
        <div className="mb-2 flex items-center gap-2">
          <span className="w-8 text-xs text-[#44546f]">{pct}%</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#091e420f]">
            <div
              className={cx('h-full rounded-full transition-all', pct === 100 ? 'bg-[#1f845a]' : 'bg-[#0c66e4]')}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <ul className="space-y-0.5">
          {items.map((item) => {
            const assignee = board.members.find((m) => m.user.id === item.assigneeId)?.user;
            return (
              <li key={item.id} className="group flex items-start gap-2 rounded px-1 py-1 hover:bg-[#091e420f]">
                <input
                  type="checkbox"
                  checked={item.checked}
                  disabled={!canEdit}
                  onChange={(e) => run(() => api.patch(`/checklist-items/${item.id}`, { checked: e.target.checked }))}
                  className="mt-1 h-4 w-4 accent-[#0c66e4]"
                />
                <InlineEdit
                  value={item.text}
                  disabled={!canEdit}
                  multiline
                  onSave={(t) => run(() => api.patch(`/checklist-items/${item.id}`, { text: t }))}
                  className={cx('min-w-0 flex-1 break-words text-sm', item.checked && 'text-[#626f86] line-through')}
                  inputClassName="text-sm"
                />
                {item.dueDate && (
                  <span className={cx('rounded px-1 text-xs', dueStyles[dueStatus(item.dueDate, item.checked) ?? 'normal'] || 'bg-[#091e420f]')}>
                    {dateTime(item.dueDate).replace(/ at .*/, '')}
                  </span>
                )}
                {assignee && <Avatar user={assignee} size={22} />}
                {canEdit && (
                  <Popover
                    title="Item options"
                    align="right"
                    width={260}
                    trigger={(t) => (
                      <button type="button" aria-label="Item options" onClick={t} className="rounded p-1 opacity-0 hover:bg-[#091e4224] group-hover:opacity-100 focus:opacity-100">
                        <Icon name="dots" size={14} />
                      </button>
                    )}
                  >
                    {(close) => (
                      <div className="space-y-3 text-sm">
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold text-[#44546f]">Assign to</span>
                          <select
                            value={item.assigneeId ?? ''}
                            onChange={(e) => run(() => api.patch(`/checklist-items/${item.id}`, { assigneeId: e.target.value || null }))}
                            className="w-full rounded border-2 border-[#091e4224] px-2 py-1"
                          >
                            <option value="">Nobody</option>
                            {board.members.map((m) => (
                              <option key={m.user.id} value={m.user.id}>
                                {m.user.fullName}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold text-[#44546f]">Due date</span>
                          <Input
                            type="date"
                            value={toLocalInput(item.dueDate, false)}
                            onChange={(e) =>
                              run(() =>
                                api.patch(`/checklist-items/${item.id}`, {
                                  dueDate: e.target.value ? new Date(`${e.target.value}T12:00`).toISOString() : null,
                                }),
                              )
                            }
                          />
                        </label>
                        <Button
                          variant="danger"
                          className="w-full"
                          onClick={() => {
                            close();
                            run(() => api.del(`/checklist-items/${item.id}`));
                          }}
                        >
                          Delete item
                        </Button>
                      </div>
                    )}
                  </Popover>
                )}
              </li>
            );
          })}
        </ul>
        {canEdit &&
          (adding ? (
            <form
              className="mt-2 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                const t = text.trim();
                if (!t) return;
                setText('');
                run(() => api.post(`/checklists/${checklist.id}/items`, { text: t }));
              }}
            >
              <Input autoFocus value={text} placeholder="Add an item" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setAdding(false)} />
              <div className="flex gap-2">
                <Button type="submit" variant="primary">
                  Add
                </Button>
                <Button variant="subtle" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button className="mt-2" onClick={() => setAdding(true)}>
              Add an item
            </Button>
          ))}
      </div>
    </div>
  );
}

function Comments({
  card,
  canEdit,
  isBoardAdmin,
  run,
}: {
  card: CardDetail;
  canEdit: boolean;
  isBoardAdmin: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const me = useMe();
  const [body, setBody] = useState('');
  const [focused, setFocused] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');

  return (
    <div className="flex gap-3">
      <Icon name="comment" size={20} className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-3">
        <h3 className="font-semibold">Comments</h3>
        {canEdit && (
          <div className="flex gap-2">
            <Avatar user={me} size={32} />
            <div className="flex-1 space-y-2">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onFocus={() => setFocused(true)}
                rows={focused ? 3 : 1}
                placeholder="Write a comment…"
                className="w-full rounded-lg bg-white px-3 py-2 text-sm shadow-[0_1px_1px_#091e4240,0_0_1px_#091e424f] outline-none focus:ring-2 focus:ring-[#388bff]"
              />
              {focused && (
                <Button
                  variant="primary"
                  disabled={!body.trim()}
                  onClick={() => {
                    const b = body.trim();
                    setBody('');
                    setFocused(false);
                    run(() => api.post(`/cards/${card.id}/comments`, { body: b }));
                  }}
                >
                  Save
                </Button>
              )}
            </div>
          </div>
        )}
        {card.comments.map((c) => {
          const mine = c.author?.id === me.id;
          return (
            <div key={c.id} className="flex gap-2">
              <Avatar user={c.author} size={32} />
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  <span className="font-semibold">{c.author?.fullName ?? 'Deleted user'}</span>{' '}
                  <span className="text-xs text-[#626f86]" title={dateTime(c.createdAt)}>
                    {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                    {c.editedAt && ' (edited)'}
                  </span>
                </div>
                {editingId === c.id ? (
                  <div className="mt-1 space-y-2">
                    <textarea
                      autoFocus
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border-2 border-[#388bff] bg-white px-3 py-2 text-sm outline-none"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        disabled={!editBody.trim()}
                        onClick={() => {
                          setEditingId(null);
                          run(() => api.patch(`/comments/${c.id}`, { body: editBody.trim() }));
                        }}
                      >
                        Save
                      </Button>
                      <Button variant="subtle" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="markdown mt-1 rounded-lg bg-white px-3 py-2 text-sm shadow-[0_1px_1px_#091e4240,0_0_1px_#091e424f]">
                    <ReactMarkdown components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer noopener" /> }}>{c.body}</ReactMarkdown>
                  </div>
                )}
                {canEdit && editingId !== c.id && (mine || isBoardAdmin) && (
                  <div className="mt-1 flex gap-2 text-xs text-[#44546f]">
                    {mine && (
                      <button
                        type="button"
                        className="underline"
                        onClick={() => {
                          setEditingId(c.id);
                          setEditBody(c.body);
                        }}
                      >
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => {
                        if (confirm('Delete this comment?')) run(() => api.del(`/comments/${c.id}`));
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {card.comments.length === 0 && !canEdit && <p className="text-sm text-[#626f86]">No comments yet.</p>}
        <p className="text-xs text-[#626f86]">
          Created {formatDistanceToNow(new Date(card.createdAt), { addSuffix: true })}
          {card.createdBy && ` by ${card.createdBy.fullName}`}
        </p>
      </div>
    </div>
  );
}
