import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import type { PublicUser } from '../api';

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export function Spinner({ full }: { full?: boolean }) {
  const s = <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />;
  return full ? <div className="flex h-full items-center justify-center">{s}</div> : s;
}

type Variant = 'primary' | 'secondary' | 'subtle' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-[#0c66e4] text-white hover:bg-[#0055cc]',
  secondary: 'bg-[#091e420f] text-[#172b4d] hover:bg-[#091e4224]',
  subtle: 'bg-transparent text-[#44546f] hover:bg-[#091e4224]',
  danger: 'bg-[#c9372c] text-white hover:bg-[#ae2e24]',
};

export function Button({
  variant = 'secondary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        className,
      )}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        'w-full rounded border-2 border-[#091e4224] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#388bff]',
        className,
      )}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-[#44546f]">{label}</span>
      {children}
    </label>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className="text-sm text-[#c9372c]">{error instanceof Error ? error.message : String(error)}</p>;
}

export function Avatar({ user, size = 28, title }: { user: PublicUser | null; size?: number; title?: string }) {
  const initials = user
    ? user.fullName
        .split(/\s+/)
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?';
  return (
    <span
      title={title ?? (user ? `${user.fullName} (@${user.username})` : 'Deleted user')}
      className="inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4, background: user?.avatarColor ?? '#8590a2' }}
    >
      {initials}
    </span>
  );
}

export function useClickOutside(ref: RefObject<HTMLElement | null>, onOutside: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handler));
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handler);
    };
  }, [ref, onOutside, active]);
}

export function Modal({
  onClose,
  children,
  width = 480,
  title,
}: {
  onClose: () => void;
  children: ReactNode;
  width?: number;
  title?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // Escape inside a text field cancels that field first (like Trello), not the whole dialog.
      const el = e.target as HTMLElement | null;
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
        el.blur();
        return;
      }
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-2 py-6 sm:py-12"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full rounded-xl bg-[#f1f2f4] shadow-2xl" style={{ maxWidth: width }}>
        {title && (
          <div className="flex items-center justify-between px-5 pt-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <CloseButton onClick={onClose} />
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function CloseButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label="Close"
      onClick={onClick}
      className={cx('rounded p-1.5 text-[#44546f] hover:bg-[#091e4224]', className)}
    >
      <Icon name="x" />
    </button>
  );
}

/** A small floating panel anchored below its trigger (Trello-style popover). */
export function Popover({
  trigger,
  title,
  children,
  align = 'left',
  width = 304,
}: {
  trigger: (open: () => void) => ReactNode;
  title: string;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useClickOutside(ref, close, open);
  return (
    <div className="relative" ref={ref}>
      {trigger(() => setOpen((o) => !o))}
      {open && (
        <div
          className={cx(
            'absolute top-full z-40 mt-1 max-h-[70vh] overflow-y-auto rounded-lg bg-white p-3 shadow-[0_8px_12px_#091e4226,0_0_1px_#091e424f]',
            align === 'right' ? 'right-0' : 'left-0',
          )}
          style={{ width: `min(${width}px, calc(100vw - 16px))` }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              close();
            }
          }}
        >
          <div className="relative mb-2 text-center text-sm font-semibold text-[#44546f]">
            {title}
            <CloseButton onClick={close} className="absolute -top-1.5 right-0 p-1" />
          </div>
          {children(close)}
        </div>
      )}
    </div>
  );
}

const paths: Record<string, ReactNode> = {
  x: <path d="M6 6l12 12M18 6L6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  star: <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" />,
  dots: (
    <>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </>
  ),
  user: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0" />,
  users: <path d="M9 11a4 4 0 100-8 4 4 0 000 8zm-7 10a7 7 0 0114 0M17 11a3 3 0 100-6M22 21a6 6 0 00-4-5.6" />,
  tag: <path d="M3 12V3h9l9 9-9 9-9-9zm5-4.5a1 1 0 100 2 1 1 0 000-2z" />,
  check: <path d="M5 12l5 5L20 7" />,
  checklist: <path d="M4 6l2 2 3-3M4 13l2 2 3-3M12 7h8M12 14h8M4 20h16" />,
  clock: <path d="M12 21a9 9 0 100-18 9 9 0 000 18zm0-13v4l3 2" />,
  text: <path d="M4 6h16M4 12h16M4 18h10" />,
  comment: <path d="M4 5h16v11H9l-5 4V5z" />,
  archive: <path d="M3 4h18v4H3zM5 8v12h14V8M10 12h4" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  card: <path d="M4 5h16v14H4zM4 10h16" />,
  image: <path d="M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4" />,
  filter: <path d="M4 5h16l-6 8v6l-4-2v-4z" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  undo: <path d="M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3" />,
  eye: <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3a3 3 0 100-6 3 3 0 000 6z" />,
  logout: <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />,
  key: <path d="M14 10a4 4 0 11-1.2-2.8L21 15v3h-3v-2h-2v-2l-3.2-3.2" />,
};

export function Icon({ name, size = 16, className }: { name: keyof typeof paths | string; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={name === 'dots' ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx('shrink-0', className)}
      aria-hidden
    >
      {paths[name]}
    </svg>
  );
}

/** Text that turns into an input on click (board titles, list titles, card titles). */
export function InlineEdit({
  value,
  onSave,
  className,
  inputClassName,
  disabled,
  multiline,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if (v && v !== value) onSave(v);
    else setDraft(value);
  };

  if (!editing || disabled) {
    return (
      <div className={cx(className, !disabled && 'cursor-pointer')} onClick={() => !disabled && setEditing(true)}>
        {value}
      </div>
    );
  }
  const common = {
    autoFocus: true,
    value: draft,
    onBlur: commit,
    onFocus: (e: { target: HTMLInputElement | HTMLTextAreaElement }) => e.target.select(),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      }
      if (e.key === 'Escape') {
        setDraft(value);
        setEditing(false);
      }
    },
  };
  return multiline ? (
    <textarea
      {...common}
      rows={1}
      onChange={(e) => setDraft(e.target.value)}
      className={cx('w-full resize-none rounded border-2 border-[#388bff] px-2 py-1 outline-none', inputClassName)}
    />
  ) : (
    <input
      {...common}
      onChange={(e) => setDraft(e.target.value)}
      className={cx('rounded border-2 border-[#388bff] px-2 py-1 outline-none', inputClassName)}
    />
  );
}

export function generatePassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}
