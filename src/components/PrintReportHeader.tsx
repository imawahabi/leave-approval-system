import { formatDate, todayInKuwait } from '@/utils/date';

interface PrintHeaderProps {
  title: string;
  subtitle?: string;
  dateRange?: string;
  itemCount?: number;
  totalDays?: number;
}

export function PrintReportHeader({ title, subtitle, dateRange, itemCount, totalDays }: PrintHeaderProps) {
  return (
      <div className="print-only print-report-header">
        <div className="print-report-identity">
          <img src="/entity-logo.png" alt="شعار الجهة" />
          <div>
            <p className="print-report-agency">الجهة الحكومية</p>
            <p className="print-report-office">الجهة الحكومية</p>
            <p className="print-report-system">نظام إدارة واعتماد الإجازات</p>
          </div>
        </div>
        <div className="print-report-heading">
          <h1>{title}</h1>
          <div className="print-report-meta">
            {subtitle && <span>{subtitle}</span>}
            {dateRange && <span>{dateRange}</span>}
            <span>تاريخ الإصدار: {formatDate(todayInKuwait())}</span>
          </div>
        </div>
        {(itemCount !== undefined || totalDays !== undefined) && (
          <div className="print-report-summary">
            {itemCount !== undefined && <div><span>عدد الإجازات</span><strong>{itemCount}</strong></div>}
            {totalDays !== undefined && <div className="print-report-summary-secondary"><span>إجمالي الأيام</span><strong>{totalDays}</strong></div>}
          </div>
        )}
      </div>
  );
}

export function PrintReportFooter() {
  return <div className="print-only print-report-footer">تم إنشاء هذا التقرير من نظام إدارة واعتماد الإجازات · الجهة الحكومية</div>;
}
