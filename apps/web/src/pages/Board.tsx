import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closestCenter,
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { api, ApiError, type Board, type BoardList, type CardSummary } from '../api';
import { connectSocket } from '../socket';
import { Topbar } from '../components/Topbar';
import { CardTile, Composer, ListColumn, SortableList } from '../components/board';
import { Avatar, Button, cx, Icon, InlineEdit, Spinner } from '../components/ui';
import { dueStatus, positionAt } from '../lib';
import { CardModal } from './CardModal';
import { BoardMenu } from './BoardMenu';
import { MembersModal } from './MembersModal';
import { emptyFilter, FilterPopover, isFilterActive, matchesFilter, type CardFilter } from './BoardFilter';

const strip = (id: string | number) => String(id).slice(2);

export function useBoardQuery(boardId: string) {
  return useQuery({
    queryKey: ['board', boardId],
    queryFn: () => api.get<{ board: Board }>(`/boards/${boardId}`).then((r) => r.board),
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  });
}

export function BoardPage() {
  const { boardId = '', cardId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: board, error, isLoading } = useBoardQuery(boardId);
  const [lists, setLists] = useState<BoardList[]>([]);
  const [active, setActive] = useState<{ type: 'list' | 'card'; id: string } | null>(null);
  const dragOrigin = useRef<{ listId: string; index: number } | null>(null);
  const [addingList, setAddingList] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [filter, setFilter] = useState<CardFilter>(emptyFilter);

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ['board', boardId] }), [qc, boardId]);

  // Keep the local (draggable) copy in sync with the server unless a drag is in progress.
  useEffect(() => {
    if (!active && board) setLists(board.lists);
  }, [board, active]);

  // Live updates from other users.
  useEffect(() => {
    const socket = connectSocket();
    const join = () => socket.emit('board:join', boardId);
    if (socket.connected) join();
    socket.on('connect', join);
    const onChange = (p: { boardId: string; cardId?: string }) => {
      if (p.boardId !== boardId) return;
      qc.invalidateQueries({ queryKey: ['board', boardId] });
      qc.invalidateQueries({ queryKey: ['archived', boardId] });
      if (p.cardId) qc.invalidateQueries({ queryKey: ['card', p.cardId] });
    };
    const onBoards = () => qc.invalidateQueries({ queryKey: ['board', boardId] });
    socket.on('board:changed', onChange);
    socket.on('boards:changed', onBoards);
    return () => {
      socket.emit('board:leave', boardId);
      socket.off('connect', join);
      socket.off('board:changed', onChange);
      socket.off('boards:changed', onBoards);
    };
  }, [boardId, qc]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const canEdit = board ? board.myRole !== 'OBSERVER' : false;
  const filtering = isFilterActive(filter);

  const listOfCard = (cardId: string, from = lists) => from.find((l) => l.cards.some((c) => c.id === cardId))?.id;

  const collision: CollisionDetection = useCallback(
    (args) => {
      if (active?.type === 'list') {
        return closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter((c) => String(c.id).startsWith('l:')),
        });
      }
      const hits = pointerWithin(args);
      const cardHits = hits.filter((h) => String(h.id).startsWith('c:'));
      if (cardHits.length) return cardHits;
      const listHit = hits.find((h) => String(h.id).startsWith('l:'));
      if (listHit) {
        const listCards = args.droppableContainers.filter(
          (c) => c.data.current?.type === 'card' && c.data.current.listId === strip(listHit.id),
        );
        return listCards.length ? closestCenter({ ...args, droppableContainers: listCards }) : [listHit];
      }
      return closestCorners(args);
    },
    [active],
  );

  const commit = (next: BoardList[]) => {
    qc.setQueryData<Board>(['board', boardId], (old) => (old ? { ...old, lists: next } : old));
    setLists(next);
  };

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    if (id.startsWith('c:')) {
      const listId = listOfCard(strip(id))!;
      const index = lists.find((l) => l.id === listId)!.cards.findIndex((c) => c.id === strip(id));
      dragOrigin.current = { listId, index };
      setActive({ type: 'card', id: strip(id) });
    } else {
      setActive({ type: 'list', id: strip(id) });
    }
  };

  const onDragOver = ({ active: a, over }: DragOverEvent) => {
    if (!over || !String(a.id).startsWith('c:')) return;
    const cardId = strip(a.id);
    const overId = String(over.id);
    const fromId = listOfCard(cardId);
    const toId = overId.startsWith('l:') ? strip(overId) : listOfCard(strip(overId));
    if (!fromId || !toId || fromId === toId) return;

    setLists((prev) => {
      const from = prev.find((l) => l.id === fromId)!;
      const to = prev.find((l) => l.id === toId)!;
      const card = from.cards.find((c) => c.id === cardId)!;
      let index = to.cards.length;
      if (overId.startsWith('c:')) {
        const overIndex = to.cards.findIndex((c) => c.id === strip(overId));
        const translated = a.rect.current.translated;
        const below = translated && translated.top > over.rect.top + over.rect.height / 2;
        index = overIndex + (below ? 1 : 0);
      }
      return prev.map((l) => {
        if (l.id === fromId) return { ...l, cards: l.cards.filter((c) => c.id !== cardId) };
        if (l.id === toId) {
          const cards = [...l.cards];
          cards.splice(index, 0, { ...card, listId: toId });
          return { ...l, cards };
        }
        return l;
      });
    });
  };

  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    const activeId = String(a.id);
    const origin = dragOrigin.current;
    dragOrigin.current = null;

    if (activeId.startsWith('l:')) {
      const listId = strip(activeId);
      const overListId = over ? (String(over.id).startsWith('l:') ? strip(over.id) : listOfCard(strip(over.id))) : null;
      const oldIndex = lists.findIndex((l) => l.id === listId);
      const newIndex = overListId ? lists.findIndex((l) => l.id === overListId) : oldIndex;
      if (oldIndex !== newIndex && newIndex >= 0) {
        const others = lists.filter((l) => l.id !== listId);
        const position = positionAt(others, newIndex);
        const next = arrayMove(lists, oldIndex, newIndex).map((l) => (l.id === listId ? { ...l, position } : l));
        commit(next);
        api.patch(`/lists/${listId}`, { position }).catch(refresh);
      }
      setActive(null);
      return;
    }

    const cardId = strip(activeId);
    const listId = listOfCard(cardId);
    if (!listId || !origin) {
      setActive(null);
      return;
    }
    const list = lists.find((l) => l.id === listId)!;
    const oldIndex = list.cards.findIndex((c) => c.id === cardId);
    let newIndex = oldIndex;
    if (over && String(over.id).startsWith('c:')) {
      const overIndex = list.cards.findIndex((c) => c.id === strip(over.id));
      if (overIndex >= 0) newIndex = overIndex;
    }
    if (listId === origin.listId && newIndex === origin.index) {
      setActive(null);
      return;
    }
    const cards = arrayMove(list.cards, oldIndex, newIndex);
    const position = positionAt(
      cards.filter((c) => c.id !== cardId),
      newIndex,
    );
    const next = lists.map((l) =>
      l.id === listId ? { ...l, cards: cards.map((c) => (c.id === cardId ? { ...c, position, listId } : c)) } : l,
    );
    commit(next);
    setActive(null);
    api.patch(`/cards/${cardId}`, { listId, position }).catch(refresh);
  };

  const activeCard: CardSummary | undefined =
    active?.type === 'card' ? lists.flatMap((l) => l.cards).find((c) => c.id === active.id) : undefined;
  const activeList = active?.type === 'list' ? lists.find((l) => l.id === active.id) : undefined;

  const visibleCards = useMemo(() => {
    const map = new Map<string, CardSummary[]>();
    for (const l of lists) map.set(l.id, filtering ? l.cards.filter((c) => matchesFilter(c, filter, board!)) : l.cards);
    return map;
  }, [lists, filter, filtering, board]);

  if (isLoading) return <Spinner full />;
  if (error || !board) {
    return (
      <div className="flex min-h-full flex-col">
        <Topbar />
        <div className="m-auto text-center">
          <p className="mb-4 text-lg">{error instanceof ApiError && error.status === 404 ? 'Board not found' : 'Could not load the board'}</p>
          <p className="mb-4 text-sm text-[#626f86]">It may have been closed, or you may no longer have access.</p>
          <Link to="/" className="text-[#0c66e4] underline">
            Back to boards
          </Link>
        </div>
      </div>
    );
  }

  const listHandlers = (list: BoardList) => ({
    onAddCard: async (title: string) => {
      await api.post(`/lists/${list.id}/cards`, { title });
      await refresh();
    },
    onRename: (title: string) => api.patch(`/lists/${list.id}`, { title }).then(refresh),
    onArchive: () => api.patch(`/lists/${list.id}`, { archived: true }).then(refresh),
    onArchiveCards: () => api.post(`/lists/${list.id}/archive-cards`).then(refresh),
    onMoveCards: (toListId: string) => api.post(`/lists/${list.id}/move-cards`, { toListId }).then(refresh),
  });

  const overdueCount = lists.flatMap((l) => l.cards).filter((c) => dueStatus(c.dueDate, c.dueComplete) === 'overdue').length;

  return (
    <div className="flex h-full flex-col" style={{ background: board.background }}>
      <Topbar transparent />
      <div className="flex shrink-0 flex-wrap items-center gap-2 bg-black/15 px-3 py-2 text-white backdrop-blur-[2px]">
        <InlineEdit
          value={board.title}
          disabled={!canEdit}
          onSave={(title) => api.patch(`/boards/${boardId}`, { title }).then(refresh)}
          className="rounded px-2 py-1 text-lg font-bold hover:bg-white/20"
          inputClassName="text-lg font-bold text-[#172b4d]"
        />
        <button
          type="button"
          aria-label={board.starred ? 'Unstar board' : 'Star board'}
          className="rounded p-1.5 hover:bg-white/20"
          onClick={() =>
            api.put(`/boards/${boardId}/star`, { starred: !board.starred }).then(() => {
              refresh();
              qc.invalidateQueries({ queryKey: ['boards'] });
            })
          }
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={board.starred ? '#f5cd47' : 'none'} stroke={board.starred ? '#f5cd47' : 'currentColor'} strokeWidth="2">
            <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" />
          </svg>
        </button>
        {board.myRole === 'OBSERVER' && (
          <span className="flex items-center gap-1 rounded bg-white/20 px-2 py-0.5 text-xs">
            <Icon name="eye" size={14} /> Observer (read-only)
          </span>
        )}
        {overdueCount > 0 && (
          <span className="rounded bg-[#c9372c] px-2 py-0.5 text-xs font-medium">{overdueCount} overdue</span>
        )}
        <div className="flex-1" />
        <FilterPopover board={board} filter={filter} onChange={setFilter} />
        <button type="button" onClick={() => setMembersOpen(true)} className="flex -space-x-1.5 rounded p-1 hover:bg-white/20">
          {board.members.slice(0, 5).map((m) => (
            <Avatar key={m.user.id} user={m.user} size={28} />
          ))}
          {board.members.length > 5 && (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/30 text-xs">+{board.members.length - 5}</span>
          )}
        </button>
        <Button onClick={() => setMembersOpen(true)} className="bg-white/90 hover:bg-white">
          <Icon name="users" /> Share
        </Button>
        <button type="button" aria-label="Board menu" onClick={() => setMenuOpen(true)} className="rounded p-2 hover:bg-white/20">
          <Icon name="dots" />
        </button>
      </div>
      {filtering && (
        <div className="bg-[#0c66e4] px-4 py-1 text-center text-xs text-white">
          Filter is on — drag and drop is disabled while filtering.{' '}
          <button type="button" className="underline" onClick={() => setFilter(emptyFilter)}>
            Clear filter
          </button>
        </div>
      )}

      <div className="board-scroll flex min-h-0 flex-1 items-start gap-3 overflow-x-auto p-3">
        <DndContext
          sensors={sensors}
          collisionDetection={collision}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            dragOrigin.current = null;
            setActive(null);
          }}
        >
          <SortableContext items={lists.map((l) => `l:${l.id}`)} strategy={horizontalListSortingStrategy}>
            {lists.map((list) => (
              <SortableList
                key={list.id}
                list={list}
                board={board}
                cards={visibleCards.get(list.id) ?? []}
                canEdit={canEdit}
                dragDisabled={!canEdit || filtering}
                {...listHandlers(list)}
              />
            ))}
          </SortableContext>
          <DragOverlay>
            {activeCard && (
              <div className="w-[256px]">
                <CardTile card={activeCard} board={board} overlay />
              </div>
            )}
            {activeList && (
              <ListColumn
                list={activeList}
                board={board}
                cards={activeList.cards}
                canEdit={false}
                dragDisabled
                overlay
                {...listHandlers(activeList)}
              />
            )}
          </DragOverlay>
        </DndContext>

        {canEdit && (
          <div className="w-[272px] shrink-0">
            {addingList ? (
              <div className="rounded-xl bg-[#f1f2f4] p-2">
                <Composer
                  placeholder="Enter list title…"
                  buttonLabel="Add list"
                  onSubmit={async (title) => {
                    await api.post(`/boards/${boardId}/lists`, { title });
                    await refresh();
                  }}
                  onClose={() => setAddingList(false)}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingList(true)}
                className={cx('flex w-full items-center gap-2 rounded-xl bg-white/25 p-3 text-sm font-medium text-white hover:bg-white/35')}
              >
                <Icon name="plus" /> {lists.length ? 'Add another list' : 'Add a list'}
              </button>
            )}
          </div>
        )}
      </div>

      {cardId && <CardModal cardId={cardId} board={board} onClose={() => navigate(`/b/${boardId}`)} />}
      {menuOpen && <BoardMenu board={board} onClose={() => setMenuOpen(false)} />}
      {membersOpen && <MembersModal board={board} onClose={() => setMembersOpen(false)} />}
    </div>
  );
}
