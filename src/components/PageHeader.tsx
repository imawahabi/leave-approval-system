import { type ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  desktopVisible?: boolean;
}

export function PageHeader({ title, subtitle, icon, actions, desktopVisible = false }: PageHeaderProps) {
  return (
    <div className={`${actions || desktopVisible ? 'flex' : 'flex lg:hidden'} items-center justify-between gap-3 mb-4 sm:mb-6`}>
      <div className={`${desktopVisible ? 'flex' : 'flex lg:hidden'} items-center gap-2.5 sm:gap-3 min-w-0 flex-1`}>
        {icon && (
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-primary-50 flex items-center justify-center text-primary-700 shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">{title}</h1>
          {subtitle && <p className="text-sm text-slate-600 mt-1 leading-snug line-clamp-2">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
