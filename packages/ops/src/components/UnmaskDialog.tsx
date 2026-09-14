import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  OPS_UNMASK_REASON_MAX,
  OPS_UNMASK_REASON_MIN,
  type OpsUnmaskResponse,
} from "@application/shared";
import { OpsApiError } from "@/lib/api";
import { useApi } from "@/lib/apiContext";

const ERRORS: Record<string, string> = {
  UNMASK_LIMIT: "Unmask limit reached (20 per hour). Try again later.",
  AUDIT_UNAVAILABLE: "The access log is unavailable, so nothing can be shown. Try again shortly.",
  VALIDATION_ERROR: `Give a reason of ${OPS_UNMASK_REASON_MIN}-${OPS_UNMASK_REASON_MAX} characters.`,
};

export function UnmaskDialog({
  userId,
  onClose,
  onUnmasked,
}: {
  userId: string;
  onClose: () => void;
  onUnmasked: (value: OpsUnmaskResponse) => void;
}) {
  const api = useApi();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => textarea.current?.focus(), []);

  const length = reason.trim().length;
  const valid = length >= OPS_UNMASK_REASON_MIN && length <= OPS_UNMASK_REASON_MAX;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      onUnmasked(await api.post<OpsUnmaskResponse>(`/users/${userId}/unmask`, { reason: reason.trim() }));
      onClose();
    } catch (err) {
      const code = err instanceof OpsApiError ? err.code : "NETWORK_ERROR";
      setError(ERRORS[code] ?? `Unmask failed (${code}).`);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-ink/40 px-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="unmask-title"
        onSubmit={submit}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        className="w-full max-w-md rounded-lg border border-line bg-panel p-5"
      >
        <h2 id="unmask-title" className="text-base font-semibold">
          Unmask email and name
        </h2>
        <p className="mt-1 text-sm text-muted">
          This view is recorded with your reason. Values stay on screen until you leave this page.
        </p>
        <label htmlFor="unmask-reason" className="mt-4 block text-sm font-medium">
          Reason
        </label>
        <textarea
          id="unmask-reason"
          ref={textarea}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={OPS_UNMASK_REASON_MAX}
          rows={3}
          placeholder="e.g. Support ticket 4411: customer cannot log in"
          className="mt-1 w-full rounded border border-line px-3 py-2 text-sm"
        />
        <p className={`mt-1 text-xs ${valid || length === 0 ? "text-muted" : "text-danger"}`} aria-live="polite">
          {length}/{OPS_UNMASK_REASON_MAX} (minimum {OPS_UNMASK_REASON_MIN})
        </p>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-sm hover:bg-ground">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid || busy}
            className="rounded bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Unmasking…" : "Confirm unmask"}
          </button>
        </div>
      </form>
    </div>
  );
}
