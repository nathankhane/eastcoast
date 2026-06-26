"use client";

import { useState } from "react";
import { Place, SearchProfile, UserMetaStore } from "@/lib/types";
import { computeFit, fitTier, lowestPrice } from "@/lib/scoring";
import { bestCommuteMinutes } from "@/lib/filters";
import { getMetaForPlace } from "@/lib/storage";
import { Spinner } from "@/components/ui";

interface Props {
  places: Place[];
  meta: UserMetaStore;
  profile: SearchProfile | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  totalCount: number;
  hasAnchors: boolean;
  onComputeCommutes: () => void;
  computing: boolean;
  onResetFilters: () => void;
}

type SortKey = "name" | "city" | "commute" | "price" | "rating" | "walk" | "gym" | "bball" | "fit";

const TIER_DOT: Record<string, string> = {
  green: "bg-fit-green",
  yellow: "bg-fit-yellow",
  red: "bg-fit-red",
};

export default function TableView({
  places,
  meta,
  profile,
  selectedId,
  onSelect,
  totalCount,
  hasAnchors,
  onComputeCommutes,
  computing,
  onResetFilters,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("fit");
  const [asc, setAsc] = useState(false);

  const sorted = [...places].sort((a, b) => {
    const dir = asc ? 1 : -1;
    const av = sortVal(a, sortKey, profile);
    const bv = sortVal(b, sortKey, profile);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });

  const missingCommute =
    hasAnchors && places.some((p) => p.latitude != null && p.longitude != null && bestCommuteMinutes(p, profile!) === null);

  function header(key: SortKey, label: string, srLabel?: string, thClass = "") {
    const active = sortKey === key;
    return (
      <th
        aria-sort={active ? (asc ? "ascending" : "descending") : "none"}
        className={`bg-cream px-3 py-2 text-left font-semibold ${thClass}`}
      >
        <button
          onClick={() => {
            if (active) setAsc(!asc);
            else {
              setSortKey(key);
              setAsc(false);
            }
          }}
          aria-label={`Sort by ${srLabel ?? label}`}
          className={`flex items-center gap-0.5 ${active ? "text-blue-700" : "text-ink/70 hover:text-ink"}`}
        >
          {srLabel && <span className="sr-only">{srLabel}</span>}
          <span aria-hidden={srLabel ? "true" : undefined}>{label}</span>
          <span aria-hidden="true" className="w-2 text-[9px]">
            {active ? (asc ? "▲" : "▼") : ""}
          </span>
        </button>
      </th>
    );
  }

  if (totalCount === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-warm bg-white lg:h-full lg:overflow-auto">
      {missingCommute && (
        <div className="flex items-center justify-between gap-2 border-b border-warm bg-blue-50 px-3 py-1.5 text-[11px] text-blue-800">
          <span>Some commute times aren&apos;t computed yet.</span>
          <button
            onClick={onComputeCommutes}
            disabled={computing}
            className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-white px-2 py-0.5 font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            {computing && <Spinner />}
            {computing ? "Computing…" : "Compute commutes"}
          </button>
        </div>
      )}
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 border-b border-warm">
          <tr>
            {header("name", "Name")}
            {header("city", "Area", undefined, "hidden md:table-cell")}
            {header("price", "Rent")}
            {header("rating", "★", "Rating")}
            {header("walk", "Metro", undefined, "hidden md:table-cell")}
            {header("commute", "Commute")}
            {header("gym", "Gym", undefined, "hidden md:table-cell")}
            {header("bball", "🏀", "Basketball", "hidden md:table-cell")}
            <th className="hidden bg-cream px-3 py-2 text-left font-semibold text-ink/70 md:table-cell">Avail</th>
            {header("fit", "Fit")}
            <th className="bg-cream px-3 py-2 text-left font-semibold text-ink/70">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={11} className="px-3 py-10 text-center">
                <p className="text-sm font-medium text-ink">No places match these filters.</p>
                <p className="mt-1 text-xs text-tan-ink">Try widening your filters to see more options.</p>
                <button
                  onClick={onResetFilters}
                  className="mt-3 rounded-lg border border-warm px-3 py-1.5 text-xs font-medium text-ink hover:border-tan"
                >
                  Reset filters
                </button>
              </td>
            </tr>
          )}
          {sorted.map((p) => {
            const d = p.apartmentDetails;
            const fit = computeFit(p, profile ?? undefined).score;
            const price = lowestPrice(p);
            const m = getMetaForPlace(meta, p.id);
            const avail = m.availableDateManual || d?.availabilityStatus || "—";
            const commute = hasAnchors ? bestCommuteMinutes(p, profile!) : null;
            const isSelected = selectedId === p.id;
            return (
              <tr
                key={p.id}
                onClick={() => onSelect(p.id)}
                aria-selected={isSelected}
                className={`cursor-pointer border-b border-warm/60 border-l-2 transition ${
                  isSelected
                    ? "border-l-blue-600 bg-blue-100"
                    : "border-l-transparent hover:bg-blue-50"
                }`}
              >
                <td className="px-3 py-2.5 font-medium text-ink sm:py-2">
                  {p.name}
                  {d?.needsPriceConfirmation && (
                    <span title="Price/2BA needs confirmation" className="ml-1 text-amber-500">
                      ⚠︎
                    </span>
                  )}
                </td>
                <td className="hidden px-3 py-2.5 text-ink/70 sm:py-2 md:table-cell">{p.neighborhood || p.city}</td>
                <td className="px-3 py-2.5 text-ink sm:py-2">{price ? "$" + price.toLocaleString() : "confirm"}</td>
                <td className="px-3 py-2.5 text-ink/70 sm:py-2">{p.rating != null ? `${p.rating}★` : "—"}</td>
                <td className="hidden px-3 py-2.5 text-ink/70 sm:py-2 md:table-cell">
                  {d?.walkingMinutesToMetro != null ? `${d.walkingMinutesToMetro}m` : "—"}
                </td>
                <td className="px-3 py-2.5 text-ink/70 sm:py-2">
                  {commute != null ? (
                    `${commute}m`
                  ) : hasAnchors ? (
                    <span className="text-tan">Not computed</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="hidden px-3 py-2.5 sm:py-2 md:table-cell">{d?.hasGym ? "✓" : "—"}</td>
                <td className="hidden px-3 py-2.5 sm:py-2 md:table-cell">
                  {d?.hasBasketballCourt
                    ? d.basketballCourtType === "indoor"
                      ? "indoor"
                      : d.basketballCourtType === "nearby public court"
                      ? "park"
                      : "yes"
                    : "—"}
                </td>
                <td className="hidden max-w-[140px] truncate px-3 py-2.5 text-tan-ink sm:py-2 md:table-cell" title={String(avail)}>
                  {String(avail)}
                </td>
                <td className="px-3 py-2.5 sm:py-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <span className={`inline-block h-2 w-2 rounded-full ${TIER_DOT[fitTier(fit)]}`} />
                    {fit}
                  </span>
                </td>
                <td className="px-3 py-2.5 sm:py-2">
                  <StatusBadges meta={m} needsPrice={!!d?.needsPriceConfirmation} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadges({
  meta,
  needsPrice,
}: {
  meta: ReturnType<typeof getMetaForPlace>;
  needsPrice: boolean;
}) {
  const hasDecision = meta.decision && meta.decision !== "unset";
  if (!hasDecision && !meta.contactedLeasing && !meta.tourScheduled && !needsPrice) {
    return <span className="text-warm">—</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {hasDecision && (
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            meta.decision === "keep"
              ? "bg-green-100 text-green-700"
              : meta.decision === "maybe"
              ? "bg-amber-100 text-amber-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {meta.decision}
        </span>
      )}
      {meta.contactedLeasing && (
        <span title="Contacted leasing" className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
          contacted
        </span>
      )}
      {meta.tourScheduled && (
        <span title="Tour scheduled" className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
          tour
        </span>
      )}
      {needsPrice && (
        <span title="Price/2BA needs confirmation" className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
          price?
        </span>
      )}
    </div>
  );
}

function sortVal(p: Place, key: SortKey, profile: SearchProfile | null): string | number {
  const d = p.apartmentDetails;
  switch (key) {
    case "name":
      return p.name;
    case "city":
      return p.neighborhood || p.city;
    case "commute":
      return (profile ? bestCommuteMinutes(p, profile) : null) ?? 9999;
    case "price":
      return lowestPrice(p) ?? 999999;
    case "rating":
      return p.rating ?? -1;
    case "walk":
      return d?.walkingMinutesToMetro ?? 9999;
    case "gym":
      return d?.hasGym ? 1 : 0;
    case "bball":
      return d?.hasBasketballCourt ? (d.basketballCourtType === "indoor" ? 2 : 1) : 0;
    case "fit":
      return computeFit(p, profile ?? undefined).score;
  }
}
