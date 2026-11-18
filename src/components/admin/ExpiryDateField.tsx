import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "@/components/admin/muiIcons";
import { useTranslation } from "react-i18next";

import { TextField } from "@/components/admin/ui";
import { clampExpiryDateInput } from "@/lib/expiryDateTime";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const EXPIRY_DATE_MIN = "0001-01-01";
const EXPIRY_DATE_MAX = "9999-12-31";

function detectIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function parseISODate(value: string) {
  const match = DATE_PATTERN.exec(value.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1) return null;
  return date;
}

function toISODate(date: Date) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localeTag(language: string) {
  return language.replace(/_/g, "-") || "zh-CN";
}

function commitExpiryDate(
  input: HTMLInputElement,
  next: string,
  onChange: (value: string) => void,
) {
  if (!next) return;
  const clamped = clampExpiryDateInput(next);
  if (input.value !== clamped) input.value = clamped;
  onChange(clamped);
}

function NativeExpiryDateField({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <TextField.Root
      aria-label={ariaLabel}
      type="date"
      min={EXPIRY_DATE_MIN}
      max={EXPIRY_DATE_MAX}
      value={value}
      onChange={(event) => {
        commitExpiryDate(event.currentTarget, event.currentTarget.value, onChange);
      }}
      onInput={(event) => {
        commitExpiryDate(event.currentTarget, event.currentTarget.value, onChange);
      }}
    />
  );
}

function IOSExpiryDateField({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const { i18n } = useTranslation();
  const locale = localeTag(i18n.language);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = parseISODate(value);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => selected ?? new Date());

  useEffect(() => {
    if (!open) return;
    setVisibleMonth(parseISODate(value) ?? new Date());
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const label = useMemo(() => {
    if (!selected) return value;
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(selected);
  }, [locale, selected, value]);

  const monthLabel = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
  }).format(visibleMonth);

  const weekdays = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
    return Array.from({ length: 7 }, (_, index) =>
      formatter.format(new Date(2024, 0, 7 + index)),
    );
  }, [locale]);

  const cells = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const slots: Array<Date | null> = Array.from({ length: firstWeekday }, () => null);
    for (let day = 1; day <= daysInMonth; day += 1) slots.push(new Date(year, month, day));
    return slots;
  }, [visibleMonth]);

  const shiftMonth = (delta: number) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  const previousMonthLabel = locale.startsWith("zh") ? "上个月" : locale.startsWith("ja") ? "前の月" : "Previous month";
  const nextMonthLabel = locale.startsWith("zh") ? "下个月" : locale.startsWith("ja") ? "次の月" : "Next month";

  return (
    <div
      ref={rootRef}
      className="km-expiry-date-picker"
      onMouseDown={() => setOpen(true)}
    >
      <TextField.Root
        readOnly
        aria-label={ariaLabel}
        value={label}
        onFocus={() => setOpen(true)}
      />
      {open ? (
        <div className="km-expiry-calendar" role="dialog" aria-label={ariaLabel}>
          <div className="km-expiry-calendar-head">
            <button type="button" className="km-expiry-calendar-nav" onClick={() => shiftMonth(-1)} aria-label={previousMonthLabel}>
              <ChevronLeft size={16} />
            </button>
            <span className="km-expiry-calendar-title">{monthLabel}</span>
            <button type="button" className="km-expiry-calendar-nav" onClick={() => shiftMonth(1)} aria-label={nextMonthLabel}>
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="km-expiry-calendar-grid">
            {weekdays.map((weekday) => (
              <span key={weekday} className="km-expiry-calendar-dow">
                {weekday}
              </span>
            ))}
            {cells.map((date, index) =>
              date ? (
                <button
                  key={toISODate(date)}
                  type="button"
                  className="km-expiry-calendar-day"
                  data-selected={selected && toISODate(date) === toISODate(selected) ? "true" : undefined}
                  onClick={() => {
                    onChange(toISODate(date));
                    setOpen(false);
                  }}
                >
                  {date.getDate()}
                </button>
              ) : (
                <span key={`empty-${index}`} />
              ),
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ExpiryDateField({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  if (detectIOS()) {
    return <IOSExpiryDateField value={value} onChange={onChange} ariaLabel={ariaLabel} />;
  }
  return <NativeExpiryDateField value={value} onChange={onChange} ariaLabel={ariaLabel} />;
}
