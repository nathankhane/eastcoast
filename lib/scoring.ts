import { Place, SearchProfile } from "@/lib/types";

export const BUDGET_CAP = 3000;

export interface FitBreakdown {
  score: number;
  lines: { label: string; points: number }[];
}

// ============================================================================
// Fit score.
//   computeFit(place)          -> legacy DMV formula (backward compatible).
//   computeFit(place, profile) -> generic, config-driven weighted score.
// Both return a 0-100 score plus a per-signal breakdown for the detail panel.
// ============================================================================

export function computeFit(place: Place, profile?: SearchProfile): FitBreakdown {
  return profile ? computeFitProfile(place, profile) : computeFitLegacy(place);
}

// ---------------------------------------------------------------------------
// Config-driven score (used everywhere once a profile is active).
// Each component contributes weight * factor (factor in 0..1); the total is
// normalized to 0-100 by the sum of weights so profiles stay comparable.
// ---------------------------------------------------------------------------
function computeFitProfile(place: Place, profile: SearchProfile): FitBreakdown {
  const comps: { label: string; weight: number; factor: number }[] = [];
  const d = place.apartmentDetails;
  const price = lowestPrice(place);

  // Budget
  if (profile.budgetWeight > 0 && profile.budgetCap != null) {
    let factor: number;
    if (price == null) factor = 0.4; // unknown
    else if (price <= profile.budgetCap) factor = 1;
    else factor = clamp(1 - (price - profile.budgetCap) / profile.budgetCap, 0, 1);
    comps.push({ label: `Budget (≤ $${profile.budgetCap.toLocaleString()})`, weight: profile.budgetWeight, factor });
  }

  // Beds / baths
  if (profile.bedBathWeight > 0) {
    const factor = d?.has2br2ba ? 1 : 0;
    comps.push({ label: "Beds/baths match", weight: profile.bedBathWeight, factor });
  }

  // Anchors (commute)
  for (const anchor of profile.anchors) {
    if (anchor.weight <= 0) continue;
    const mins = commuteMinutes(place, anchor.id);
    let factor: number;
    if (mins == null) factor = 0.4; // unknown until /api/commute runs
    else if (anchor.targetMinutes) factor = clamp(1 - Math.max(0, mins - anchor.targetMinutes) / anchor.targetMinutes, 0, 1);
    else factor = clamp(1 - mins / 60, 0, 1);
    comps.push({ label: `Commute: ${anchor.label}`, weight: anchor.weight, factor });
  }

  // Amenities
  for (const a of profile.amenities) {
    if (a.weight <= 0) continue;
    const has = placeHasAmenity(place, a.key);
    const factor = has === true ? 1 : has === false ? 0 : 0.3; // null = unknown
    comps.push({ label: a.label, weight: a.weight, factor });
  }

  const totalWeight = comps.reduce((s, c) => s + c.weight, 0) || 1;
  const score = Math.round((100 * comps.reduce((s, c) => s + c.weight * c.factor, 0)) / totalWeight);

  const lines = comps.map((c) => ({
    label: c.label,
    points: Math.round((100 * c.weight * c.factor) / totalWeight),
  }));

  return { score: clamp(score, 0, 100), lines };
}

// ---------------------------------------------------------------------------
// Legacy DMV formula — preserved for the shipped seed dataset.
// ---------------------------------------------------------------------------
function computeFitLegacy(place: Place): FitBreakdown {
  const lines: { label: string; points: number }[] = [];
  const d = place.apartmentDetails;

  if (!d) {
    return { score: place.fitScore ?? 0, lines: [{ label: "Stored score", points: place.fitScore ?? 0 }] };
  }

  const price = d.priceLow ?? d.priceHigh ?? null;
  if (price !== null && price < BUDGET_CAP) lines.push({ label: "Price under $3,000", points: 25 });
  else if (price === null) lines.push({ label: "Price unknown", points: -10 });

  const walk = d.walkingMinutesToMetro;
  if (walk !== null && walk <= 10) lines.push({ label: "≤10 min walk to Metro", points: 25 });
  else if (walk !== null && walk <= 15) lines.push({ label: "≤15 min walk to Metro", points: 15 });
  else if (walk !== null && walk > 20) lines.push({ label: "Long walk to Metro", points: -5 });

  if (d.hasGym) lines.push({ label: "Has gym", points: 10 });
  if (d.hasBasketballCourt) lines.push({ label: "Has basketball court", points: 15 });
  if (d.basketballCourtType === "indoor") lines.push({ label: "Indoor basketball court", points: 10 });

  const isFarOut = place.neighborhood.toLowerCase().includes("ashburn");
  if (!isFarOut && place.state === "VA") lines.push({ label: "Good location between McLean & DC", points: 15 });
  if (isFarOut) lines.push({ label: "Far from McLean/DC (long commute)", points: -25 });

  if (d.has2br2ba) lines.push({ label: "2BR/2BA confirmed", points: 10 });
  else lines.push({ label: "2BR/2BA not confirmed", points: -10 });

  const raw = lines.reduce((sum, l) => sum + l.points, 0);
  const score = Math.max(0, Math.min(100, raw));
  return { score, lines };
}

// ---------------------------------------------------------------------------
// Amenity detection — maps a generic amenity key to a place's known data.
// Returns true / false / null(unknown). Uses structured apartmentDetails when
// present, then falls back to scanning tags (useful for discovered places).
// ---------------------------------------------------------------------------
export function placeHasAmenity(place: Place, key: string): boolean | null {
  const d = place.apartmentDetails;
  const tags = place.tags.map((t) => t.toLowerCase()).join(" ");
  const tagHas = (...words: string[]) => words.some((w) => tags.includes(w));

  switch (key) {
    case "gym":
      return d ? d.hasGym : tagHas("gym", "fitness") ? true : null;
    case "pool":
      return tagHas("pool") ? true : null;
    case "basketball":
      return d ? d.hasBasketballCourt : tagHas("basketball") ? true : null;
    case "indoor_basketball":
      if (d) return d.basketballCourtType === "indoor";
      return tagHas("indoor basketball") ? true : null;
    case "coffee":
      return d ? d.hasCoffee : tagHas("coffee", "cafe") ? true : null;
    case "beer":
      return d ? d.hasBeerOrTap : tagHas("beer", "tap", "lounge") ? true : null;
    case "parking":
      return tagHas("parking", "garage") ? true : null;
    default:
      return tagHas(key.replace(/_/g, " ")) ? true : null;
  }
}

// Minutes to an anchor from the place's stored commute results (or null).
export function commuteMinutes(place: Place, anchorId: string): number | null {
  const c = place.commutes?.find((x) => x.anchorId === anchorId);
  if (!c || c.durationSeconds == null) return null;
  return Math.round(c.durationSeconds / 60);
}

export type FitTier = "green" | "yellow" | "red";

export function fitTier(score: number): FitTier {
  if (score >= 78) return "green";
  if (score >= 66) return "yellow";
  return "red";
}

export const TIER_COLOR: Record<FitTier, string> = {
  green: "#16a34a",
  yellow: "#eab308",
  red: "#dc2626",
};

export function hasIndoorCourt(place: Place): boolean {
  return place.apartmentDetails?.basketballCourtType === "indoor";
}

export function hasAnyCourt(place: Place): boolean {
  return !!place.apartmentDetails?.hasBasketballCourt;
}

export function lowestPrice(place: Place): number | null {
  return place.apartmentDetails?.priceLow ?? place.apartmentDetails?.priceHigh ?? null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
