"use client";

import { useState } from "react";
import { Place, PlaceReview, SearchProfile, UserMeta } from "@/lib/types";
import { computeFit, fitTier, TIER_COLOR, lowestPrice, commuteMinutes } from "@/lib/scoring";

interface Props {
  place: Place | null;
  meta: UserMeta;
  profile: SearchProfile | null;
  onClose: () => void;
  onMetaChange: (patch: Partial<UserMeta>) => void;
  onPlaceChange?: (id: string, patch: Partial<Place>) => void;
}

export default function DetailPanel({ place, meta, profile, onClose, onMetaChange, onPlaceChange }: Props) {
  const [liveDist, setLiveDist] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewNote, setReviewNote] = useState<string | null>(null);
  const [autofillLoading, setAutofillLoading] = useState(false);
  const [autofillNote, setAutofillNote] = useState<string | null>(null);

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

  async function fetchReviews() {
    if (!place) return;
    setReviewLoading(true);
    setReviewNote(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googlePlaceId: place.googlePlaceId,
          name: place.name,
          city: place.city,
          state: place.state,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setReviewNote(data.error);
        return;
      }
      onPlaceChange?.(place.id, {
        reviews: data.reviews ?? place.reviews,
        reviewsPerScore: data.reviewsPerScore ?? place.reviewsPerScore,
        rating: data.rating ?? place.rating,
        reviewCount: data.reviewCount ?? place.reviewCount,
        reviewsUpdatedAt: data.updatedAt,
      });
      if (Array.isArray(data.notes) && data.notes.length) setReviewNote(data.notes.join(" "));
      else if (!data.outscraperEnabled) setReviewNote("Showing Google's relevance-sorted reviews (add Outscraper key for recent 1★/5★).");
    } catch {
      setReviewNote("Could not fetch reviews.");
    } finally {
      setReviewLoading(false);
    }
  }

  async function autofillFromWebsite() {
    if (!place) return;
    setAutofillLoading(true);
    setAutofillNote(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: place.website || place.primarySourceUrl,
          googlePlaceId: place.googlePlaceId,
          name: place.name,
          address: `${place.streetAddress}, ${place.city}, ${place.state}`,
        }),
      });
      const data = await res.json();
      if (!data.implemented) {
        setAutofillNote(data.reason || "Auto-fill needs an LLM key.");
        return;
      }
      if (!data.ok) {
        setAutofillNote(data.reason || "Couldn't read the website.");
        return;
      }
      const patch = data.fields ?? {};
      const prev = place.apartmentDetails;
      onPlaceChange?.(place.id, {
        website: place.website || data.url,
        apartmentDetails: prev
          ? { ...prev, ...patch, availableDateManual: prev.availableDateManual }
          : (patch as Place["apartmentDetails"]),
      });
      const pct = Math.round((data.confidence ?? 0) * 100);
      setAutofillNote(
        `Filled rent & amenities from the website (${pct}% confidence${data.thinPage ? "; JS-heavy page, verify" : ""}).`
      );
    } catch {
      setAutofillNote("Auto-fill failed.");
    } finally {
      setAutofillLoading(false);
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
            <div className="mt-3">
              <button
                onClick={autofillFromWebsite}
                disabled={autofillLoading}
                className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50"
                title="Read the property website and fill rent + amenities"
              >
                {autofillLoading ? "Reading website…" : "Auto-fill rent & amenities from website"}
              </button>
              {autofillNote && <p className="mt-1.5 text-xs text-slate-600">{autofillNote}</p>}
            </div>
          </Section>
        )}

        <ReviewsSection
          place={place}
          loading={reviewLoading}
          note={reviewNote}
          onFetch={fetchReviews}
        />

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

function byNewest(a: PlaceReview, b: PlaceReview): number {
  const ta = a.publishTime ? Date.parse(a.publishTime) : 0;
  const tb = b.publishTime ? Date.parse(b.publishTime) : 0;
  return tb - ta;
}

function ReviewsSection({
  place,
  loading,
  note,
  onFetch,
}: {
  place: Place;
  loading: boolean;
  note: string | null;
  onFetch: () => void;
}) {
  const reviews = place.reviews ?? [];
  const sorted = [...reviews].sort(byNewest);
  // "Most recent" overall, plus the most recent low (1–2★) and high (5★).
  const recent = sorted.slice(0, 2);
  const recentLow =
    sorted.find((r) => r.rating > 0 && r.rating <= 2) ??
    [...reviews].sort((a, b) => a.rating - b.rating).find((r) => r.rating > 0);
  const recentHigh =
    sorted.find((r) => r.rating >= 5) ??
    [...reviews].sort((a, b) => b.rating - a.rating).find((r) => r.rating > 0);
  const dist = place.reviewsPerScore;

  return (
    <Section title="Google reviews">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-slate-900">
            {place.rating != null ? place.rating.toFixed(1) : "—"}
          </span>
          <span className="text-amber-500">★</span>
          <span className="text-xs text-slate-500">
            {place.reviewCount != null ? `${place.reviewCount.toLocaleString()} reviews` : "no count"}
          </span>
        </div>
        <button
          onClick={onFetch}
          disabled={loading}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:border-slate-400 disabled:opacity-50"
        >
          {loading ? "Loading…" : reviews.length ? "Refresh reviews" : "Load reviews"}
        </button>
      </div>

      {dist && <RatingBars dist={dist} />}

      {reviews.length === 0 && !loading && (
        <p className="text-xs text-slate-500">No reviews loaded yet. Tap “Load reviews”.</p>
      )}

      {(recentLow || recentHigh) && (
        <div className="mt-3 space-y-3">
          {recentHigh && <ReviewCard label="Most recent high" review={recentHigh} accent="green" />}
          {recentLow && <ReviewCard label="Most recent low" review={recentLow} accent="red" />}
        </div>
      )}

      {recent.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Latest reviews
          </div>
          <div className="space-y-3">
            {recent.map((r, i) => (
              <ReviewCard key={i} review={r} />
            ))}
          </div>
        </div>
      )}

      {note && <p className="mt-2 text-[11px] text-slate-400">{note}</p>}
    </Section>
  );
}

function RatingBars({ dist }: { dist: Record<string, number> }) {
  const total = Object.values(dist).reduce((s, n) => s + (n || 0), 0) || 1;
  return (
    <div className="mb-1 space-y-1">
      {["5", "4", "3", "2", "1"].map((star) => {
        const n = dist[star] ?? 0;
        const pct = Math.round((n / total) * 100);
        return (
          <div key={star} className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="w-3 text-right">{star}</span>
            <span className="text-amber-400">★</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className={star === "1" || star === "2" ? "h-full bg-red-400" : "h-full bg-brand-400"}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-8 text-right tabular-nums">{n.toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );
}

function ReviewCard({
  review,
  label,
  accent,
}: {
  review: PlaceReview;
  label?: string;
  accent?: "green" | "red";
}) {
  const border =
    accent === "green" ? "border-green-200 bg-green-50" : accent === "red" ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50";
  return (
    <div className={`rounded-lg border p-2.5 ${border}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
          <span className="text-amber-500">{"★".repeat(Math.max(0, Math.round(review.rating)))}</span>
          {label && <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>}
        </div>
        <span className="shrink-0 text-[11px] text-slate-400">{review.relativeTime ?? relTime(review.publishTime)}</span>
      </div>
      <p className="line-clamp-4 text-xs text-slate-700">{review.text || "(no text)"}</p>
      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
        <span>{review.author}</span>
        {review.reviewUrl && (
          <a href={review.reviewUrl} target="_blank" rel="noopener" className="text-brand-600 hover:underline">
            View →
          </a>
        )}
      </div>
    </div>
  );
}

function relTime(iso?: string): string {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const days = Math.round((Date.now() - then) / 86_400_000);
  if (days < 31) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
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
