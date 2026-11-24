import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { BarChart3, Download, Filter, Printer, FileText, X, RotateCcw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSectors, useLeaveTypes, useAssistantUndersecretaries } from '@/hooks/useData';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Skeleton } from '@/components/Skeleton';
import { PrintReportHeader, PrintReportFooter } from '@/components/PrintReportHeader';
import { PersonName } from '@/components/PersonName';
import { DatePicker } from '@/components/DatePicker';
import { statusConfig } from '@/constants';
import { formatDate, formatDayCount, getLeaveStatus, parseISODate, todayInKuwait } from '@/utils/date';
import type { LeadershipLeave, LeaveStatus } from '@/types';
import { formatSectorOption, formatSectorPath, sectorInUnit } from '@/utils/organization';

type ReportType = 'leaves_in_period' | 'by_sector' | 'by_month' | 'by_member';

const reportTypeLabels: Record<ReportType, string> = {
  leaves_in_period: 'تقرير الإجازات في فترة',
  by_sector: 'تقرير الإجازات حسب القطاع',
  by_month: 'تقرير الإجازات حسب الشهر',
  by_member: 'تقرير الإجازات حسب الموظف',
};

function csvCell(value: string | number): string {
  const text = String(value);
  // Quoting preserves commas and newlines; the leading apostrophe prevents spreadsheet formulas.
  const safe = /^[\s]*[=+@\-\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function csvRow(...cells: Array<string | number>): string {
  return cells.map(csvCell).join(',') + '\r\n';
}

export function ReportsPage() {
  const { sectors } = useSectors();
  const { undersecretaries } = useAssistantUndersecretaries();
  const { leaveTypes } = useLeaveTypes();
  const [leaves, setLeaves] = useState<LeadershipLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sectorFilter, setSectorFilter] = useState('');
  const [undersecretaryFilter, setUndersecretaryFilter] = useState('');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('');
  const [reportType, setReportType] = useState<ReportType>('leaves_in_period');
  const [showFilters, setShowFilters] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);
  const requestId = useRef(0);

  const fetchReport = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    let query = supabase
      .from('leadership_leaves')
      .select('*, leave_type:leave_types(*), leadership_member:leadership_member_id(*, sector:sectors(*, assistant_undersecretary:assistant_undersecretaries!sectors_assistant_undersecretary_id_fkey(*)))')
      .eq('approval_status', 'approved')
      .neq('status', 'cancelled')
      .order('start_date', { ascending: false });
    if (dateFrom) query = query.gte('end_date', dateFrom);
    if (dateTo) query = query.lte('start_date', dateTo);
    if (leaveTypeFilter) query = query.eq('leave_type_id', leaveTypeFilter);
    const { data, error } = await query;
    if (currentRequest !== requestId.current) return;
    if (error) { setError(error.message); setLoading(false); return; }
    let result = (data as LeadershipLeave[]) ?? [];
    if (undersecretaryFilter) result = result.filter((l) => sectorInUnit(l.leadership_member?.sector, undersecretaryFilter, undersecretaries));
    if (sectorFilter) result = result.filter((l) => l.leadership_member?.sector_id === sectorFilter || l.leadership_member?.sector?.id === sectorFilter);
    setLeaves(result);
    setLoading(false);
  }, [dateFrom, dateTo, undersecretaryFilter, undersecretaries, sectorFilter, leaveTypeFilter]);

  useEffect(() => {
    void fetchReport();
    return () => { requestId.current += 1; };
  }, [fetchReport]);

  const reportData = useMemo(() => {
    if (reportType === 'by_sector') {
      const map = new Map<string, { name: string; count: number; days: number }>();
      leaves.forEach((l) => {
        const name = l.leadership_member?.sector ? formatSectorPath(l.leadership_member.sector) : 'غير محدد';
        const e = map.get(name) ?? { name, count: 0, days: 0 };
        e.count++; e.days += l.total_days;
        map.set(name, e);
      });
      return Array.from(map.values()).sort((a, b) => b.count - a.count);
    }
    if (reportType === 'by_month') {
      const map = new Map<string, { name: string; count: number; days: number }>();
      const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
      leaves.forEach((l) => {
        const d = parseISODate(l.start_date);
        const name = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
        const e = map.get(name) ?? { name, count: 0, days: 0 };
        e.count++; e.days += l.total_days;
        map.set(name, e);
      });
      return Array.from(map.values()).sort((a, b) => b.count - a.count);
    }
    if (reportType === 'by_member') {
      const map = new Map<string, { name: string; rank: string; count: number; days: number }>();
      leaves.forEach((l) => {
        if (!l.leadership_member) return;
        const mid = l.leadership_member.id;
        const e = map.get(mid) ?? { name: l.leadership_member.full_name, rank: l.leadership_member.rank, count: 0, days: 0 };
        e.count++; e.days += l.total_days;
        map.set(mid, e);
      });
      return Array.from(map.values()).sort((a, b) => b.days - a.days);
    }
    return leaves.map((l) => ({
      name: l.leadership_member?.full_name ?? '-',
      rank: l.leadership_member?.rank ?? '-',
      type: l.leave_type?.name_ar ?? '-',
      start: l.start_date,
      end: l.end_date,
      days: l.total_days,
      status: getLeaveStatus(l.start_date, l.end_date, l.status),
    }));
  }, [leaves, reportType]);

  const dateRangeLabel = useMemo(() => {
    const parts: string[] = [];
    if (dateFrom) parts.push(`من ${formatDate(dateFrom)}`);
    if (dateTo) parts.push(`إلى ${formatDate(dateTo)}`);
    return parts.length > 0 ? parts.join(' ') : 'كل الفترات';
  }, [dateFrom, dateTo]);

  const sectorLabel = useMemo(() => {
    const selectedSector = sectorFilter ? sectors.find((s) => s.id === sectorFilter) : null;
    const sectorName = selectedSector ? formatSectorOption(selectedSector) : null;
    const underName = undersecretaryFilter ? undersecretaries.find((u) => u.id === undersecretaryFilter)?.name_ar : null;
    return [underName, sectorName].filter(Boolean).join(' / ') || 'كل القطاعات';
  }, [undersecretaryFilter, undersecretaries, sectorFilter, sectors]);

  const exportCSV = () => {
    let csv = '';
    if (reportType === 'leaves_in_period') {
      csv = csvRow('المسمى الوظيفي', 'الاسم', 'النوع', 'البداية', 'النهاية', 'المدة', 'الحالة');
      (reportData as Array<{ name: string; rank: string; type: string; start: string; end: string; days: number; status: LeaveStatus }>).forEach((r) => {
        csv += csvRow(r.rank, r.name, r.type, r.start, r.end, r.days, statusConfig[r.status]?.label ?? r.status);
      });
    } else if (reportType === 'by_member') {
      csv = csvRow('المسمى الوظيفي', 'الاسم', 'عدد الإجازات', 'إجمالي الأيام');
      (reportData as Array<{ name: string; rank: string; count: number; days: number }>).forEach((r) => {
        csv += csvRow(r.rank, r.name, r.count, r.days);
      });
    } else {
      csv = csvRow('الاسم', 'عدد الإجازات', 'إجمالي الأيام');
      (reportData as Array<{ name: string; count: number; days: number }>).forEach((r) => {
        csv += csvRow(r.name, r.count, r.days);
      });
    }
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_${reportType}_${todayInKuwait()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (!loading && reportData.length > 0) window.print();
  };

  if (error) return <ErrorState message={error} onRetry={fetchReport} />;

  return (
    <div className="animate-fade-in">
      <PrintReportHeader title={reportTypeLabels[reportType]} subtitle={sectorLabel} dateRange={dateRangeLabel} itemCount={leaves.length} totalDays={leaves.reduce((sum, leave) => sum + leave.total_days, 0)} />

      <div className="no-print">
        <PageHeader
          title="التقارير"
          subtitle="تقارير إجازات الموظفين"
          icon={<BarChart3 className="w-5 h-5" />}
          actions={
            <div className="flex items-center gap-2">
              <button className="btn-secondary" onClick={handlePrint} disabled={loading || reportData.length === 0}>
                <Printer className="w-4 h-4" /> <span className="hidden sm:inline">طباعة</span>
              </button>
              <button className="btn-secondary" onClick={exportCSV} disabled={loading || reportData.length === 0}>
                <Download className="w-4 h-4" /> <span className="hidden sm:inline">تصدير CSV</span>
              </button>
            </div>
          }
        />
      </div>

      {/* Filters */}
      <div className="card p-4 mb-4 no-print">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2"><Filter className="w-4 h-4 text-slate-400" /><span className="text-sm font-medium text-slate-600">الفلاتر</span></div>
          <button type="button" className="btn-secondary lg:hidden text-xs py-2" onClick={() => setShowFilters((value) => !value)} aria-expanded={showFilters}>{showFilters ? 'إخفاء الفلاتر' : 'عرض الفلاتر'}</button>
        </div>
        <div className={`${showFilters ? 'grid' : 'hidden'} lg:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3`}>
          <DatePicker
            label="من تاريخ"
            value={dateFrom}
            onChange={setDateFrom}
            max={dateTo || undefined}
          />
          <DatePicker
            label="إلى تاريخ"
            value={dateTo}
            onChange={setDateTo}
            min={dateFrom || undefined}
          />
          <div>
            <label className="block text-xs text-slate-500 mb-1">المستوى التنظيمي</label>
            <select className="input-field mobile-filter-control" aria-label="المستوى التنظيمي" value={undersecretaryFilter} onChange={(e) => { setUndersecretaryFilter(e.target.value); setSectorFilter(''); }}>
              <option value="">الكل</option>
              {undersecretaries.map((u) => <option key={u.id} value={u.id}>{u.name_ar}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">القطاع</label>
            <select className="input-field mobile-filter-control" aria-label="القطاع" value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)}>
              <option value="">كل القطاعات</option>
              {sectors.filter((s) => !undersecretaryFilter || sectorInUnit(s, undersecretaryFilter, undersecretaries)).map((s) => <option key={s.id} value={s.id}>{formatSectorOption(s)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">نوع الإجازة</label>
            <select className="input-field mobile-filter-control" aria-label="نوع الإجازة" value={leaveTypeFilter} onChange={(e) => setLeaveTypeFilter(e.target.value)}>
              <option value="">كل الأنواع</option>
              {leaveTypes.map((t) => <option key={t.id} value={t.id}>{t.name_ar}</option>)}
            </select>
          </div>
        </div>
        {(!!dateFrom || !!dateTo || !!undersecretaryFilter || !!sectorFilter || !!leaveTypeFilter) && (
          <div className="flex items-center flex-wrap gap-2 pt-3 mt-3 border-t border-slate-100">
            <span className="text-xs text-slate-400">تصفية نشطة:</span>
            {dateFrom && (
              <span className="inline-flex items-center gap-1 text-xs bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-0.5 rounded-full">
                من: {dateFrom}
                <button type="button" onClick={() => setDateFrom('')} aria-label="إزالة تاريخ البداية" className="hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            )}
            {dateTo && (
              <span className="inline-flex items-center gap-1 text-xs bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-0.5 rounded-full">
                إلى: {dateTo}
                <button type="button" onClick={() => setDateTo('')} aria-label="إزالة تاريخ النهاية" className="hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            )}
            {sectorFilter && (
              <span className="inline-flex items-center gap-1 text-xs bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-0.5 rounded-full">
                القطاع: {sectors.find((s) => s.id === sectorFilter) ? formatSectorOption(sectors.find((s) => s.id === sectorFilter)!) : sectorFilter}
                <button type="button" onClick={() => setSectorFilter('')} aria-label="إزالة فلتر القطاع" className="hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            )}
            {undersecretaryFilter && (
              <span className="inline-flex items-center gap-1 text-xs bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-0.5 rounded-full">
                المستوى التنظيمي: {undersecretaries.find((u) => u.id === undersecretaryFilter)?.name_ar ?? undersecretaryFilter}
                <button type="button" onClick={() => { setUndersecretaryFilter(''); setSectorFilter(''); }} aria-label="إزالة فلتر المستوى التنظيمي" className="hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            )}
            {leaveTypeFilter && (
              <span className="inline-flex items-center gap-1 text-xs bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-0.5 rounded-full">
                النوع: {leaveTypes.find((t) => t.id === leaveTypeFilter)?.name_ar ?? leaveTypeFilter}
                <button type="button" onClick={() => setLeaveTypeFilter('')} aria-label="إزالة فلتر نوع الإجازة" className="hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
                setSectorFilter('');
                setUndersecretaryFilter('');
                setLeaveTypeFilter('');
              }}
              className="text-xs text-red-600 hover:text-red-800 underline mr-1 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> مسح الفلاتر
            </button>
          </div>
        )}
      </div>

      {/* Report type selector */}
      <div className="flex gap-2 mb-4 no-print overflow-x-auto pb-1 -mx-1 px-1">
        {(Object.keys(reportTypeLabels) as ReportType[]).map((key) => (
          <button
            key={key}
            onClick={() => setReportType(key)}
            className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${reportType === key ? 'bg-primary-700 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
          >
            {reportTypeLabels[key]}
          </button>
        ))}
      </div>

      {/* Report data */}
      <div className="card-elevated overflow-hidden print-report-frame">
        {loading ? (
          <div className="p-6"><Skeleton className="h-64 w-full" /></div>
        ) : reportData.length === 0 ? (
          <EmptyState icon={<FileText className="w-7 h-7" />} title="لا توجد بيانات" message="لا توجد إجازات مطابقة للفلاتر المحددة" />
        ) : (
          <div className="overflow-x-auto -mx-3 sm:mx-0 print-table-scroll">
            <div className="min-w-[640px] print-table-inner">
            <table className="w-full print-report-table">
              <thead>
                <tr className="bg-slate-50 border-b-2 border-slate-200">
                  {reportType === 'leaves_in_period' ? (
                    <>
                      <th className="table-header">م</th>
                      <th className="table-header">المسمى الوظيفي / الاسم</th>
                      <th className="table-header">نوع الإجازة</th>
                      <th className="table-header">البداية</th>
                      <th className="table-header">النهاية</th>
                      <th className="table-header">المدة</th>
                      <th className="table-header">الحالة</th>
                    </>
                  ) : reportType === 'by_member' ? (
                    <>
                      <th className="table-header">م</th>
                      <th className="table-header">المسمى الوظيفي / الاسم</th>
                      <th className="table-header">عدد الإجازات</th>
                      <th className="table-header">إجمالي الأيام</th>
                    </>
                  ) : (
                    <>
                      <th className="table-header">م</th>
                      <th className="table-header">التصنيف</th>
                      <th className="table-header">عدد الإجازات</th>
                      <th className="table-header">إجمالي الأيام</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportType === 'leaves_in_period' && (
                  (reportData as Array<{ name: string; rank: string; type: string; start: string; end: string; days: number; status: LeaveStatus }>).map((r, i) => {
                    const sc = statusConfig[r.status];
                    return (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="table-cell text-slate-400">{i + 1}</td>
                        <td className="table-cell">
                          <PersonName rank={r.rank} name={r.name} />
                        </td>
                        <td className="table-cell">{r.type}</td>
                        <td className="table-cell">{formatDate(r.start)}</td>
                        <td className="table-cell">{formatDate(r.end)}</td>
                        <td className="table-cell font-semibold">{formatDayCount(r.days)}</td>
                        <td className="table-cell">
                          <Badge label={sc.label} color={sc.color} bg={sc.bg} dot={sc.dot} />
                        </td>
                      </tr>
                    );
                  })
                )}
                {reportType === 'by_member' && (
                  (reportData as Array<{ name: string; rank: string; count: number; days: number }>).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="table-cell text-slate-400">{i + 1}</td>
                      <td className="table-cell">
                          <PersonName rank={r.rank} name={r.name} />
                      </td>
                      <td className="table-cell font-bold text-primary-700">{r.count}</td>
                      <td className="table-cell text-slate-500">{formatDayCount(r.days)}</td>
                    </tr>
                  ))
                )}
                {(reportType === 'by_sector' || reportType === 'by_month') && (
                  (reportData as Array<{ name: string; count: number; days: number }>).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="table-cell text-slate-400">{i + 1}</td>
                      <td className="table-cell font-semibold">{r.name}</td>
                      <td className="table-cell font-bold text-primary-700">{r.count}</td>
                      <td className="table-cell text-slate-500">{formatDayCount(r.days)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {reportData.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                    {reportType === 'leaves_in_period' ? (
                      <>
                        <td className="table-cell font-semibold" colSpan={2}>إجمالي الإجازات</td>
                        <td className="table-cell text-lg font-bold text-primary-700">{reportData.length}</td>
                        <td className="table-cell text-slate-500 text-xs" colSpan={2}>إجمالي الأيام</td>
                        <td className="table-cell text-slate-500 font-normal">
                          {formatDayCount((reportData as Array<{ days: number }>).reduce((s, r) => s + r.days, 0))}
                        </td>
                        <td className="table-cell"></td>
                      </>
                    ) : (
                      <>
                        <td className="table-cell" colSpan={2}>الإجمالي</td>
                        <td className="table-cell text-lg font-bold text-primary-700">
                          {(reportData as Array<{ count: number }>).reduce((s, r) => s + r.count, 0)}
                        </td>
                        <td className="table-cell text-slate-500 font-normal">
                          {formatDayCount((reportData as Array<{ days: number }>).reduce((s, r) => s + r.days, 0))}
                        </td>
                      </>
                    )}
                  </tr>
                </tfoot>
              )}
            </table>
            </div>
          </div>
        )}
      </div>

      <section className="card mt-4 p-4 no-print" aria-live="polite">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div><h2 className="text-sm font-bold text-slate-900">معاينة: {reportTypeLabels[reportType]}</h2><p className="text-xs text-slate-500 mt-1">{dateRangeLabel} · {sectorLabel} · {leaveTypeFilter ? leaveTypes.find((type) => type.id === leaveTypeFilter)?.name_ar : 'كل أنواع الإجازات'}</p></div>
          <div className="flex items-center gap-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 shrink-0">
            <span className="text-xs font-medium text-slate-600">إجمالي الإجازات</span>
            <strong className="text-lg leading-none font-bold text-teal-800">{loading ? '…' : leaves.length}</strong>
            {!loading && <span className="text-xs text-slate-500 border-r border-teal-200 pr-3">إجمالي الأيام: {formatDayCount(leaves.reduce((sum, leave) => sum + leave.total_days, 0))}</span>}
          </div>
        </div>
      </section>
      <PrintReportFooter />
    </div>
  );
}
