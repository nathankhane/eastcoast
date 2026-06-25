"use client";

import { useState } from "react";
import { Place, SearchProfile, UserMetaStore } from "@/lib/types";
import { computeFit, fitTier, lowestPrice } from "@/lib/scoring";
import { bestCommuteMinutes } from "@/lib/filters";
import { getMetaForPlace } from "@/lib/storage";

interface Props {
  places: Place[];
  meta: UserMetaStore;
  profile: SearchProfile | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

type SortKey = "name" | "city" | "commute" | "price" | "gym" | "bball" | "fit";

const TIER_DOT: Record<string, string> = {
  green: "bg-fit-green",
  yellow: "bg-fit-yellow",
  red: "bg-fit-red",
};

export default function TableView({ places, meta, profile, selectedId, onSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("fit");
  const [asc, setAsc] = useState(false);

  const sorted = [...places].sort((a, b) => {
    const dir = asc ? 1 : -1;
    const av = sortVal(a, sortKey, profile);
    const bv = sortVal(b, sortKey, profile);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });

  function header(key: SortKey, label: string) {
    return (
      <th
        onClick={() => {
          if (sortKey === key) setAsc(!asc);
          else {
            setSortKey(key);
            setAsc(false);
          }
        }}
        className="cursor-pointer select-none px-3 py-2 text-left font-semibold text-slate-600 hover:text-slate-900"
      >
        {label} {sortKey === key ? (asc ? "▲" : "▼") : ""}
      </th>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full border-collapse text-xs">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            {header("name", "Name")}
            {header("city", "Area")}
            {header("commute", "Commute")}
            {header("price", "Rent")}
            {header("gym", "Gym")}
            {header("bball", "🏀")}
            <th className="px-3 py-2 text-left font-semibold text-slate-600">Avail</th>
            {header("fit", "Fit")}
            <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const d = p.apartmentDetails;
            const fit = computeFit(p, profile ?? undefined).score;
            const price = lowestPrice(p);
            const m = getMetaForPlace(meta, p.id);
            const avail = m.availableDateManual || d?.availabilityStatus || "—";
            const commute = profile ? bestCommuteMinutes(p, profile) : null;
            return (
              <tr
                key={p.id}
                onClick={() => onSelect(p.id)}
                className={`cursor-pointer border-b border-slate-100 transition hover:bg-blue-50 ${
                  selectedId === p.id ? "bg-blue-50" : ""
                }`}
              >
                <td className="px-3 py-2 font-medium text-slate-900">{p.name}</td>
                <td className="px-3 py-2 text-slate-600">{p.neighborhood || p.city}</td>
                <td className="px-3 py-2 text-slate-600">{commute != null ? `${commute}m` : "—"}</td>
                <td className="px-3 py-2 text-slate-900">{price ? "$" + price.toLocaleString() : "confirm"}</td>
                <td className="px-3 py-2">{d?.hasGym ? "✓" : "—"}</td>
                <td className="px-3 py-2">
                  {d?.hasBasketballCourt ? (d.basketballCourtType === "indoor" ? "indoor" : d.basketballCourtType === "nearby public court" ? "park" : "yes") : "—"}
                </td>
                <td className="max-w-[140px] truncate px-3 py-2 text-slate-500" title={String(avail)}>
                  {String(avail)}
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <span className={`inline-block h-2 w-2 rounded-full ${TIER_DOT[fitTier(fit)]}`} />
                    {fit}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {m.decision && m.decision !== "unset" ? (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        m.decision === "keep"
                          ? "bg-green-100 text-green-700"
                          : m.decision === "maybe"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {m.decision}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function sortVal(p: Place, key: SortKey, profile: SearchProfile | null): string | number {
  const d = p.apartmentDetails;
  switch (key) {
    case "name": return p.name;
    case "city": return p.neighborhood || p.city;
    case "commute": return (profile ? bestCommuteMinutes(p, profile) : null) ?? 9999;
    case "price": return lowestPrice(p) ?? 999999;
    case "gym": return d?.hasGym ? 1 : 0;
    case "bball": return d?.hasBasketballCourt ? (d.basketballCourtType === "indoor" ? 2 : 1) : 0;
    case "fit": return computeFit(p, profile ?? undefined).score;
  }
}
