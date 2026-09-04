import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useState } from "react";
import { DateTimePicker } from "./date-time-picker";

/**
 * The point of these tests is the value, not the styling.
 *
 * The control this replaced was `type="datetime-local"`, whose value
 * (`2026-09-10T14:30`) `new Date()` parses as local time. flatpickr's display
 * format (`2026-09-10 14:30`) does not parse reliably as local across
 * engines, so a swap that kept the string round-trip would shift every event
 * by the UTC offset — silently, and only for users not on UTC.
 */

const Harness = ({ onPick }: { onPick: (d: Date | null) => void }) => {
  const [value, setValue] = useState<Date | null>(null);
  return (
    <DateTimePicker
      id="when"
      value={value}
      onChange={(d) => {
        setValue(d);
        onPick(d);
      }}
    />
  );
};

// flatpickr owns the input once altInput is on: it hides the original and
// listens on its own element, so a synthetic `change` on the original never
// reaches it. Drive the real instance flatpickr attaches to the element —
// that exercises the same onChange path a click in the calendar takes.
const pick = (text: string) => {
  const input = document.querySelector<HTMLInputElement>("input#when");
  if (!input) throw new Error("picker input not found");
  const fp = (input as HTMLInputElement & { _flatpickr?: { setDate: (d: string, fire: boolean) => void } })._flatpickr;
  if (!fp) throw new Error("flatpickr instance not attached");
  fp.setDate(text, true);
};

describe("DateTimePicker", () => {
  it("reports a Date, not the formatted string", () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);

    pick("2026-09-10 14:30");

    expect(onPick).toHaveBeenCalled();
    const [picked] = onPick.mock.calls.at(-1) ?? [];
    expect(picked).toBeInstanceOf(Date);
  });

  it("preserves the picked wall-clock time in local terms", () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);

    pick("2026-09-10 14:30");

    const [picked] = onPick.mock.calls.at(-1) ?? [];
    const date = picked as Date;
    // 14:30 as the user sees it must stay 14:30 locally. Asserting on local
    // getters rather than the ISO string keeps this true in any TZ the suite
    // happens to run in — including CI's UTC.
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(8); // September, zero-indexed
    expect(date.getDate()).toBe(10);
    expect(date.getHours()).toBe(14);
    expect(date.getMinutes()).toBe(30);
  });

  it("round-trips through toISOString to the same moment", () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);

    pick("2026-09-10 14:30");

    const [picked] = onPick.mock.calls.at(-1) ?? [];
    const date = picked as Date;
    // This is exactly what CreateRoom submits.
    const submitted = date.toISOString();
    expect(new Date(submitted).getTime()).toBe(date.getTime());
  });

  it("keeps the real input visible, so required and focus still work", () => {
    render(<Harness onPick={vi.fn()} />);

    const input = document.querySelector<HTMLInputElement>("input#when");
    // flatpickr's altInput mode would switch this to type=hidden and move
    // `required` onto a field the browser can neither validate nor focus.
    expect(input?.type).toBe("text");
    expect(input?.value ?? "").toBe("");

    pick("2026-09-10 14:30");
    expect(input?.value).toBe("2026-09-10 14:30");
  });

  it("is labellable by the id the caller passed", () => {
    render(<Harness onPick={vi.fn()} />);
    expect(document.querySelector("input#when")).not.toBeNull();
  });
});
