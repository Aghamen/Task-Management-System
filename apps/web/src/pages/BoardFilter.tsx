import type { Board, CardSummary } from '../api';
import { useMe } from '../auth';
import { Avatar, Button, cx, Icon, Input, Popover } from '../components/ui';
import { dueStatus, labelTextColor } from '../lib';

export interface CardFilter {
  keyword: string;
  labelIds: string[];
  memberIds: string[]; // 'none' = cards with no members
  due: '' | 'overdue' | 'soon' | 'none' | 'complete';
}

export const emptyFilter: CardFilter = { keyword: '', labelIds: [], memberIds: [], due: '' };

export const isFilterActive = (f: CardFilter) =>
  f.keyword.trim() !== '' || f.labelIds.length > 0 || f.memberIds.length > 0 || f.due !== '';

export function matchesFilter(card: CardSummary, f: CardFilter, board: Board) {
  const kw = f.keyword.trim().toLowerCase();
  if (kw) {
    const labelNames = card.labelIds.map((id) => board.labels.find((l) => l.id === id)?.name.toLowerCase() ?? '');
    if (!card.title.toLowerCase().includes(kw) && !labelNames.some((n) => n.includes(kw))) return false;
  }
  if (f.labelIds.length && !f.labelIds.some((id) => card.labelIds.includes(id))) return false;
  if (f.memberIds.length) {
    const ok = f.memberIds.some((id) => (id === 'none' ? card.memberIds.length === 0 : card.memberIds.includes(id)));
    if (!ok) return false;
  }
  if (f.due) {
    const s = dueStatus(card.dueDate, card.dueComplete);
    if (f.due === 'none' ? card.dueDate !== null : s !== f.due) return false;
  }
  return true;
}

const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export function FilterPopover({
  board,
  filter,
  onChange,
}: {
  board: Board;
  filter: CardFilter;
  onChange: (f: CardFilter) => void;
}) {
  const me = useMe();
  const active = isFilterActive(filter);
  const check = (on: boolean) => (
    <span
      className={cx(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border-2',
        on ? 'border-[#0c66e4] bg-[#0c66e4] text-white' : 'border-[#8590a2]',
      )}
    >
      {on && <Icon name="check" size={12} />}
    </span>
  );
  const row = (on: boolean, onClick: () => void, children: React.ReactNode, key: string) => (
    <button key={key} type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-[#091e420f]">
      {check(on)}
      {children}
    </button>
  );
  return (
    <Popover
      title="Filter"
      align="right"
      trigger={(t) => (
        <button
          type="button"
          onClick={t}
          className={cx('flex items-center gap-1 rounded px-2 py-1.5 text-sm hover:bg-white/20', active && 'bg-white/90 text-[#172b4d] hover:bg-white')}
        >
          <Icon name="filter" /> Filter
        </button>
      )}
    >
      {() => (
        <div className="space-y-3 text-sm text-[#172b4d]">
          <div>
            <p className="mb-1 text-xs font-semibold text-[#44546f]">Keyword</p>
            <Input
              autoFocus
              value={filter.keyword}
              placeholder="Search cards…"
              onChange={(e) => onChange({ ...filter, keyword: e.target.value })}
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-[#44546f]">Members</p>
            {row(filter.memberIds.includes('none'), () => onChange({ ...filter, memberIds: toggle(filter.memberIds, 'none') }), 'No members', 'none')}
            {row(
              filter.memberIds.includes(me.id),
              () => onChange({ ...filter, memberIds: toggle(filter.memberIds, me.id) }),
              <>
                <Avatar user={me} size={22} /> Cards assigned to me
              </>,
              'me',
            )}
            {board.members
              .filter((m) => m.user.id !== me.id)
              .map((m) =>
                row(
                  filter.memberIds.includes(m.user.id),
                  () => onChange({ ...filter, memberIds: toggle(filter.memberIds, m.user.id) }),
                  <>
                    <Avatar user={m.user} size={22} /> {m.user.fullName}
                  </>,
                  m.user.id,
                ),
              )}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-[#44546f]">Due date</p>
            {(
              [
                ['none', 'No dates'],
                ['overdue', 'Overdue'],
                ['soon', 'Due in the next day'],
                ['complete', 'Marked as complete'],
              ] as const
            ).map(([v, label]) => row(filter.due === v, () => onChange({ ...filter, due: filter.due === v ? '' : v }), label, v))}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-[#44546f]">Labels</p>
            {board.labels.map((l) =>
              row(
                filter.labelIds.includes(l.id),
                () => onChange({ ...filter, labelIds: toggle(filter.labelIds, l.id) }),
                <span className="h-7 flex-1 truncate rounded px-2 leading-7" style={{ background: l.color, color: labelTextColor(l.color) }}>
                  {l.name}
                </span>,
                l.id,
              ),
            )}
          </div>
          {active && (
            <Button className="w-full" onClick={() => onChange(emptyFilter)}>
              Clear filter
            </Button>
          )}
        </div>
      )}
    </Popover>
  );
}
