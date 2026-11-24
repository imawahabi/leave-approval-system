import { getRankWeight } from '@/constants';
import { normalizeArabic } from '@/utils/arabicSearch';

export interface RankableLeader {
  rank: string | null | undefined;
  job_title: string | null | undefined;
  full_name: string;
  file_number?: string | null;
  id?: string;
}

/** Organisational seniority within the same military rank, and for civilians. */
export function getPositionWeight(jobTitle: string | null | undefined): number {
  const title = normalizeArabic(jobTitle).replace(/\s+/g, ' ');
  if (/^(?:ال)?وكيل(?:\s|$)|^مساعد\s+(?:ال)?وكيل(?:\s|$)/.test(title)) return 0;
  // normalizeArabic turns ئ into ي, so رئيس becomes رييس.
  if (/^رييس\s+(?:ال)?قطاع(?:\s|$)/.test(title)) return 1;
  if (/^مساعد\s+(?:ال)?مدير\s+(?:ال)?عام(?:\s|$)/.test(title)) return 3;
  if (/^(?:ال)?مدير\s+(?:ال)?عام(?:\s|$)/.test(title)) return 2;
  return 4;
}

/**
 * Military rank leads. At equal rank, position leads; legal officers share
 * the rank of their non-legal peers. A civilian's position places them among
 * officers, after officers at the same position.
 */
export function compareLeaders(a: RankableLeader, b: RankableLeader): number {
  const aCivilian = normalizeArabic(a.rank).startsWith('مدني');
  const bCivilian = normalizeArabic(b.rank).startsWith('مدني');
  const aPosition = getPositionWeight(a.job_title);
  const bPosition = getPositionWeight(b.job_title);

  if (!aCivilian && !bCivilian) {
    const byRank = getRankWeight(a.rank) - getRankWeight(b.rank);
    if (byRank) return byRank;
  }

  const byPosition = aPosition - bPosition;
  if (byPosition) return byPosition;
  if (aCivilian !== bCivilian) return aCivilian ? 1 : -1;

  return a.full_name.localeCompare(b.full_name, 'ar')
    || (a.file_number ?? '').localeCompare(b.file_number ?? '', 'ar', { numeric: true })
    || (a.id ?? '').localeCompare(b.id ?? '');
}
