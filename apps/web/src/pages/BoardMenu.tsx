import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, BACKGROUNDS, type Board, type CardSummary } from '../api';
import { LabelPicker } from '../components/labels';
import { Button, CloseButton, cx, Icon, Spinner } from '../components/ui';

type View = 'menu' | 'background' | 'labels' | 'archived';

export function BoardMenu({ board, onClose }: { board: Board; onClose: () => void }) {
  const [view, setView] = useState<View>('menu');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const canEdit = board.myRole !== 'OBSERVER';
  const refresh = () => qc.invalidateQueries({ queryKey: ['board', board.id] });

  const titles: Record<View, string> = {
    menu: 'Menu',
    background: 'Change background',
    labels: 'Labels',
    archived: 'Archived items',
  };

  const item = (icon: string, label: string, onClick: () => void, danger = false) => (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm hover:bg-[#091e420f]',
        danger && 'text-[#c9372c]',
      )}
    >
      <Icon name={icon} /> {label}
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[340px] flex-col bg-white shadow-2xl">
        <div className="flex items-center border-b p-3">
          {view !== 'menu' ? (
            <button type="button" aria-label="Back" onClick={() => setView('menu')} className="rounded p-1.5 hover:bg-[#091e4224]">
              <Icon name="back" />
            </button>
          ) : (
            <span className="w-7" />
          )}
          <h2 className="flex-1 text-center font-semibold">{titles[view]}</h2>
          <CloseButton onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {view === 'menu' && (
            <div className="space-y-1">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setView('background')}
                  className="flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm hover:bg-[#091e420f]"
                >
                  <span className="h-5 w-6 rounded" style={{ background: board.background }} /> Change background
                </button>
              )}
              {item('tag', 'Labels', () => setView('labels'))}
              {item('archive', 'Archived items', () => setView('archived'))}
              {board.myRole === 'ADMIN' && (
                <>
                  <hr className="my-2" />
                  {item(
                    'x',
                    'Close board',
                    async () => {
                      if (!confirm('Close this board? Board admins can reopen it from the boards page.')) return;
                      await api.patch(`/boards/${board.id}`, { archived: true });
                      qc.invalidateQueries({ queryKey: ['boards'] });
                      navigate('/');
                    },
                    true,
                  )}
                </>
              )}
            </div>
          )}

          {view === 'background' && (
            <div className="grid grid-cols-2 gap-2">
              {BACKGROUNDS.map((bg) => (
                <button
                  key={bg}
                  type="button"
                  aria-label="Background"
                  onClick={() => api.patch(`/boards/${board.id}`, { background: bg }).then(refresh)}
                  className={cx('h-16 rounded-lg', board.background === bg && 'ring-2 ring-[#0c66e4] ring-offset-2')}
                  style={{ background: bg }}
                />
              ))}
            </div>
          )}

          {view === 'labels' && <LabelPicker board={board} canEdit={canEdit} />}

          {view === 'archived' && <ArchivedItems board={board} canEdit={canEdit} />}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function ArchivedItems({ board, canEdit }: { board: Board; canEdit: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'cards' | 'lists'>('cards');
  const { data, isLoading } = useQuery({
    queryKey: ['archived', board.id],
    queryFn: () =>
      api.get<{
        lists: { id: string; title: string; archivedAt: string }[];
        cards: (CardSummary & { listTitle: string; archivedAt: string })[];
      }>(`/boards/${board.id}/archived`),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['archived', board.id] });
    qc.invalidateQueries({ queryKey: ['board', board.id] });
  };

  if (isLoading || !data) return <Spinner />;
  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded bg-[#f1f2f4] p-1">
        {(['cards', 'lists'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cx('flex-1 rounded py-1 text-sm capitalize', tab === t && 'bg-white font-medium shadow-sm')}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'cards' &&
        (data.cards.length === 0 ? (
          <p className="text-center text-sm text-[#626f86]">No archived cards</p>
        ) : (
          data.cards.map((c) => (
            <div key={c.id} className="rounded-lg border p-2">
              <button
                type="button"
                className="block w-full text-left text-sm font-medium hover:underline"
                onClick={() => navigate(`/b/${board.id}/c/${c.id}`)}
              >
                {c.title}
              </button>
              <p className="text-xs text-[#626f86]">in list {c.listTitle}</p>
              {canEdit && (
                <div className="mt-2 flex gap-2">
                  <Button onClick={() => api.patch(`/cards/${c.id}`, { archived: false }).then(refresh)}>
                    <Icon name="undo" size={14} /> Restore
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      if (confirm('Delete this card permanently? This cannot be undone.')) {
                        api.del(`/cards/${c.id}`).then(refresh);
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </div>
          ))
        ))}
      {tab === 'lists' &&
        (data.lists.length === 0 ? (
          <p className="text-center text-sm text-[#626f86]">No archived lists</p>
        ) : (
          data.lists.map((l) => (
            <div key={l.id} className="flex items-center gap-2 rounded-lg border p-2">
              <span className="flex-1 text-sm font-medium">{l.title}</span>
              {canEdit && (
                <>
                  <Button onClick={() => api.patch(`/lists/${l.id}`, { archived: false }).then(refresh)}>Restore</Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      if (confirm('Delete this list and all its cards permanently? This cannot be undone.')) {
                        api.del(`/lists/${l.id}`).then(refresh);
                      }
                    }}
                  >
                    Delete
                  </Button>
                </>
              )}
            </div>
          ))
        ))}
    </div>
  );
}
