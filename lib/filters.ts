import { Place, SearchProfile } from "@/lib/types";
import { lowestPrice, placeHasAmenity, commuteMinutes } from "@/lib/scoring";

// Generic, profile-aware filter state. Amenity toggles and the commute cap are
// driven by the active SearchProfile rather than DMV-specific fields.
export interface Filters {
  search: string;
  maxPrice: number | null;
  require2br2ba: boolean;
  amenityKeys: string[]; // amenities that must be present (true)
  maxCommuteMinutes: number | null; // best commute to any anchor must be ≤ this
  availableByDate: string; // ISO date; empty = no filter

  // Quick filters (roommate apartment hunt)
  area: "all" | "arlington" | "dc"; // Arlington-only / DC-only
  priceCap: number | null; // quick rent cap: 3000 (under) or 3300 (near)
  requireGym: boolean;
  requireBasketball: boolean;
  minRating: number | null; // Google rating ≥ (4.0 or 4.3)
  maxMetroWalk: number | null; // walking minutes to Metro ≤ (10 or 15)
  needsPriceConfirmation: boolean; // only places flagged to re-check price/2BA
}

export const DEFAULT_FILTERS: Filters = {
  search: "",
  maxPrice: null,
  require2br2ba: false,
  amenityKeys: [],
  maxCommuteMinutes: null,
  availableByDate: "",
  area: "all",
  priceCap: null,
  requireGym: false,
  requireBasketball: false,
  minRating: null,
  maxMetroWalk: null,
  needsPriceConfirmation: false,
};

export function applyFilters(
  places: Place[],
  f: Filters,
  profile: SearchProfile | null,
  effectiveAvailableDate: (p: Place) => string
): Place[] {
  return places.filter((p) => {
    const d = p.apartmentDetails;
    const price = lowestPrice(p);

    if (f.search) {
      const q = f.search.toLowerCase();
      const hay = `${p.name} ${p.neighborhood} ${p.city} ${p.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }

    // Area (Arlington-only / DC-only)
    if (f.area === "arlington" && !isArlington(p)) return false;
    if (f.area === "dc" && !isDC(p)) return false;

    // Quick rent cap (under $3,000 / near $3,300). Unknown price is excluded.
    if (f.priceCap !== null && (price === null || price > f.priceCap)) return false;

    // Google rating threshold. Unknown rating is excluded.
    if (f.minRating !== null && (p.rating === null || p.rating === undefined || p.rating < f.minRating)) return false;

    // Metro walking-time cap. Unknown walk time is excluded.
    if (f.maxMetroWalk !== null) {
      const w = d?.walkingMinutesToMetro;
      if (w === null || w === undefined || w > f.maxMetroWalk) return false;
    }

    if (f.requireGym && !d?.hasGym) return false;
    if (f.requireBasketball && !d?.hasBasketballCourt) return false;
    if (f.needsPriceConfirmation && !d?.needsPriceConfirmation) return false;

    if (f.maxPrice !== null && price !== null && price > f.maxPrice) return false;
    if (f.require2br2ba && !d?.has2br2ba) return false;

    for (const key of f.amenityKeys) {
      if (placeHasAmenity(p, key) !== true) return false;
    }

    if (f.maxCommuteMinutes !== null && profile) {
      const best = bestCommuteMinutes(p, profile);
      // Keep places with no commute data yet (not computed) — only drop those
      // with a known commute that exceeds the cap.
      if (best !== null && best > f.maxCommuteMinutes) return false;
    }

    if (f.availableByDate) {
      const avail = effectiveAvailableDate(p);
      if (avail && avail > f.availableByDate) return false;
    }
    return true;
  });
}

function isArlington(p: Place): boolean {
  return /arlington/i.test(`${p.city} ${p.neighborhood}`);
}

function isDC(p: Place): boolean {
  return p.state === "DC" || /washington|\bdc\b/i.test(`${p.city} ${p.neighborhood}`);
}

// Shortest commute across all anchors (null if none computed).
export function bestCommuteMinutes(p: Place, profile: SearchProfile): number | null {
  let best: number | null = null;
  for (const a of profile.anchors) {
    const m = commuteMinutes(p, a.id);
    if (m !== null && (best === null || m < best)) best = m;
  }
  return best;
}
