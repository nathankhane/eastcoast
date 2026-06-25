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
  cloud,
}: Props) {
  const select = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm";
  const btn = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50";
  const primary = "rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50";

  return (
    <div className="no-print flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
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
      <button onClick={onComputeCommutes} disabled={computing || anchorCount === 0} className={btn} title={anchorCount === 0 ? "Add an anchor first" : ""}>
        {computing ? "Computing…" : `Compute commutes (${anchorCount})`}
      </button>

      <span className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-400">
        <span className={`inline-block h-2 w-2 rounded-full ${cloud ? "bg-green-500" : "bg-slate-300"}`} />
        {cloud ? "Synced to Supabase" : "Local only"}
      </span>
    </div>
  );
}
