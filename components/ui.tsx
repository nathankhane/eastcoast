"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

// ============================================================================
// Toasts
// ============================================================================

export type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastApi {
  push: (type: ToastType, message: string, durationMs?: number) => void;
  success: (message: string, durationMs?: number) => void;
  error: (message: string, durationMs?: number) => void;
  info: (message: string, durationMs?: number) => void;
}

const noop: ToastApi = {
  push: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
};

const ToastContext = createContext<ToastApi>(noop);

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

let toastSeq = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current[id];
    if (timer) {
      clearTimeout(timer);
      delete timers.current[id];
    }
  }, []);

  const push = useCallback(
    (type: ToastType, message: string, durationMs?: number) => {
      const id = ++toastSeq;
      const ttl = durationMs ?? (type === "error" ? 6000 : 3800);
      setToasts((prev) => [...prev, { id, type, message }]);
      timers.current[id] = setTimeout(() => dismiss(id), ttl);
    },
    [dismiss]
  );

  const api: ToastApi = {
    push,
    success: (m, d) => push("success", m, d),
    error: (m, d) => push("error", m, d),
    info: (m, d) => push("info", m, d),
  };

  useEffect(() => {
    const current = timers.current;
    return () => {
      Object.values(current).forEach(clearTimeout);
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const tone =
    toast.type === "success"
      ? "border-green-600/30 bg-green-50 text-green-800"
      : toast.type === "error"
      ? "border-red-300 bg-red-50 text-red-800"
      : "border-blue-300 bg-blue-50 text-blue-800";
  const icon = toast.type === "success" ? "✓" : toast.type === "error" ? "!" : "i";
  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 shadow-lg ${tone}`}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/70 text-[10px] font-bold"
      >
        {icon}
      </span>
      <p className="flex-1 text-sm leading-snug">{toast.message}</p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="shrink-0 rounded p-0.5 opacity-70 hover:bg-white/40 hover:opacity-100"
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}

// ============================================================================
// Modal shell (Escape to close, backdrop click, focus management, aria)
// ============================================================================

export function Modal({
  open,
  onClose,
  labelledById,
  children,
  maxWidthClass = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  labelledById?: string;
  children: React.ReactNode;
  maxWidthClass?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Focus the first focusable element inside the panel.
    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>(
      'input, textarea, select, button, [tabindex]:not([tabindex="-1"])'
    );
    focusable?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledById}
        className={`max-h-[88vh] w-full ${maxWidthClass} overflow-y-auto rounded-2xl border border-warm bg-white p-4 shadow-2xl sm:p-5`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// Confirm dialog
// ============================================================================

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
}

export function ConfirmDialog({
  options,
  onClose,
}: {
  options: ConfirmOptions | null;
  onClose: () => void;
}) {
  if (!options) return null;
  const danger = options.tone === "danger";
  return (
    <Modal open onClose={onClose} labelledById="confirm-title" maxWidthClass="max-w-sm">
      <h2 id="confirm-title" className="text-base font-bold text-ink">
        {options.title}
      </h2>
      <p className="mt-2 text-sm text-ink/70">{options.message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border border-warm px-4 py-1.5 text-sm font-medium text-ink hover:border-tan"
        >
          {options.cancelLabel ?? "Cancel"}
        </button>
        <button
          onClick={() => {
            options.onConfirm();
            onClose();
          }}
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold text-white ${
            danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {options.confirmLabel ?? "Confirm"}
        </button>
      </div>
    </Modal>
  );
}

// ============================================================================
// Prompt modal (single text input, e.g. add city)
// ============================================================================

export function PromptModal({
  open,
  title,
  label,
  placeholder,
  submitLabel = "Add",
  loading = false,
  error = null,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  label: string;
  placeholder?: string;
  submitLabel?: string;
  loading?: boolean;
  error?: string | null;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  useEffect(() => {
    if (open) setValue("");
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} labelledById="prompt-title" maxWidthClass="max-w-md">
      <h2 id="prompt-title" className="text-base font-bold text-ink">
        {title}
      </h2>
      <label className="mt-3 block">
        <span className="mb-1 block text-[11px] font-medium text-tan-ink">{label}</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim() && !loading) onSubmit(value.trim());
          }}
          placeholder={placeholder}
          className="w-full rounded-lg border border-warm px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
      </label>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border border-warm px-4 py-1.5 text-sm font-medium text-ink hover:border-tan"
        >
          Cancel
        </button>
        <button
          onClick={() => value.trim() && onSubmit(value.trim())}
          disabled={loading || !value.trim()}
          className="rounded-lg bg-red-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
        >
          {loading ? "Working…" : submitLabel}
        </button>
      </div>
    </Modal>
  );
}

// ============================================================================
// Inline banner + empty state + spinner
// ============================================================================

export function Banner({
  tone = "info",
  children,
  action,
}: {
  tone?: "info" | "warn" | "error" | "success";
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const cls =
    tone === "error"
      ? "border-red-300 bg-red-50 text-red-800"
      : tone === "warn"
      ? "border-amber-300 bg-amber-50 text-amber-800"
      : tone === "success"
      ? "border-green-600/30 bg-green-50 text-green-800"
      : "border-blue-300 bg-blue-50 text-blue-800";
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3.5 py-2.5 text-sm ${cls}`}>
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: string;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center rounded-xl border border-dashed border-warm bg-cream p-8 text-center">
      {icon && <div className="text-4xl" aria-hidden="true">{icon}</div>}
      <h3 className="mt-3 font-semibold text-ink">{title}</h3>
      {children && <div className="mt-1 max-w-sm text-sm text-tan-ink">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}
