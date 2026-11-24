import { useEffect, useState } from 'react';

export function useFormCloseGuard(open: boolean, dirty: boolean, onClose: () => void) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (!open || !dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [open, dirty]);

  useEffect(() => { if (!open) setConfirmDiscard(false); }, [open]);

  const requestClose = () => { if (dirty) setConfirmDiscard(true); else onClose(); };
  const discardAndClose = () => { setConfirmDiscard(false); onClose(); };

  return { confirmDiscard, setConfirmDiscard, requestClose, discardAndClose };
}
