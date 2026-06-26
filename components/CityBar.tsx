"use client";

import { City, SearchProfile } from "@/lib/types";

interface Props {
  cities: City[];
  activeCityId: string;
  onCityChange: (id: string) => void;
  onAddCity: () => void;

  profiles: SearchProfile[];
  activeProfileId: string | null;
  onProfileChange: (id: string) => void;

  onDiscover: () => void;
  discovering: boolean;
  onComputeCommutes: () => void;
  computing: boolean;
  anchorCount: number;

  onToggleProfileEditor: () => void;
  onAddApartment: () => void;
  onAutofillAll: () => void;
  autofilling: boolean;
  autofillCount: number;
  cloud: boolean;
}

export default function CityBar({
  cities,
  activeCityId,
  onCityChange,
  onAddCity,
  profiles,
  activeProfileId,
  onProfileChange,
  onDiscover,
  discovering,
  onComputeCommutes,
  computing,
  anchorCount,
  onToggleProfileEditor,
  onAddApartment,
  onAutofillAll,
  autofilling,
  autofillCount,
  cloud,
}: Props) {
  const select = "min-w-0 rounded-lg border border-warm bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none sm:py-1.5";
  const btn = "rounded-lg border border-warm bg-white px-3 py-2 text-xs font-medium text-ink hover:border-blue-400 hover:text-blue-700 disabled:opacity-50 sm:py-1.5";
  const primary = "rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50 sm:py-1.5";

  return (
    <div className="no-print flex flex-wrap items-center gap-2 rounded-xl border border-warm bg-white p-3">
      <label className="flex flex-1 items-center gap-1.5 text-xs text-tan-ink sm:flex-none">
        City
        <select value={activeCityId} onChange={(e) => onCityChange(e.target.value)} className={`${select} flex-1 sm:flex-none`}>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <button onClick={onAddCity} className={btn}>+ Add city</button>

      <span className="mx-1 hidden h-5 w-px bg-warm sm:block" />

      <label className="flex flex-1 items-center gap-1.5 text-xs text-tan-ink sm:flex-none">
        Profile
        <select
          value={activeProfileId ?? ""}
          onChange={(e) => onProfileChange(e.target.value)}
          className={`${select} flex-1 sm:flex-none`}
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <button onClick={onToggleProfileEditor} className={btn}>Edit profile / anchors</button>

      <span className="mx-1 hidden h-5 w-px bg-warm sm:block" />

      <button onClick={onDiscover} disabled={discovering} className={primary}>
        {discovering ? "Discovering…" : "Discover apartments here"}
      </button>
      <button onClick={onAddApartment} className={btn}>+ Add apartment</button>
      <button onClick={onComputeCommutes} disabled={computing || anchorCount === 0} className={btn} title={anchorCount === 0 ? "Add an anchor first" : ""}>
        {computing ? "Computing…" : `Compute commutes (${anchorCount})`}
      </button>
      <button
        onClick={onAutofillAll}
        disabled={autofilling || autofillCount === 0}
        className={btn}
        title={autofillCount === 0 ? "No places with a website need filling" : "Read each website and fill rent + amenities"}
      >
        {autofilling ? "Auto-filling…" : `Auto-fill rent & amenities (${autofillCount})`}
      </button>

      <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium sm:ml-auto ${cloud ? "bg-blue-50 text-blue-700" : "bg-cream text-tan"}`}>
        <span className={`inline-block h-2 w-2 rounded-full ${cloud ? "bg-blue-600" : "bg-warm"}`} />
        {cloud ? "Synced to Supabase" : "Local only"}
      </span>
    </div>
  );
}
