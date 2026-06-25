"use client";

import { City, Place, SearchProfile } from "@/lib/types";
import { computeFit, fitTier, TIER_COLOR, lowestPrice, commuteMinutes } from "@/lib/scoring";

interface Props {
  places: Place[];
  profile: SearchProfile | null;
  city: City | null;
  onSelect: (id: string) => void;
}

export default function PresentationView({ places, profile, city, onSelect }: Props) {
  const ranked = [...places].sort(
    (a, b) => computeFit(b, profile ?? undefined).score - computeFit(a, profile ?? undefined).score
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Our {city?.name ?? "apartment"} shortlist
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {profile?.name ?? "Ranked by fit"} · ranked by fit. Pricing changes daily — confirm with leasing.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {ranked.map((p) => {
          const d = p.apartmentDetails;
          const fit = computeFit(p, profile ?? undefined).score;
          const price = lowestPrice(p);
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-400 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold text-slate-900">{p.name}</div>
                  <div className="text-xs text-slate-500">{p.neighborhood}, {p.city}</div>
                </div>
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-bold text-white"
                  style={{ background: TIER_COLOR[fitTier(fit)] }}
                >
                  {fit}
                </span>
              </div>

              <div className="mt-3 text-2xl font-bold text-slate-900">
                {price ? `$${price.toLocaleString()}` : "Confirm"}
                <span className="text-sm font-normal text-slate-400">{price ? "/mo+" : ""}</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {d?.hasBasketballCourt && (
                  <Tag color={d.basketballCourtType === "indoor" ? "bg-orange-100 text-orange-700" : "bg-amber-50 text-amber-700"}>
                    🏀 {d.basketballCourtType}
                  </Tag>
                )}
                {d?.hasGym && <Tag color="bg-slate-100 text-slate-700">🏋️ gym</Tag>}
                {d?.hasCoffee && <Tag color="bg-stone-100 text-stone-700">☕ coffee</Tag>}
                {d?.hasBeerOrTap && <Tag color="bg-yellow-100 text-yellow-800">🍺 tap/bar</Tag>}
              </div>

              <div className="mt-3 space-y-1 text-xs text-slate-600">
                {profile?.anchors.map((a) => {
                  const mins = commuteMinutes(p, a.id);
                  return (
                    <div key={a.id}>➡️ {a.label}: {mins != null ? `~${mins} min` : "—"}</div>
                  );
                })}
                {(!profile || profile.anchors.length === 0) && d?.nearestMetro && (
                  <div>🚇 {d.nearestMetro} · {d.walkingMinutesToMetro ?? "?"} min walk</div>
                )}
              </div>

              <p className="mt-3 border-t border-slate-100 pt-3 text-xs italic text-slate-500">{p.roommatePitch}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${color}`}>{children}</span>;
}
