import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export function usePendingReviews(): number | null {
  const { canApprove, isAdmin, hasPermission } = useAuth();
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    if (!canApprove) {
      setPendingCount(null);
      return;
    }

    let active = true;
    let latestRequest = 0;

    const refreshCount = async () => {
      const request = ++latestRequest;
      const stages = [
        ...(isAdmin || hasPermission('approve_undersecretary') ? (['undersecretary'] as const) : []),
        ...(isAdmin || hasPermission('approve_minister') ? (['minister'] as const) : []),
      ];

      const results = await Promise.all(
        stages.map((stage) => supabase.rpc('review_queue_scoped', { p_stage: stage }))
      );

      if (active && request === latestRequest && results.every((result) => !result.error)) {
        const total = results.reduce(
          (count, result) =>
            count +
            (result.data || []).filter(
              (record: { approval_status?: string }) => record.approval_status === 'pending'
            ).length,
          0
        );
        setPendingCount(total);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshCount();
    };

    void refreshCount();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('app:review-updated', refreshCount);
    const interval = window.setInterval(refreshCount, 60_000);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('app:review-updated', refreshCount);
      window.clearInterval(interval);
    };
  }, [canApprove, hasPermission, isAdmin, location.pathname]);

  return pendingCount;
}
