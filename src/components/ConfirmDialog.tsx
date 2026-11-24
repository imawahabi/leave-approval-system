import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  closeOnConfirm?: boolean;
  error?: string | null;
  context?: ReactNode;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  danger = false,
  busy = false,
  closeOnConfirm = true,
  error,
  context,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) onClose(); }}
      title={title}
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <button className="btn-secondary h-11 w-full sm:w-48" disabled={busy} onClick={onClose}>{cancelLabel}</button>
          <button className={`${danger ? 'btn-danger' : 'btn-primary'} h-11 w-full sm:w-48`} disabled={busy} onClick={() => { onConfirm(); if (closeOnConfirm) onClose(); }}>{confirmLabel}</button>
        </div>
      }
    >
      <div className="space-y-3">
        {context}
        <div className="flex gap-3">
          {danger && (
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
          )}
          <p className="text-sm text-slate-600 leading-relaxed pt-1">{message}</p>
        </div>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}
