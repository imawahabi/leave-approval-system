import React, { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatSectorPath } from '@/utils/organization';
import type { Sector, Department } from '@/types';

interface ExpandableOrgPathProps {
  sector?: Sector | null;
  department?: Department | { name_ar?: string | null } | null;
  customPath?: string;
  className?: string;
  badge?: boolean;
  label?: string;
}

export function ExpandableOrgPath({
  sector,
  department,
  customPath,
  className = '',
  label = 'مسار القطاع والإدارة',
}: ExpandableOrgPathProps) {
  const [expanded, setExpanded] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  // Construct full hierarchical path
  let fullPath = customPath;
  if (!fullPath) {
    const secPart = formatSectorPath(sector);
    const deptPart = department?.name_ar;
    if (secPart && secPart !== '-') {
      fullPath = deptPart ? `${secPart} / ${deptPart}` : secPart;
    } else if (deptPart) {
      fullPath = deptPart;
    } else {
      fullPath = '-';
    }
  }

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element) return;
    const measure = () => {
      const style = window.getComputedStyle(element);
      const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.5;
      const clone = element.cloneNode(true) as HTMLSpanElement;
      clone.classList.remove('line-clamp-1');
      clone.style.position = 'absolute';
      clone.style.visibility = 'hidden';
      clone.style.width = `${element.clientWidth}px`;
      clone.style.height = 'auto';
      clone.style.display = 'block';
      document.body.appendChild(clone);
      setIsOverflowing(clone.scrollHeight > lineHeight * 1.25 + 1);
      clone.remove();
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [fullPath, expanded]);

  // If path is empty, dash, or very short, render simple text
  if (!fullPath || fullPath === '-' || fullPath.length < 28) {
    return <span className={className}>{fullPath}</span>;
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        if (!isOverflowing && !expanded) return;
        e.preventDefault();
        e.stopPropagation();
        setExpanded((prev) => !prev);
      }}
      dir="rtl"
      className={`text-right group/org inline-flex max-w-full items-center gap-1.5 cursor-pointer transition-colors duration-200 select-none ${
        expanded
          ? 'whitespace-normal break-words leading-relaxed text-slate-800'
          : `hover:text-slate-900 ${className}`
      }`}
      title={expanded ? `انقر لطي ${label}` : `انقر لعرض ${label} كاملاً: ${fullPath}`}
      aria-expanded={isOverflowing ? expanded : undefined}
      aria-label={isOverflowing ? (expanded ? `طي ${label}` : `توسيع ${label}`) : undefined}
    >
      {isOverflowing && (
        <span className="shrink-0 inline-flex items-center text-slate-400 group-hover/org:text-slate-700 transition-colors">
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3 opacity-60 group-hover/org:opacity-100" />}
        </span>
      )}
      <span ref={textRef} className={expanded ? 'break-words' : 'line-clamp-1'}>{fullPath}</span>
    </button>
  );
}
