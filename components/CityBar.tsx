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
  const select = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-brand-400 focus:outline-none";
  const btn = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-brand-400 hover:text-brand-700 disabled:opacity-50";
  const primary = "rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-50";

  return (
    <div className="no-print flex flex-wrap items-center gap-2 rounded-xl border border-brand-100 bg-white p-3">
      <label className="flex items-center gap-1.5 text-xs text-slate-500">
        City
        <select value={activeCityId} onChange={(e) => onCityChange(e.target.value)} className={select}>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <button onClick={onAddCity} className={btn}>+ Add city</button>

      <span className="mx-1 h-5 w-px bg-slate-200" />

      <label className="flex items-center gap-1.5 text-xs text-slate-500">
        Profile
        <select
          value={activeProfileId ?? ""}
          onChange={(e) => onProfileChange(e.target.value)}
          className={select}
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <button onClick={onToggleProfileEditor} className={btn}>Edit profile / anchors</button>

      <span className="mx-1 h-5 w-px bg-slate-200" />

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

      <span className={`ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${cloud ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-400"}`}>
        <span className={`inline-block h-2 w-2 rounded-full ${cloud ? "bg-brand-500" : "bg-slate-300"}`} />
        {cloud ? "Synced to Supabase" : "Local only"}
      </span>
    </div>
  );
}
