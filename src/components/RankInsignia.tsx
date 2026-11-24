export interface RankInsigniaProps {
  rank?: string | null;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

const sizeConfig = {
  xs: { width: 32, height: 28 },
  sm: { width: 38, height: 32 },
  md: { width: 44, height: 38 },
  lg: { width: 54, height: 46 },
  xl: { width: 66, height: 56 },
};

// Civilian grade levels for the administrative job titles, highest first.
// The badge renders simple ascending bars - a neutral seniority indicator.
const gradeLevels: Array<{ match: string; level: number }> = [
  { match: 'مساعد المدير العام', level: 3 },
  { match: 'مساعد مدير عام', level: 3 },
  { match: 'المدير العام', level: 4 },
  { match: 'مدير عام', level: 4 },
  { match: 'مساعد مدير إدارة', level: 3 },
  { match: 'مدير إدارة', level: 3 },
  { match: 'رئيس قسم', level: 2 },
  { match: 'مشرف أول', level: 2 },
  { match: 'مشرف', level: 1 },
  { match: 'موظف أول', level: 1 },
  { match: 'موظف', level: 1 },
];

function gradeLevelFor(title: string): number {
  const clean = title.trim();
  for (const entry of gradeLevels) {
    if (clean.includes(entry.match)) return entry.level;
  }
  return 1;
}

/**
 * Civilian grade badge shown next to a person's name.
 * Renders ascending gold bars whose count reflects the seniority
 * of the person's administrative job title.
 */
export function RankInsignia({ rank, className = '', size = 'md' }: RankInsigniaProps) {
  if (!rank) return null;
  const cfg = sizeConfig[size] || sizeConfig.md;
  const level = gradeLevelFor(rank);
  const bars = [0.45, 0.65, 0.85, 1].slice(4 - level);

  return (
    <div
      className={`inline-flex items-end justify-center gap-[3px] select-none shrink-0 ${className}`}
      title={rank}
      role="img"
      aria-label={rank}
      style={{
        width: `${cfg.width}px`,
        height: `${cfg.height}px`,
        paddingBottom: `${Math.round(cfg.height * 0.18)}px`,
        boxSizing: 'border-box',
      }}
    >
      {bars.map((fraction, i) => (
        <span
          key={i}
          style={{
            width: `${Math.max(3, Math.round(cfg.width * 0.11))}px`,
            height: `${Math.round(cfg.height * 0.62 * fraction)}px`,
            borderRadius: '2px',
            background: 'linear-gradient(180deg, #FBBF24 0%, #D97706 100%)',
            boxShadow: 'inset 0 0 0 1px rgba(146, 64, 14, 0.45)',
            display: 'block',
          }}
        />
      ))}
    </div>
  );
}
