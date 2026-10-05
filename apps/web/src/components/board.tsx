import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Board, BoardList, CardSummary } from '../api';
import { dueStatus, dueStyles, labelTextColor, shortDate } from '../lib';
import { Avatar, Button, CloseButton, cx, Icon, InlineEdit, Popover, useClickOutside } from './ui';

export function CardTile({
  card,
  board,
  dragging,
  overlay,
}: {
  card: CardSummary;
  board: Board;
  dragging?: boolean;
  overlay?: boolean;
}) {
  const labels = card.labelIds.map((id) => board.labels.find((l) => l.id === id)).filter(Boolean);
  const members = card.memberIds.map((id) => board.members.find((m) => m.user.id === id)?.user).filter(Boolean);
  const due = dueStatus(card.dueDate, card.dueComplete);
  const checklistDone = card.checklist.total > 0 && card.checklist.done === card.checklist.total;
  const hasBadges =
    card.dueDate || card.startDate || card.hasDescription || card.commentCount > 0 || card.checklist.total > 0;

  return (
    <div
      className={cx(
        'overflow-hidden rounded-lg bg-white text-sm shadow-[0_1px_1px_#091e4240,0_0_1px_#091e424f]',
        dragging && 'opacity-40',
        overlay && 'rotate-2 shadow-xl',
        !dragging && 'hover:ring-2 hover:ring-[#388bff]',
      )}
    >
      {card.coverColor && <div className="h-8" style={{ background: card.coverColor }} />}
      <div className="px-3 pb-1.5 pt-2">
        {labels.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-1">
            {labels.map((l) => (
              <span
                key={l!.id}
                title={l!.name}
                className="inline-block h-4 min-w-10 max-w-full truncate rounded px-1.5 text-[11px] font-semibold leading-4"
                style={{ background: l!.color, color: labelTextColor(l!.color) }}
              >
                {l!.name}
              </span>
            ))}
          </div>
        )}
        <div className="break-words">{card.title}</div>
        {(hasBadges || members.length > 0) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#44546f]">
            {(card.dueDate || card.startDate) && (
              <span
                className={cx('flex items-center gap-1 rounded px-1 py-0.5', due && dueStyles[due])}
                title={due ? `Due: ${due}` : 'Start date'}
              >
                <Icon name="clock" size={14} />
                {card.startDate && shortDate(card.startDate)}
                {card.startDate && card.dueDate && ' – '}
                {card.dueDate && shortDate(card.dueDate)}
              </span>
            )}
            {card.hasDescription && (
              <span title="This card has a description">
                <Icon name="text" size={14} />
              </span>
            )}
            {card.commentCount > 0 && (
              <span className="flex items-center gap-1" title="Comments">
                <Icon name="comment" size={14} /> {card.commentCount}
              </span>
            )}
            {card.checklist.total > 0 && (
              <span
                className={cx('flex items-center gap-1 rounded px-1 py-0.5', checklistDone && 'bg-[#1f845a] text-white')}
                title="Checklist items"
              >
                <Icon name="checklist" size={14} /> {card.checklist.done}/{card.checklist.total}
              </span>
            )}
            {members.length > 0 && (
              <span className="ml-auto flex -space-x-1">
                {members.map((u) => (
                  <Avatar key={u!.id} user={u!} size={24} />
                ))}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function SortableCard({ card, board, disabled }: { card: CardSummary; board: Board; disabled: boolean }) {
  const navigate = useNavigate();
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: `c:${card.id}`,
    data: { type: 'card', listId: card.listId },
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => navigate(`/b/${board.id}/c/${card.id}`)}
      className="cursor-pointer"
    >
      <CardTile card={card} board={board} dragging={isDragging} />
    </div>
  );
}

/** "Add a card" / "Add a list" style composer. */
export function Composer({
  placeholder,
  buttonLabel,
  onSubmit,
  onClose,
  multiline,
}: {
  placeholder: string;
  buttonLabel: string;
  onSubmit: (value: string) => Promise<unknown> | void;
  onClose: () => void;
  multiline?: boolean;
}) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLFormElement>(null);
  useClickOutside(ref, () => {
    if (!value.trim()) onClose();
  });
  const submit = async () => {
    const v = value.trim();
    if (!v) return;
    setValue('');
    await onSubmit(v);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape') onClose();
  };
  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-2"
    >
      {multiline ? (
        <textarea
          autoFocus
          rows={3}
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          className="w-full resize-none rounded-lg border-0 bg-white px-3 py-2 text-sm shadow-[0_1px_1px_#091e4240] outline-none"
        />
      ) : (
        <input
          autoFocus
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          className="w-full rounded border-2 border-[#388bff] bg-white px-3 py-1.5 text-sm outline-none"
        />
      )}
      <div className="flex items-center gap-1">
        <Button type="submit" variant="primary">
          {buttonLabel}
        </Button>
        <CloseButton onClick={onClose} />
      </div>
    </form>
  );
}

export function ListColumn({
  list,
  board,
  cards,
  canEdit,
  dragDisabled,
  isDragging,
  overlay,
  onAddCard,
  onRename,
  onArchive,
  onArchiveCards,
  onMoveCards,
  dragHandle,
}: {
  list: BoardList;
  board: Board;
  cards: CardSummary[];
  canEdit: boolean;
  dragDisabled: boolean;
  isDragging?: boolean;
  overlay?: boolean;
  onAddCard: (title: string) => Promise<unknown>;
  onRename: (title: string) => void;
  onArchive: () => void;
  onArchiveCards: () => void;
  onMoveCards: (toListId: string) => void;
  dragHandle?: Record<string, unknown>;
}) {
  const [adding, setAdding] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className={cx(
        'flex max-h-full w-[272px] shrink-0 flex-col rounded-xl bg-[#f1f2f4] shadow-sm',
        isDragging && 'opacity-40',
        overlay && 'rotate-2 shadow-xl',
      )}
    >
      <div className="flex items-start gap-1 px-2 pt-2" {...dragHandle}>
        <InlineEdit
          value={list.title}
          onSave={onRename}
          disabled={!canEdit}
          className="min-w-0 flex-1 break-words px-2 py-1.5 text-sm font-semibold"
          inputClassName="w-full text-sm font-semibold"
        />
        {canEdit && (
          <Popover
            title="List actions"
            trigger={(toggle) => (
              <button
                type="button"
                aria-label="List actions"
                onClick={toggle}
                onPointerDown={(e) => e.stopPropagation()}
                className="rounded-lg p-2 text-[#44546f] hover:bg-[#091e4224]"
              >
                <Icon name="dots" />
              </button>
            )}
          >
            {(close) => (
              <ListMenu
                board={board}
                list={list}
                onAdd={() => {
                  close();
                  setAdding(true);
                }}
                onArchive={() => {
                  close();
                  onArchive();
                }}
                onArchiveCards={() => {
                  close();
                  onArchiveCards();
                }}
                onMoveCards={(to) => {
                  close();
                  onMoveCards(to);
                }}
              />
            )}
          </Popover>
        )}
      </div>
      <div className="flex min-h-1 flex-col gap-2 overflow-y-auto px-2 py-1">
        <SortableContext items={cards.map((c) => `c:${c.id}`)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <SortableCard key={card.id} card={card} board={board} disabled={dragDisabled} />
          ))}
        </SortableContext>
        {adding && (
          <div ref={bottomRef}>
            <Composer
              multiline
              placeholder="Enter a title for this card…"
              buttonLabel="Add card"
              onSubmit={async (t) => {
                await onAddCard(t);
                bottomRef.current?.scrollIntoView({ block: 'nearest' });
              }}
              onClose={() => setAdding(false)}
            />
          </div>
        )}
      </div>
      {canEdit && !adding && (
        <div className="p-2">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-[#44546f] hover:bg-[#091e4224]"
          >
            <Icon name="plus" /> Add a card
          </button>
        </div>
      )}
      {!canEdit && <div className="h-2" />}
    </div>
  );
}

function ListMenu({
  board,
  list,
  onAdd,
  onArchive,
  onArchiveCards,
  onMoveCards,
}: {
  board: Board;
  list: BoardList;
  onAdd: () => void;
  onArchive: () => void;
  onArchiveCards: () => void;
  onMoveCards: (toListId: string) => void;
}) {
  const [mode, setMode] = useState<'menu' | 'move'>('menu');
  const item = (label: ReactNode, onClick: () => void) => (
    <button type="button" onClick={onClick} className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-[#091e420f]">
      {label}
    </button>
  );
  if (mode === 'move') {
    const others = board.lists.filter((l) => l.id !== list.id);
    return (
      <div>
        <p className="mb-2 text-xs text-[#626f86]">Move all cards in “{list.title}” to:</p>
        {others.length === 0 && <p className="text-sm text-[#626f86]">No other lists on this board.</p>}
        {others.map((l) => item(l.title, () => onMoveCards(l.id)))}
      </div>
    );
  }
  return (
    <div>
      {item('Add card', onAdd)}
      {list.cards.length > 0 && item('Move all cards in this list…', () => setMode('move'))}
      {list.cards.length > 0 && item('Archive all cards in this list', onArchiveCards)}
      <hr className="my-1" />
      {item('Archive this list', onArchive)}
    </div>
  );
}

export function SortableList(props: Omit<Parameters<typeof ListColumn>[0], 'dragHandle' | 'isDragging'>) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: `l:${props.list.id}`,
    data: { type: 'list' },
    disabled: !props.canEdit,
  });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className="max-h-full">
      <ListColumn {...props} isDragging={isDragging} dragHandle={{ ...attributes, ...listeners }} />
    </div>
  );
}
