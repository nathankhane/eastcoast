"use client";

import { useState } from "react";
import { Place, SearchProfile, UserMeta } from "@/lib/types";
import { computeFit, fitTier, TIER_COLOR, lowestPrice, commuteMinutes } from "@/lib/scoring";

interface Props {
  place: Place | null;
  meta: UserMeta;
  profile: SearchProfile | null;
  onClose: () => void;
  onMetaChange: (patch: Partial<UserMeta>) => void;
}

export default function DetailPanel({ place, meta, profile, onClose, onMetaChange }: Props) {
  const [liveDist, setLiveDist] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);

  if (!place) return null;
  const d = place.apartmentDetails;
  const fit = computeFit(place, profile ?? undefined);
  const price = lowestPrice(place);
  const firstAnchor = profile?.anchors[0];

  async function fetchLiveDistance() {
    if (!place || place.latitude == null || place.longitude == null) return;
    // Prefer the active profile's first anchor; fall back to the nearest metro.
    const destination =
      firstAnchor && firstAnchor.latitude != null && firstAnchor.longitude != null
        ? { lat: firstAnchor.latitude, lng: firstAnchor.longitude }
        : firstAnchor?.address
        ? firstAnchor.address
        : d?.nearestMetro
        ? `${d.nearestMetro} Station, ${place.city}, ${place.state}`
        : null;
    if (!destination) {
      setLiveDist("No anchor or metro to measure to.");
      return;
    }
    const mode = firstAnchor?.mode ?? "WALK";
    setLiveLoading(true);
    setLiveDist(null);
    try {
      const res = await fetch("/api/distance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { lat: place.latitude, lng: place.longitude },
          destination,
          mode,
        }),
      });
      const data = await res.json();
      if (!data.enabled) setLiveDist("Live commute off (no Routes API key configured).");
      else if (data.error) setLiveDist("Could not fetch live commute.");
      else
        setLiveDist(
          `Live ${mode.toLowerCase()}: ${data.durationText}` +
            (data.distanceMeters ? ` (${(data.distanceMeters / 1609).toFixed(2)} mi)` : "")
        );
    } catch {
      setLiveDist("Could not fetch live commute.");
    } finally {
      setLiveLoading(false);
    }
  }

  const mapsEmbedSrc =
    place.latitude && place.longitude
      ? `https://maps.google.com/maps?q=${place.latitude},${place.longitude}&z=15&output=embed`
      : null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
      <div className="flex items-start justify-between border-b border-slate-200 p-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: TIER_COLOR[fitTier(fit.score)] }}
            />
            <h2 className="text-lg font-bold text-slate-900">{place.name}</h2>
          </div>
          <p className="text-sm text-slate-500">
            {place.streetAddress}, {place.city}, {place.state} {place.zip}
          </p>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4 text-sm">
        {mapsEmbedSrc && (
          <iframe
            title="map preview"
            src={mapsEmbedSrc}
            className="h-40 w-full rounded-lg border border-slate-200"
            loading="lazy"
          />
        )}

        <Section title="Why this might work for us">
          <p className="text-slate-700">{place.roommatePitch}</p>
        </Section>

        <Section title="Fit score">
          <div className="mb-2 text-2xl font-bold text-slate-900">{fit.score}/100</div>
          <ul className="space-y-0.5">
            {fit.lines.map((l, i) => (
              <li key={i} className="flex justify-between text-xs">
                <span className="text-slate-600">{l.label}</span>
                <span className={l.points >= 0 ? "text-green-600" : "text-red-600"}>
                  {l.points >= 0 ? "+" : ""}
                  {l.points}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        {profile && profile.anchors.length > 0 && (
          <Section title="Commute to your anchors">
            <Facts
              rows={profile.anchors.map((a) => {
                const mins = commuteMinutes(place!, a.id);
                return [a.label, mins != null ? `${mins} min (${a.mode.toLowerCase()})` : "Not computed yet"] as [string, string];
              })}
            />
            <div className="mt-3">
              <button
                onClick={fetchLiveDistance}
                disabled={liveLoading}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:border-slate-400 disabled:opacity-50"
              >
                {liveLoading ? "Checking…" : `Check live commute${firstAnchor ? ` to ${firstAnchor.label}` : ""}`}
              </button>
              {liveDist && <p className="mt-1.5 text-xs text-slate-600">{liveDist}</p>}
            </div>
          </Section>
        )}

        {d && (
          <Section title="Key facts">
            <Facts
              rows={[
                ["Google rating", place.rating != null ? `${place.rating}★ (${place.reviewCount ?? "?"} reviews)` : "Not rated / fetch"],
                ["2BR/2BA price", price ? `From $${price.toLocaleString()}/mo` : "Confirm with leasing"],
                ["Price notes", d.priceNotes],
                ["Price status", d.needsPriceConfirmation ? "⚠︎ Re-confirm price & 2BA with leasing" : ""],
                ["Metro", `${d.nearestMetro} (${d.metroLine})`],
                ["Walk to Metro", `${d.walkingMinutesToMetro ?? "?"} min · ${d.walkingMilesToMetro ?? "?"} mi`],
                ["To McLean (transit)", d.transitMinutesToMcLean ? `${d.transitMinutesToMcLean} min` : "—"],
                ["To DC (transit)", d.transitMinutesToDC ? `${d.transitMinutesToDC} min` : "—"],
                ["Gym", d.hasGym ? "Yes" : "No"],
                ["Coffee", d.hasCoffee ? "Yes" : "Unknown"],
                ["Beer / tap", d.hasBeerOrTap ? "Yes" : "Unknown"],
                ["Basketball", d.hasBasketballCourt ? `${d.basketballCourtType}` : "None"],
                ["Basketball notes", d.basketballNotes],
                ["Parking", d.parkingNotes],
                ["Availability", d.availabilityStatus],
              ]}
            />
          </Section>
        )}

        <Section title="Pros & cons">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1 text-xs font-semibold text-green-700">Pros</div>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-700">
                {place.pros.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-red-700">Cons</div>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-700">
                {place.cons.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
          </div>
        </Section>

        <Section title="Sources">
          <ul className="space-y-1 text-xs">
            {place.website && (
              <li>
                <a href={place.website} target="_blank" rel="noopener" className="text-brand-600 hover:underline">
                  Official site →
                </a>
              </li>
            )}
            {place.googleMapsUri && (
              <li>
                <a href={place.googleMapsUri} target="_blank" rel="noopener" className="text-brand-600 hover:underline">
                  Google Maps listing →
                </a>
              </li>
            )}
            {place.secondarySourceUrls.map((u, i) => (
              <li key={i}>
                <a href={u} target="_blank" rel="noopener" className="text-brand-600 hover:underline">
                  {new URL(u).hostname.replace("www.", "")} →
                </a>
              </li>
            ))}
          </ul>
          {place.sourceQuotes.length > 0 && (
            <ul className="mt-2 space-y-1 border-l-2 border-slate-200 pl-3 text-xs italic text-slate-500">
              {place.sourceQuotes.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
          )}
        </Section>

        {/* ---- Manual editing ---- */}
        <Section title="Our notes & status">
          <div className="space-y-3">
            <Field label="Available date (manual)">
              <input
                type="date"
                value={meta.availableDateManual}
                onChange={(e) => onMetaChange({ availableDateManual: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
              />
            </Field>
            <Field label="Notes">
              <textarea
                value={meta.notes}
                onChange={(e) => onMetaChange({ notes: e.target.value })}
                rows={3}
                placeholder="Anything to remember…"
                className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
              />
            </Field>
            <Field label="Roommate reaction">
              <input
                value={meta.roommateReaction}
                onChange={(e) => onMetaChange({ roommateReaction: e.target.value })}
                placeholder="What did your roommate think?"
                className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tour date">
                <input
                  type="date"
                  value={meta.tourDate}
                  onChange={(e) => onMetaChange({ tourDate: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                />
              </Field>
              <Field label="Personal rank">
                <input
                  type="number"
                  min={1}
                  value={meta.personalRanking ?? ""}
                  onChange={(e) =>
                    onMetaChange({ personalRanking: e.target.value === "" ? null : Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                />
              </Field>
            </div>
            <div className="flex gap-4">
              <Check label="Tour scheduled" checked={meta.tourScheduled} onChange={(v) => onMetaChange({ tourScheduled: v })} />
              <Check label="Contacted leasing" checked={meta.contactedLeasing} onChange={(v) => onMetaChange({ contactedLeasing: v })} />
            </div>
            <Field label="Decision">
              <div className="flex gap-2">
                {(["keep", "maybe", "reject"] as const).map((dec) => (
                  <button
                    key={dec}
                    onClick={() => onMetaChange({ decision: meta.decision === dec ? "unset" : dec })}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold capitalize transition ${
                      meta.decision === dec
                        ? dec === "keep"
                          ? "border-green-600 bg-green-600 text-white"
                          : dec === "maybe"
                          ? "border-yellow-500 bg-yellow-500 text-white"
                          : "border-red-600 bg-red-600 text-white"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {dec}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </Section>

        <p className="pb-4 text-[11px] text-slate-400">
          Last verified {place.lastVerified} · confidence {place.confidenceScore}/100 · pricing changes daily,
          confirm with leasing.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-600">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      {label}
    </label>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="space-y-1">
      {rows
        .filter(([, v]) => v && v !== "—")
        .map(([k, v], i) => (
          <div key={i} className="flex gap-2 text-xs">
            <dt className="w-28 shrink-0 text-slate-500">{k}</dt>
            <dd className="text-slate-800">{v}</dd>
          </div>
        ))}
    </dl>
  );
}
