"use client";
import { useEffect, useState } from "react";

// Reusable confirm dialog (SPEC §0.2 tokens) for stop/start/delete project actions — overlay +
// sharp centered panel, optional type-to-confirm gate. Escape / overlay click cancels.
export default function ConfirmModal({
  title,
  body,
  confirmLabel,
  danger = false,
  requireText,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  requireText?: string;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const gated = requireText !== undefined && typed !== requireText;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-panel" role="dialog" aria-modal="true" aria-label={title}>
        <h2 className={`modal-title ${danger ? "danger" : ""}`}>{title}</h2>
        <p className="sub" style={{ margin: "0 0 4px" }}>
          {body}
        </p>
        {requireText !== undefined && (
          <>
            <label>
              Type &ldquo;{requireText}&rdquo; to confirm
            </label>
            <input type="text" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </>
        )}
        {error && <div className="err">{error}</div>}
        <div className="modal-actions">
          <button className="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button className={danger ? "danger-btn" : "primary"} disabled={gated || busy} onClick={onConfirm}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
