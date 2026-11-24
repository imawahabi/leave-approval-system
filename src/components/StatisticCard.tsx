import type { LucideIcon } from 'lucide-react';

interface StatisticCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  color?: 'primary' | 'amber' | 'emerald' | 'blue' | 'orange' | 'red';
  subtitle?: string;
  loading?: boolean;
}

const colorMap = {
  primary: { bg: 'bg-primary-50', text: 'text-primary-700', icon: 'text-primary-600' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', icon: 'text-amber-600' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: 'text-emerald-600' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'text-blue-600' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-700', icon: 'text-orange-600' },
  red: { bg: 'bg-red-50', text: 'text-red-700', icon: 'text-red-600' },
};

export function StatisticCard({ label, value, icon: Icon, color = 'primary', subtitle, loading }: StatisticCardProps) {
  const c = colorMap[color];
  return (
    <div className="card p-3 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm text-slate-500 font-medium truncate">{label}</p>
          {loading ? (
            <div className="skeleton h-7 sm:h-8 w-14 sm:w-16 mt-2" />
          ) : (
            <p className={`text-xl sm:text-2xl font-bold mt-1 ${c.text}`}>{value}</p>
          )}
          {subtitle && <p className="text-xs text-slate-400 mt-1 truncate">{subtitle}</p>}
        </div>
        <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl ${c.bg} flex items-center justify-center shrink-0`}>
          <Icon className={`w-5 h-5 ${c.icon}`} />
        </div>
      </div>
    </div>
  );
}
