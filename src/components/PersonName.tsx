/**
 * Splits Arabic full name into logical tokens respecting compound prefixes
 * like: عبد الله, أبو فهد, آل صباح, بن عيسى, ابن رشد...
 */
export function tokenizeArabicName(fullName: string | null | undefined): string[] {
  if (!fullName) return [];
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const compoundPrefixes = new Set(['عبد', 'ابو', 'أبو', 'آل', 'بن', 'ابن']);

  const tokens: string[] = [];
  let i = 0;
  while (i < parts.length) {
    if (compoundPrefixes.has(parts[i]) && i + 1 < parts.length) {
      tokens.push(`${parts[i]} ${parts[i + 1]}`);
      i += 2;
    } else {
      tokens.push(parts[i]);
      i += 1;
    }
  }
  return tokens;
}

/**
 * Shortens a full name to tripartite form: first name, second name, and last name
 * (الاسم ثلاثي: الأول والثاني والعائلة/الأخير) - للشاشات الصغيرة
 * Example: "محمد عبد الله سالم الأحمد السالم" -> "محمد عبد الله السالم"
 */
export function toTripartiteName(fullName: string | null | undefined): string {
  if (!fullName) return '';
  const tokens = tokenizeArabicName(fullName);
  if (tokens.length <= 3) return fullName.trim();
  return `${tokens[0]} ${tokens[1]} ${tokens[tokens.length - 1]}`;
}

// Alias for backward compatibility
export const shortenName = toTripartiteName;

/**
 * Shortens a full name to quadripartite form: first, second, third, and last name
 * (الاسم رباعي: الأول والثاني والثالث والعائلة/الأخير) - للشاشات الكبيرة
 * Example: "محمد عبد الله سالم الأحمد السالم" -> "محمد عبد الله سالم السالم"
 */
export function toQuadripartiteName(fullName: string | null | undefined): string {
  if (!fullName) return '';
  const tokens = tokenizeArabicName(fullName);
  if (tokens.length <= 4) return fullName.trim();
  return `${tokens[0]} ${tokens[1]} ${tokens[2]} ${tokens[tokens.length - 1]}`;
}

/**
 * Extracts first name and last name
 */
export function getFirstAndLastName(fullName: string | null | undefined): string {
  if (!fullName) return '';
  const tokens = tokenizeArabicName(fullName);
  if (tokens.length <= 1) return fullName.trim();
  return `${tokens[0]} ${tokens[tokens.length - 1]}`;
}

/** The name alone, for use inside sentences and controls with their own styling. */
export function ResponsivePersonName({ name }: { name: string | null | undefined }) {
  return (
    <span title={name ?? undefined}>
      <span className="sm:hidden">{toTripartiteName(name)}</span>
      <span className="hidden sm:inline">{toQuadripartiteName(name)}</span>
    </span>
  );
}

interface PersonNameProps {
  rank?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Renders a person name:
 * - On small screens: tripartite (ثلاثي)
 * - On large screens: quadripartite (رباعي)
 */
export function PersonName({ rank, name, size = 'md', className = '' }: PersonNameProps) {
  const nameSize = size === 'lg' ? 'text-base' : size === 'sm' ? 'text-sm' : 'text-sm';
  const triName = toTripartiteName(name);
  const quadName = toQuadripartiteName(name);

  const nameNode = (
    <span className="inline">
      <span className="sm:hidden">{triName}</span>
      <span className="hidden sm:inline">{quadName}</span>
    </span>
  );

  if (!rank) {
    return (
      <span className={`font-bold text-slate-900 ${nameSize} ${className}`} title={name}>
        {nameNode}
      </span>
    );
  }

  return (
    <span className={className} title={`${rank} / ${name}`}>
      <span className={`font-bold text-slate-900 ${nameSize}`}>{rank}</span>
      <span className="text-slate-400 mx-1">/</span>
      <span className={`font-bold text-slate-900 ${nameSize}`}>{nameNode}</span>
    </span>
  );
}

export function PersonNameStacked({ rank, name, size = 'md' }: { rank?: string | null; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const nameSize = size === 'lg' ? 'text-base' : size === 'sm' ? 'text-sm' : 'text-sm';
  const triName = toTripartiteName(name);
  const quadName = toQuadripartiteName(name);

  return (
    <div title={name}>
      <p className={`font-semibold text-slate-900 ${nameSize}`}>
        <span className="sm:hidden">{triName}</span>
        <span className="hidden sm:inline">{quadName}</span>
      </p>
      {rank && <p className="text-xs text-slate-500 font-medium mt-0.5">{rank}</p>}
    </div>
  );
}
