import { format, isSameYear } from 'date-fns';

export type DueStatus = 'complete' | 'overdue' | 'soon' | 'normal';

export function dueStatus(dueDate: string | null, complete: boolean): DueStatus | null {
  if (!dueDate) return null;
  if (complete) return 'complete';
  const diff = new Date(dueDate).getTime() - Date.now();
  if (diff < 0) return 'overdue';
  if (diff < 24 * 60 * 60 * 1000) return 'soon';
  return 'normal';
}

export const dueStyles: Record<DueStatus, string> = {
  complete: 'bg-[#1f845a] text-white',
  overdue: 'bg-[#c9372c] text-white',
  soon: 'bg-[#f5cd47] text-[#172b4d]',
  normal: '',
};

export const dueLabels: Record<DueStatus, string> = {
  complete: 'Complete',
  overdue: 'Overdue',
  soon: 'Due soon',
  normal: '',
};

export function shortDate(d: string | Date) {
  const date = new Date(d);
  return format(date, isSameYear(date, new Date()) ? 'MMM d' : 'MMM d, yyyy');
}

export function dateTime(d: string | Date) {
  const date = new Date(d);
  return format(date, isSameYear(date, new Date()) ? "MMM d 'at' HH:mm" : "MMM d, yyyy 'at' HH:mm");
}

/** Value for <input type="datetime-local"> in the user's local time zone. */
export function toLocalInput(d: string | null, withTime = true) {
  if (!d) return '';
  return format(new Date(d), withTime ? "yyyy-MM-dd'T'HH:mm" : 'yyyy-MM-dd');
}

export const GAP = 65536;

/** Position for an item placed at `index` in `items` (which already excludes the moved item). */
export function positionAt(items: { position: number }[], index: number) {
  const prev = items[index - 1]?.position;
  const next = items[index]?.position;
  if (prev === undefined && next === undefined) return GAP;
  if (prev === undefined) return next! / 2;
  if (next === undefined) return prev + GAP;
  return (prev + next) / 2;
}

/** Readable text color for a label background. */
export function labelTextColor(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? '#172b4d' : '#ffffff';
}
