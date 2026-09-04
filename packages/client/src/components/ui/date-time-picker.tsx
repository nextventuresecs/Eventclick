import { useEffect, useRef } from "react";
import flatpickr from "flatpickr";
import type { Instance as FlatpickrInstance } from "flatpickr/dist/types/instance";
import { Calendar } from "lucide-react";
import "flatpickr/dist/flatpickr.min.css";

interface DateTimePickerProps {
  id: string;
  value: Date | null;
  onChange: (value: Date | null) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  /** Earliest selectable moment. Used to keep an end time after its start. */
  minDate?: Date | null;
}

/**
 * Date + time field backed by flatpickr.
 *
 * The value is a `Date`, deliberately, and never the formatted string. The
 * native `datetime-local` control this replaces emits `2026-09-10T14:30`,
 * which `new Date()` parses as local time; flatpickr's display format emits
 * `2026-09-10 14:30`, whose parsing is not reliably local across engines. A
 * naive swap between the two silently shifts every event by the UTC offset.
 * Reading `selectedDates[0]` sidesteps the string entirely — the caller gets
 * the moment the user actually picked.
 *
 * flatpickr is imperative and owns its own DOM, so this mounts once and is
 * driven by effects; the picker is destroyed on unmount to avoid leaking the
 * calendar element it appends to <body>.
 */
export const DateTimePicker = ({
  id,
  value,
  onChange,
  disabled,
  required,
  placeholder = "Select date and time",
  minDate,
}: DateTimePickerProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const fpRef = useRef<FlatpickrInstance | null>(null);
  // Held in a ref so the picker is created once: passing onChange into the
  // effect's deps would tear down and rebuild flatpickr on every parent
  // render, closing the calendar mid-interaction.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!inputRef.current) return;

    const fp = flatpickr(inputRef.current, {
      enableTime: true,
      dateFormat: "Y-m-d H:i",
      altInput: true,
      // What the user reads. The submitted value comes from the Date object,
      // not from this string, so the format is free to be human-friendly.
      altFormat: "D, d M Y at h:i K",
      minuteIncrement: 5,
      time_24hr: false,
      onChange: (selectedDates) => onChangeRef.current(selectedDates[0] ?? null),
    });
    fpRef.current = fp;

    return () => {
      fp.destroy();
      fpRef.current = null;
    };
  }, []);

  // Mirror external value changes (reset, prefill) into the picker without
  // re-firing onChange.
  useEffect(() => {
    const fp = fpRef.current;
    if (!fp) return;
    if (value) fp.setDate(value, false);
    else fp.clear(false);
  }, [value]);

  useEffect(() => {
    fpRef.current?.set("minDate", minDate ?? undefined);
  }, [minDate]);

  useEffect(() => {
    const alt = fpRef.current?.altInput;
    if (alt) alt.disabled = Boolean(disabled);
  }, [disabled]);

  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-(--color-gray-600) z-1">
        <Calendar className="w-4 h-4" />
      </div>
      <input
        id={id}
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className="input-premium flex h-10 w-full rounded-xl border border-input bg-background pl-10 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
};
