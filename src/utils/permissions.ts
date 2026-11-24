import type { AssistantUndersecretary, LeadershipMember, PermissionCode, PermissionGrant, Sector } from '@/types';

/** Mirrors the organization-scope rules used by the database permission checks. */
export function permissionCoversMember(
  grants: PermissionGrant[],
  permission: PermissionCode,
  member: Pick<LeadershipMember, 'sector_id' | 'department_id'>,
  sectors: Sector[],
  units: AssistantUndersecretary[],
  isAdmin = false,
): boolean {
  if (isAdmin) return true;
  const sectorById = new Map(sectors.map((sector) => [sector.id, sector]));
  const unitById = new Map(units.map((unit) => [unit.id, unit]));

  return grants.some((grant) => {
    if (grant.permission_code !== permission) return false;
    if (grant.scope_kind === 'all') return true;
    if (!grant.scope_id || grant.scope_kind === 'own') return false;
    if (grant.scope_kind === 'department') return member.department_id === grant.scope_id;

    if (grant.scope_kind === 'sector') {
      let current = member.sector_id ? sectorById.get(member.sector_id) : undefined;
      while (current) {
        if (current.id === grant.scope_id) return true;
        current = current.parent_sector_id ? sectorById.get(current.parent_sector_id) : undefined;
      }
      return false;
    }

    const targetUnitIds = new Set<string>();
    const targetUnit = unitById.get(grant.scope_id);
    if (!targetUnit) return false;
    targetUnitIds.add(targetUnit.id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const unit of units) {
        if (unit.parent_id && targetUnitIds.has(unit.parent_id) && !targetUnitIds.has(unit.id)) {
          targetUnitIds.add(unit.id);
          changed = true;
        }
      }
    }

    const sector: Sector | undefined = member.sector_id ? sectorById.get(member.sector_id) : undefined;
    if (!sector) return false;
    if (sector.assistant_undersecretary_id && targetUnitIds.has(sector.assistant_undersecretary_id)) return true;
    return units.some((unit) => targetUnitIds.has(unit.id) && unit.legacy_sector_id === sector!.id);
  });
}
