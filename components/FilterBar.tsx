"use client";

import { Filters } from "@/lib/filters";
import { SearchProfile } from "@/lib/types";

interface Props {
  filters: Filters;
  profile: SearchProfile | null;
  onChange: (f: Filters) => void;
  onReset: () => void;
  count: number;
  total: number;
}

const PRICE_OPTIONS = [
  { label: "Any price", value: null },
  { label: "≤ $2,500", value: 2500 },
  { label: "≤ $3,000", value: 3000 },
  { label: "≤ $3,500", value: 3500 },
  { label: "≤ $4,000", value: 4000 },
  { label: "≤ $5,000", value: 5000 },
];

const COMMUTE_OPTIONS = [
  { label: "Any commute", value: null },
  { label: "≤ 15 min", value: 15 },
  { label: "≤ 30 min", value: 30 },
  { label: "≤ 45 min", value: 45 },
  { label: "≤ 60 min", value: 60 },
];

export default function FilterBar({ filters, profile, onChange, onReset, count, total }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  const toggleAmenity = (key: string) => {
    const has = filters.amenityKeys.includes(key);
    set({
      amenityKeys: has ? filters.amenityKeys.filter((k) => k !== key) : [...filters.amenityKeys, key],
    });
  };

  const amenities = profile?.amenities ?? [];
  const hasAnchors = (profile?.anchors.length ?? 0) > 0;

  return (
    <div className="no-print space-y-3 rounded-xl border border-warm bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="Search name, neighborhood, tag…"
          className="w-56 rounded-lg border border-warm px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        <select
          value={filters.maxPrice ?? ""}
          onChange={(e) => set({ maxPrice: e.target.value === "" ? null : Number(e.target.value) })}
          className="rounded-lg border border-warm px-3 py-1.5 text-sm"
        >
          {PRICE_OPTIONS.map((o) => (
            <option key={o.label} value={o.value ?? ""}>
              {o.label}
            </option>
          ))}
        </select>
        {hasAnchors && (
          <select
            value={filters.maxCommuteMinutes ?? ""}
            onChange={(e) => set({ maxCommuteMinutes: e.target.value === "" ? null : Number(e.target.value) })}
            className="rounded-lg border border-warm px-3 py-1.5 text-sm"
          >
            {COMMUTE_OPTIONS.map((o) => (
              <option key={o.label} value={o.value ?? ""}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-xs text-ink/70">
          Available by
          <input
            type="date"
            value={filters.availableByDate}
            onChange={(e) => set({ availableByDate: e.target.value })}
            className="rounded-lg border border-warm px-2 py-1 text-xs"
          />
        </label>
        <span className="ml-auto text-xs text-tan-ink">
          {count} of {total} shown
        </span>
        <button onClick={onReset} className="text-xs font-medium text-blue-600 hover:underline">
          Reset
        </button>
      </div>

      {/* Quick filters for the roommate apartment hunt */}
      <div className="flex flex-wrap items-center gap-2 border-t border-warm/60 pt-3">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-blue-600">Quick</span>
        <Toggle active={filters.area === "arlington"} label="Arlington only" onClick={() => set({ area: filters.area === "arlington" ? "all" : "arlington" })} />
        <Toggle active={filters.area === "dc"} label="DC only" onClick={() => set({ area: filters.area === "dc" ? "all" : "dc" })} />
        <Toggle active={filters.priceCap === 3000} label="Under $3k" onClick={() => set({ priceCap: filters.priceCap === 3000 ? null : 3000 })} />
        <Toggle active={filters.priceCap === 3300} label="Near $3k (≤$3,300)" onClick={() => set({ priceCap: filters.priceCap === 3300 ? null : 3300 })} />
        <Toggle active={filters.requireGym} label="Has gym" onClick={() => set({ requireGym: !filters.requireGym })} />
        <Toggle active={filters.requireBasketball} label="🏀 Basketball" onClick={() => set({ requireBasketball: !filters.requireBasketball })} />
        <Toggle active={filters.minRating === 4.0} label="★ 4.0+" onClick={() => set({ minRating: filters.minRating === 4.0 ? null : 4.0 })} />
        <Toggle active={filters.minRating === 4.3} label="★ 4.3+" onClick={() => set({ minRating: filters.minRating === 4.3 ? null : 4.3 })} />
        <Toggle active={filters.maxMetroWalk === 10} label="Metro ≤10 min" onClick={() => set({ maxMetroWalk: filters.maxMetroWalk === 10 ? null : 10 })} />
        <Toggle active={filters.maxMetroWalk === 15} label="Metro ≤15 min" onClick={() => set({ maxMetroWalk: filters.maxMetroWalk === 15 ? null : 15 })} />
        <Toggle active={filters.needsPriceConfirmation} label="Needs price check" onClick={() => set({ needsPriceConfirmation: !filters.needsPriceConfirmation })} />
      </div>

      {/* Profile-driven amenity toggles */}
      <div className="flex flex-wrap gap-2">
        <Toggle active={filters.require2br2ba} label="2BR/2BA" onClick={() => set({ require2br2ba: !filters.require2br2ba })} />
        {amenities.map((a) => (
          <Toggle
            key={a.key}
            active={filters.amenityKeys.includes(a.key)}
            label={a.label}
            onClick={() => toggleAmenity(a.key)}
          />
        ))}
      </div>
    </div>
  );
}

function Toggle({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-warm bg-white text-ink hover:border-blue-300"
      }`}
    >
      {label}
    </button>
  );
}
