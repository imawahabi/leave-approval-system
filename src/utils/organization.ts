import type { AssistantUndersecretary, Sector } from '@/types';

export function sectorInUnit(sector: Sector | null | undefined, unitId: string, units: AssistantUndersecretary[]): boolean {
  if (!sector?.assistant_undersecretary_id) return false;
  const directId = sector.assistant_undersecretary_id;
  return directId === unitId || units.some((u) => u.id === directId && u.parent_id === unitId);
}

export function isAssistantOfficeSector(sector: Sector | null | undefined): boolean {
  return !!sector?.assistant_undersecretary && sector.assistant_undersecretary.legacy_sector_id === sector.id;
}

export function formatSectorPath(sector: Sector | null | undefined): string {
  if (!sector) return '-';
  const undersecretary = sector.assistant_undersecretary;
  if (!undersecretary) return sector.name_ar;
  return isAssistantOfficeSector(sector)
    ? undersecretary.name_ar
    : `${undersecretary.name_ar} / ${sector.name_ar}`;
}

export function formatSectorOption(sector: Sector): string {
  return isAssistantOfficeSector(sector)
    ? sector.assistant_undersecretary!.name_ar
    : sector.name_ar;
}
