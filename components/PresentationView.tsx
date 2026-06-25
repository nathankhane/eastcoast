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
      <div className="rounded-xl border border-warm bg-white p-6">
        <h1 className="text-2xl font-bold text-ink">
          Our {city?.name ?? "apartment"} shortlist
        </h1>
        <p className="mt-1 text-sm text-tan-ink">
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
              className="flex flex-col rounded-xl border border-warm bg-white p-4 text-left transition hover:border-tan hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold text-ink">{p.name}</div>
                  <div className="text-xs text-tan-ink">{p.neighborhood}, {p.city}</div>
                </div>
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-bold text-white"
                  style={{ background: TIER_COLOR[fitTier(fit)] }}
                >
                  {fit}
                </span>
              </div>

              <div className="mt-3 text-2xl font-bold text-ink">
                {price ? `$${price.toLocaleString()}` : "Confirm"}
                <span className="text-sm font-normal text-tan">{price ? "/mo+" : ""}</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {d?.hasBasketballCourt && (
                  <Tag color={d.basketballCourtType === "indoor" ? "bg-orange-100 text-orange-700" : "bg-amber-50 text-amber-700"}>
                    🏀 {d.basketballCourtType}
                  </Tag>
                )}
                {d?.hasGym && <Tag color="bg-cream text-ink">🏋️ gym</Tag>}
                {d?.hasCoffee && <Tag color="bg-stone-100 text-stone-700">☕ coffee</Tag>}
                {d?.hasBeerOrTap && <Tag color="bg-amber-100 text-amber-800">🍺 tap/bar</Tag>}
              </div>

              <div className="mt-3 space-y-1 text-xs text-ink/70">
                {(() => {
                  const anchors = profile?.anchors ?? [];
                  const computed = anchors.filter((a) => commuteMinutes(p, a.id) != null);
                  if (anchors.length > 0 && computed.length === 0) {
                    return <div className="text-tan">Commute not computed yet</div>;
                  }
                  return computed.map((a) => (
                    <div key={a.id}>
                      ➡️ {a.label}: ~{commuteMinutes(p, a.id)} min
                    </div>
                  ));
                })()}
                {(!profile || profile.anchors.length === 0) && d?.nearestMetro && (
                  <div>🚇 {d.nearestMetro} · {d.walkingMinutesToMetro ?? "?"} min walk</div>
                )}
              </div>

              <p className="mt-3 border-t border-warm/60 pt-3 text-xs italic text-tan-ink">{p.roommatePitch}</p>
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
