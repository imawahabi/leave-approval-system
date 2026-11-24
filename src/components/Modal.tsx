import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: ReactNode;
}

const sizeMap = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

let openModalCount = 0;
let restorePageScroll: (() => void) | null = null;

function lockPageScroll() {
  if (openModalCount === 0) {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const body = document.body;
    const root = document.documentElement;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      rootOverscroll: root.style.overscrollBehavior,
    };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';
    restorePageScroll = () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      root.style.overscrollBehavior = previous.rootOverscroll;
      window.scrollTo(scrollX, scrollY);
    };
  }
  openModalCount += 1;
  return () => {
    openModalCount -= 1;
    if (openModalCount === 0) {
      restorePageScroll?.();
      restorePageScroll = null;
    }
  };
}

export function Modal({ open, onClose, title, children, size = 'md', footer }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const unlockPageScroll = lockPageScroll();

    // Only focus the dialog container if focus is not already inside it
    if (dialogRef.current && !dialogRef.current.contains(document.activeElement)) {
      dialogRef.current.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== dialogRef.current) return;
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      unlockPageScroll();
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex h-[100dvh] items-end justify-center overflow-hidden overscroll-none p-0 sm:items-center sm:p-4">
      <button type="button" tabIndex={-1} aria-label="إغلاق النافذة" className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`relative flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl animate-slide-up sm:max-h-[90dvh] sm:rounded-2xl ${sizeMap[size]}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h2 id={titleId} className="text-base font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} aria-label="إغلاق النافذة" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-4" style={{ WebkitOverflowScrolling: 'touch' }}>{children}</div>
        {footer && <div className="shrink-0 border-t border-slate-100 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex items-center justify-end gap-2 sm:pb-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
