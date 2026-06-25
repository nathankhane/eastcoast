"use client";

import { Place, SearchProfile, UserMetaStore } from "@/lib/types";
import { lowestPrice } from "@/lib/scoring";
import { bestCommuteMinutes } from "@/lib/filters";
import { getMetaForPlace } from "@/lib/storage";

interface Props {
  places: Place[];
  meta: UserMetaStore;
  profile: SearchProfile | null;
  onComputeCommutes: () => void;
  onFilterNeedsPrice: () => void;
  onOpenPlace: (id: string) => void;
  onRoommateView: () => void;
  onAutofillAll: () => void;
}

interface ActionRow {
  key: string;
  label: string;
  count: number;
  actionLabel: string;
  onAction: () => void;
}

export default function NextBestActions({
  places,
  meta,
  profile,
  onComputeCommutes,
  onFilterNeedsPrice,
  onOpenPlace,
  onRoommateView,
  onAutofillAll,
}: Props) {
  const hasAnchors = (profile?.anchors.length ?? 0) > 0;

  const missingCommute = hasAnchors
    ? places.filter(
        (p) => p.latitude != null && p.longitude != null && bestCommuteMinutes(p, profile!) === null
      )
    : [];
  const needsPrice = places.filter((p) => p.apartmentDetails?.needsPriceConfirmation);
  const undecided = places.filter((p) => {
    const dec = getMetaForPlace(meta, p.id).decision;
    return !dec || dec === "unset";
  });
  const missingRent = places.filter((p) => lowestPrice(p) === null);
  const notContacted = places.filter((p) => !getMetaForPlace(meta, p.id).contactedLeasing);

  const rows: ActionRow[] = [];
  if (missingCommute.length)
    rows.push({
      key: "commute",
      label: "missing commute times",
      count: missingCommute.length,
      actionLabel: "Compute commutes",
      onAction: onComputeCommutes,
    });
  if (needsPrice.length)
    rows.push({
      key: "price",
      label: "need price / 2BR confirmation",
      count: needsPrice.length,
      actionLabel: "Show these",
      onAction: onFilterNeedsPrice,
    });
  if (missingRent.length)
    rows.push({
      key: "rent",
      label: "missing rent",
      count: missingRent.length,
      actionLabel: missingRent.length > 1 ? "Auto-fill rent" : "Open",
      onAction: () => (missingRent.length > 1 ? onAutofillAll() : onOpenPlace(missingRent[0].id)),
    });
  if (undecided.length)
    rows.push({
      key: "decide",
      label: "no decision yet",
      count: undecided.length,
      actionLabel: "Open first",
      onAction: () => onOpenPlace(undecided[0].id),
    });
  if (notContacted.length)
    rows.push({
      key: "contact",
      label: "not contacted yet",
      count: notContacted.length,
      actionLabel: "Open first",
      onAction: () => onOpenPlace(notContacted[0].id),
    });

  if (places.length === 0) return null;

  return (
    <section
      aria-label="Next best actions"
      className="no-print rounded-xl border border-warm bg-white p-4"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wide text-blue-600">Next best actions</h2>
        {rows.length > 0 && (
          <button onClick={onRoommateView} className="text-xs font-medium text-blue-600 hover:underline">
            Share roommate view →
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-green-700">
          <span aria-hidden="true">✓</span> You&apos;re all caught up — everything is priced, decided, and contacted.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {rows.map((r) => (
            <li
              key={r.key}
              className="flex items-center justify-between gap-3 rounded-lg border border-warm/70 bg-paper px-3 py-2"
            >
              <span className="text-sm text-ink">
                <span className="font-semibold tabular-nums text-ink">{r.count}</span>{" "}
                <span className="text-ink/70">{r.label}</span>
              </span>
              <button
                onClick={r.onAction}
                className="shrink-0 rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
              >
                {r.actionLabel}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
