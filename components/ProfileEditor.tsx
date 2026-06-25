"use client";

import { Anchor, SearchProfile, TravelMode } from "@/lib/types";

interface Props {
  profile: SearchProfile;
  onChange: (p: SearchProfile) => void;
  onClose: () => void;
}

const MODES: TravelMode[] = ["DRIVE", "TRANSIT", "WALK", "BICYCLE"];

export default function ProfileEditor({ profile, onChange, onClose }: Props) {
  const set = (patch: Partial<SearchProfile>) => onChange({ ...profile, ...patch });

  const setAnchor = (id: string, patch: Partial<Anchor>) =>
    set({ anchors: profile.anchors.map((a) => (a.id === id ? { ...a, ...patch } : a)) });

  const addAnchor = () => {
    const id = `anchor-${Date.now()}`;
    set({
      anchors: [
        ...profile.anchors,
        { id, label: "New anchor", address: "", latitude: null, longitude: null, mode: "TRANSIT", targetMinutes: 30, weight: 20 },
      ],
    });
  };

  const removeAnchor = (id: string) => set({ anchors: profile.anchors.filter((a) => a.id !== id) });

  const input = "rounded-lg border border-warm px-2 py-1 text-sm";

  return (
    <div className="no-print space-y-4 rounded-xl border border-warm bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">Search profile</h3>
        <button onClick={onClose} className="text-xs text-tan hover:text-ink">Close ✕</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Profile name">
          <input value={profile.name} onChange={(e) => set({ name: e.target.value })} className={`${input} w-full`} />
        </Field>
        <Field label="Search query (Places)">
          <input value={profile.query} onChange={(e) => set({ query: e.target.value })} className={`${input} w-full`} />
        </Field>
        <Field label="Budget cap ($/mo)">
          <input
            type="number"
            value={profile.budgetCap ?? ""}
            onChange={(e) => set({ budgetCap: e.target.value === "" ? null : Number(e.target.value) })}
            className={`${input} w-full`}
          />
        </Field>
        <Field label="Budget weight">
          <input
            type="number"
            value={profile.budgetWeight}
            onChange={(e) => set({ budgetWeight: Number(e.target.value) })}
            className={`${input} w-full`}
          />
        </Field>
      </div>

      {/* Anchors */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wide text-tan">Commute anchors</span>
          <button onClick={addAnchor} className="rounded-lg border border-warm px-2 py-1 text-xs font-medium hover:border-tan">
            + Add anchor
          </button>
        </div>
        <div className="space-y-2">
          {profile.anchors.length === 0 && (
            <p className="text-xs text-tan">No anchors yet. Add places you commute to (office, downtown…) to score & rank by commute.</p>
          )}
          {profile.anchors.map((a) => (
            <div key={a.id} className="grid items-end gap-2 rounded-lg border border-warm p-2 sm:grid-cols-2 lg:grid-cols-6">
              <Field label="Label">
                <input value={a.label} onChange={(e) => setAnchor(a.id, { label: e.target.value })} className={`${input} w-full`} />
              </Field>
              <Field label="Address">
                <input
                  value={a.address}
                  onChange={(e) => setAnchor(a.id, { address: e.target.value, latitude: null, longitude: null })}
                  placeholder="123 Main St, City, ST"
                  className={`${input} w-full`}
                />
              </Field>
              <Field label="Mode">
                <select value={a.mode} onChange={(e) => setAnchor(a.id, { mode: e.target.value as TravelMode })} className={`${input} w-full`}>
                  {MODES.map((m) => (
                    <option key={m} value={m}>{m.toLowerCase()}</option>
                  ))}
                </select>
              </Field>
              <Field label="Target min">
                <input
                  type="number"
                  value={a.targetMinutes ?? ""}
                  onChange={(e) => setAnchor(a.id, { targetMinutes: e.target.value === "" ? null : Number(e.target.value) })}
                  className={`${input} w-full`}
                />
              </Field>
              <Field label="Weight">
                <input type="number" value={a.weight} onChange={(e) => setAnchor(a.id, { weight: Number(e.target.value) })} className={`${input} w-full`} />
              </Field>
              <button onClick={() => removeAnchor(a.id)} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
                Remove
              </button>
            </div>
          ))}
        </div>
        {profile.anchors.some((a) => a.latitude == null) && (
          <p className="mt-1 text-[11px] text-tan">
            Tip: addresses are geocoded automatically the first time you run “Compute commutes”.
          </p>
        )}
      </div>

      {/* Amenities */}
      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-tan">Amenity weights</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {profile.amenities.map((am) => (
            <Field key={am.key} label={am.label}>
              <input
                type="number"
                value={am.weight}
                onChange={(e) =>
                  set({
                    amenities: profile.amenities.map((x) =>
                      x.key === am.key ? { ...x, weight: Number(e.target.value) } : x
                    ),
                  })
                }
                className={`${input} w-full`}
              />
            </Field>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-tan-ink">{label}</span>
      {children}
    </label>
  );
}
