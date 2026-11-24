import { useEffect, useMemo, useState } from 'react';
import { permissionDefinitions, permissionScopeLabels } from '@/constants';
import type { AccountType, PermissionCode, PermissionGrantDraft, PermissionScopeKind } from '@/types';

type OrgOption = { id: string; name_ar: string };

interface AccessGrantBuilderProps {
  accountType: AccountType;
  grants: PermissionGrantDraft[];
  onChange: (grants: PermissionGrantDraft[]) => void;
  sectors: OrgOption[];
  departments: OrgOption[];
  assistants: OrgOption[];
  disabled?: boolean;
}

const approverPermissions: PermissionCode[] = [
  'approve_undersecretary',
  'approve_minister',
  'return_review_pending',
];

const administratorOnlyPermissions: PermissionCode[] = [
  'approve_undersecretary',
  'approve_minister',
  'return_review_pending',
  'manage_users',
  'manage_organization',
  'manage_leave_types',
];

const scopeKindsFor = (permission: PermissionCode, accountType: AccountType): PermissionScopeKind[] => {
  if (accountType === 'approver') return ['all', 'sector', 'department', 'assistant_undersecretary'];
  if (permission === 'edit_own_leave' || permission === 'cancel_own_leave') {
    return ['own', 'all', 'sector', 'department', 'assistant_undersecretary'];
  }
  return ['all', 'sector', 'department', 'assistant_undersecretary'];
};

export function AccessGrantBuilder({
  accountType,
  grants,
  onChange,
  sectors,
  departments,
  assistants,
  disabled = false,
}: AccessGrantBuilderProps) {
  const availablePermissions = useMemo(() => {
    if (accountType === 'admin') return [];
    if (accountType === 'approver') {
      return permissionDefinitions.filter((item) => approverPermissions.includes(item.code));
    }
    return permissionDefinitions.filter((item) => !administratorOnlyPermissions.includes(item.code));
  }, [accountType]);
  const [permission, setPermission] = useState<PermissionCode>(availablePermissions[0]?.code ?? 'view_leaders');
  const [scopeKind, setScopeKind] = useState<PermissionScopeKind>('all');
  const [scopeId, setScopeId] = useState('');

  useEffect(() => {
    if (!availablePermissions.some((item) => item.code === permission)) {
      setPermission(availablePermissions[0]?.code ?? 'view_leaders');
    }
  }, [availablePermissions, permission]);

  useEffect(() => {
    const availableScopes = scopeKindsFor(permission, accountType);
    if (!availableScopes.includes(scopeKind)) {
      setScopeKind(availableScopes[0] ?? 'all');
      setScopeId('');
    }
  }, [accountType, permission, scopeKind]);

  const scopeOptions = scopeKind === 'sector' ? sectors : scopeKind === 'department' ? departments : assistants;
  const availableScopes = scopeKindsFor(permission, accountType);

  const addGrant = () => {
    if (accountType === 'admin') return;
    if (scopeKind !== 'all' && scopeKind !== 'own' && !scopeId) return;
    const nextGrant: PermissionGrantDraft = {
      permission_code: permission,
      scope_kind: scopeKind,
      scope_id: scopeKind === 'all' || scopeKind === 'own' ? null : scopeId,
    };
    const exists = grants.some((grant) =>
      grant.permission_code === nextGrant.permission_code
      && grant.scope_kind === nextGrant.scope_kind
      && grant.scope_id === nextGrant.scope_id,
    );
    if (exists) return;
    onChange([...grants, nextGrant]);
  };

  const removeGrant = (target: PermissionGrantDraft) => {
    onChange(grants.filter((grant) => !(
      grant.permission_code === target.permission_code
      && grant.scope_kind === target.scope_kind
      && grant.scope_id === target.scope_id
    )));
  };

  const optionName = (id: string | null) => {
    if (!id) return '';
    return [...sectors, ...departments, ...assistants].find((option) => option.id === id)?.name_ar ?? id;
  };

  if (accountType === 'admin') {
    return (
      <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">
        مدير النظام يمتلك صلاحية كاملة تلقائياً، ولا يحتاج إلى منح صلاحيات أو نطاقات إضافية.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <label className="text-sm font-medium text-slate-700 md:col-span-2">
          الصلاحية
          <select
            className="input-field mt-1"
            value={permission}
            disabled={disabled || !availablePermissions.length}
            onChange={(event) => {
              setPermission(event.target.value as PermissionCode);
              setScopeKind('all');
              setScopeId('');
            }}
          >
            {availablePermissions.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          النطاق
          <select
            className="input-field mt-1"
            value={scopeKind}
            disabled={disabled}
            onChange={(event) => { setScopeKind(event.target.value as PermissionScopeKind); setScopeId(''); }}
          >
            {availableScopes.map((scope) => <option key={scope} value={scope}>{permissionScopeLabels[scope]}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          الوحدة التنظيمية
          <select
            className="input-field mt-1"
            value={scopeId}
            disabled={disabled || scopeKind === 'all' || scopeKind === 'own'}
            onChange={(event) => setScopeId(event.target.value)}
          >
            <option value="">{scopeKind === 'all' || scopeKind === 'own' ? 'غير مطلوب' : 'اختر الوحدة'}</option>
            {scopeOptions.map((option) => <option key={option.id} value={option.id}>{option.name_ar}</option>)}
          </select>
        </label>
      </div>
      <button
        type="button"
        className="btn-secondary"
        disabled={disabled || (scopeKind !== 'all' && scopeKind !== 'own' && !scopeId)}
        onClick={addGrant}
      >
        إضافة الصلاحية المحددة
      </button>

      <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
        <div className="px-4 py-3 bg-slate-50 text-sm font-bold text-slate-800">
          الصلاحيات المحددة ({grants.length})
        </div>
        {!grants.length ? (
          <p className="p-4 text-sm text-amber-700 bg-amber-50">لم تتم إضافة صلاحيات بعد. لن يستطيع الحساب الوصول إلى بيانات أو تنفيذ عمليات.</p>
        ) : grants.map((grant) => (
          <div key={`${grant.permission_code}-${grant.scope_kind}-${grant.scope_id ?? 'none'}`} className="p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{permissionDefinitions.find((item) => item.code === grant.permission_code)?.label ?? grant.permission_code}</p>
              <p className="text-xs text-slate-500">{permissionScopeLabels[grant.scope_kind]}{grant.scope_id ? ` - ${optionName(grant.scope_id)}` : ''}</p>
            </div>
            <button type="button" className="text-xs text-red-700 hover:text-red-900" disabled={disabled} onClick={() => removeGrant(grant)}>إزالة</button>
          </div>
        ))}
      </div>
    </div>
  );
}
