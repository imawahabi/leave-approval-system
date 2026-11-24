import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronRight, ChevronLeft, X } from 'lucide-react';
import { addDays, formatDate, toISODate, parseISODate, todayInKuwait } from '@/utils/date';

interface DatePickerProps {
  id?: string;
  value: string; // ISO format 'YYYY-MM-DD'
  onChange: (dateStr: string) => void;
  label?: string;
  placeholder?: string;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  presets?: Array<{ label: string; daysOffset: number }>;
  className?: string;
  error?: string;
}

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

const ARABIC_DAYS = ['أحد', 'اثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];

export function DatePicker({
  id,
  value,
  onChange,
  label,
  placeholder = 'اختر التاريخ',
  min,
  max,
  required,
  disabled,
  presets,
  className = '',
  error,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; openUpward: boolean }>({
    top: 0,
    left: 0,
    width: 280,
    openUpward: false,
  });

  // Active view date in calendar (defaults to value or current date)
  const [viewDate, setViewDate] = useState<Date>(() => {
    if (value) {
      try {
        return parseISODate(value);
      } catch {
        return parseISODate(todayInKuwait());
      }
    }
    return parseISODate(todayInKuwait());
  });

  // When value prop changes, update view date
  useEffect(() => {
    if (value) {
      try {
        setViewDate(parseISODate(value));
      } catch {
        // ignore
      }
    }
  }, [value]);

  // Recalculate popup position
  const updateCoords = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const popupHeight = 340;
    const openUpward = rect.bottom + popupHeight > window.innerHeight && rect.top > popupHeight;
    setCoords({
      top: openUpward ? rect.top - popupHeight - 6 : rect.bottom + 6,
      left: Math.max(10, Math.min(rect.right - 280, window.innerWidth - 290)),
      width: Math.max(rect.width, 280),
      openUpward,
    });
  };

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) {
      updateCoords();
    }
    setIsOpen(!isOpen);
  };

  // Close on outside click, window resize, or scroll
  useEffect(() => {
    if (!isOpen) return;
    const handleClose = (e: MouseEvent) => {
      if (containerRef.current && containerRef.current.contains(e.target as Node)) {
        return;
      }
      setIsOpen(false);
    };
    const handleReposition = () => updateCoords();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsOpen(false);
      }
    };

    window.addEventListener('click', handleClose);
    window.addEventListener('keydown', handleEscape, true);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('keydown', handleEscape, true);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Calendar calculations
  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const selectDay = (day: number) => {
    const selected = new Date(year, month, day);
    const iso = toISODate(selected);
    onChange(iso);
    setIsOpen(false);
  };

  const selectPreset = (daysOffset: number) => {
    const iso = addDays(todayInKuwait(), daysOffset);
    if ((min && iso < min) || (max && iso > max)) return;
    onChange(iso);
    setIsOpen(false);
  };

  const isSelected = (day: number) => {
    if (!value) return false;
    const d = parseISODate(value);
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
  };

  const isTodayDate = (day: number) => {
    const today = parseISODate(todayInKuwait());
    return today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
  };

  const isDisabledDay = (day: number) => {
    const d = new Date(year, month, day);
    const iso = toISODate(d);
    if (min && iso < min) return true;
    if (max && iso > max) return true;
    return false;
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center justify-between">
          <span>
            {label} {required && <span className="text-red-500">*</span>}
          </span>
          {value && !required && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-0.5"
            >
              <X className="w-3 h-3" /> مسح
            </button>
          )}
        </label>
      )}

      {/* Trigger Button */}
      <button
        id={id}
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        aria-label={label ? `${label}: ${value ? formatDate(value) : 'غير محدد'}` : value ? formatDate(value) : placeholder}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-invalid={!!error}
        aria-describedby={error && id ? `${id}-error` : undefined}
        className={`input-field flex items-center justify-between text-right w-full cursor-pointer transition-colors ${
          isOpen ? 'ring-2 ring-primary-500 border-primary-500' : ''
        } ${disabled ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'bg-white hover:border-slate-400'}`}
      >
        <span className={`truncate text-sm ${value ? 'text-slate-900 font-semibold' : 'text-slate-400'}`}>
          {value ? formatDate(value) : placeholder}
        </span>
        <CalendarIcon className="w-4 h-4 text-slate-400 shrink-0 mr-2" aria-hidden="true" />
      </button>
      {error && <p id={id ? `${id}-error` : undefined} role="alert" className="mt-1 text-xs text-red-700">{error}</p>}

      {/* Popup Calendar */}
      {isOpen &&
        createPortal(
          <div
            role="dialog"
            aria-label="اختيار التاريخ"
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              zIndex: 999999,
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 p-3.5 animate-fade-in select-none text-slate-800"
          >
            {/* Header: Month & Year & Navigation */}
            <div className="flex items-center justify-between mb-3 px-1">
              <button
                type="button"
                onClick={nextMonth}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
                title="الشهر القادم"
                aria-label="الشهر القادم"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <div className="text-sm font-bold text-slate-900">
                {ARABIC_MONTHS[month]} {year}
              </div>
              <button
                type="button"
                onClick={prevMonth}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
                title="الشهر السابق"
                aria-label="الشهر السابق"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {/* Quick shortcuts bar */}
            <div className="flex items-center gap-1.5 mb-2.5 pb-2 border-b border-slate-100 overflow-x-auto text-[11px]">
              {(presets ?? [{ label: 'اليوم', daysOffset: 0 }, { label: 'غدًا', daysOffset: 1 }]).map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => selectPreset(p.daysOffset)}
                  className="px-2 py-1 rounded-md bg-slate-100 hover:bg-primary-50 hover:text-primary-700 font-medium transition-colors shrink-0"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Days of Week Header */}
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {ARABIC_DAYS.map((d) => (
                <div key={d} className="text-[11px] font-semibold text-slate-400 py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar Days Grid */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {/* Previous month padding days */}
              {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                <div
                  key={`prev-${i}`}
                  className="text-xs text-slate-300 py-1.5 flex items-center justify-center cursor-default"
                >
                  {daysInPrevMonth - firstDayOfMonth + i + 1}
                </div>
              ))}

              {/* Current month days */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const selected = isSelected(day);
                const today = isTodayDate(day);
                const disabledDay = isDisabledDay(day);

                return (
                  <button
                    key={`day-${day}`}
                    type="button"
                    disabled={disabledDay}
                    onClick={() => selectDay(day)}
                    aria-label={`${day} ${ARABIC_MONTHS[month]} ${year}`}
                    aria-pressed={selected}
                    className={`h-8 w-8 mx-auto rounded-lg text-xs font-medium flex items-center justify-center transition-colors ${
                      selected
                        ? 'bg-primary-600 text-white font-bold shadow-md shadow-primary-500/30'
                        : today
                        ? 'border border-primary-500 text-primary-700 font-bold bg-primary-50/50'
                        : disabledDay
                        ? 'text-slate-300 cursor-not-allowed'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {/* Footer with ISO input or close */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span className="font-mono text-[11px] text-slate-400">
                {value || 'لم يتم التحديد'}
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-primary-700 hover:text-primary-900 font-semibold px-2 py-0.5 rounded hover:bg-primary-50"
              >
                إغلاق
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
