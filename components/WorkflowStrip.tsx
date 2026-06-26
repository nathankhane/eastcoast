"use client";

import { Spinner } from "@/components/ui";

interface Step {
  key: string;
  label: string;
  hint: string;
  badge?: string | number;
  onClick: () => void;
  busy?: boolean;
  active?: boolean;
}

interface Props {
  total: number;
  shown: number;
  needsVerify: number;
  decided: number;
  discovering: boolean;
  view: "explore" | "present";
  onDiscover: () => void;
  onCompare: () => void;
  onVerify: () => void;
  onDecide: () => void;
  onShare: () => void;
}

export default function WorkflowStrip({
  total,
  shown,
  needsVerify,
  decided,
  discovering,
  view,
  onDiscover,
  onCompare,
  onVerify,
  onDecide,
  onShare,
}: Props) {
  const steps: Step[] = [
    { key: "discover", label: "Discover", hint: "find & add places", badge: total, onClick: onDiscover, busy: discovering },
    { key: "compare", label: "Compare", hint: "filters · map · fit", badge: shown !== total ? `${shown}/${total}` : total, onClick: onCompare, active: view === "explore" },
    { key: "verify", label: "Verify", hint: "price · reviews · commute", badge: needsVerify || undefined, onClick: onVerify },
    { key: "decide", label: "Decide", hint: "notes · keep/maybe/reject", badge: `${decided}/${total}`, onClick: onDecide },
    { key: "share", label: "Share", hint: "roommate view · export", onClick: onShare, active: view === "present" },
  ];

  return (
    <nav
      aria-label="Workflow"
      className="no-print flex items-stretch gap-1 overflow-x-auto rounded-xl border border-warm bg-white p-1.5"
    >
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-stretch">
          <button
            onClick={s.onClick}
            className={`group flex min-w-[92px] flex-col rounded-lg px-3 py-1.5 text-left transition sm:min-w-[112px] ${
              s.active ? "bg-blue-50" : "hover:bg-cream"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                  s.active ? "bg-blue-600 text-white" : "bg-warm text-ink/70 group-hover:bg-tan group-hover:text-white"
                }`}
              >
                {i + 1}
              </span>
              <span className="text-sm font-semibold text-ink">{s.label}</span>
              {s.busy && <Spinner className="text-blue-600" />}
              {s.badge != null && !s.busy && (
                <span className="ml-auto rounded-full bg-cream px-1.5 text-[10px] font-semibold tabular-nums text-tan-ink">
                  {s.badge}
                </span>
              )}
            </span>
            <span className="mt-0.5 hidden text-[11px] text-tan-ink sm:block">{s.hint}</span>
          </button>
          {i < steps.length - 1 && (
            <span aria-hidden="true" className="flex items-center px-0.5 text-tan">
              ›
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}
