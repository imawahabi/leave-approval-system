import type { ReactNode } from 'react';

interface BadgeProps {
  label: string;
  color?: string;
  bg?: string;
  dot?: string;
  icon?: ReactNode;
  className?: string;
}

export function Badge({ label, color = 'text-slate-600', bg = 'bg-slate-50 border-slate-200', dot, icon, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap shrink-0 ${bg} ${color} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />}
      {icon}
      <span>{label}</span>
    </span>
  );
}
