import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = 'حدث خطأ أثناء تحميل البيانات', onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
        <AlertCircle className="w-7 h-7 text-red-500" />
      </div>
      <h3 className="text-sm font-semibold text-slate-700">{message}</h3>
      {onRetry && (
        <button className="btn-secondary mt-4" onClick={onRetry}>
          <RefreshCw className="w-4 h-4" />
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}
