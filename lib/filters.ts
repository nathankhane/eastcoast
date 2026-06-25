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
}

export const DEFAULT_FILTERS: Filters = {
  search: "",
  maxPrice: null,
  require2br2ba: false,
  amenityKeys: [],
  maxCommuteMinutes: null,
  availableByDate: "",
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

// Shortest commute across all anchors (null if none computed).
export function bestCommuteMinutes(p: Place, profile: SearchProfile): number | null {
  let best: number | null = null;
  for (const a of profile.anchors) {
    const m = commuteMinutes(p, a.id);
    if (m !== null && (best === null || m < best)) best = m;
  }
  return best;
}
