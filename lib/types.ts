// ============================================================================
// PlaceScout Map — Core data model
// Generic enough to reuse for restaurants, hotels, vendors, competitors, etc.
// ============================================================================

export type PlaceCategory =
  | "apartment"
  | "restaurant"
  | "business"
  | "hotel"
  | "vendor"
  | "other";

export type BasketballCourtType =
  | "none"
  | "outdoor"
  | "indoor"
  | "half-court"
  | "nearby public court"
  | "unknown";

export type UserDecision = "keep" | "maybe" | "reject" | "unset";

export type TravelMode = "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT";

// ============================================================================
// Multi-city model
// ============================================================================

export interface City {
  id: string; // slug, e.g. "nyc"
  name: string; // "New York City"
  region: string; // state / area, e.g. "NY"
  country: string; // "US"
  center: { lat: number; lng: number };
  defaultZoom: number;
}

// A place of interest you commute to (office, downtown, partner's place...).
// Drives both the fit score and the Routes API commute lookups.
export interface Anchor {
  id: string;
  label: string; // "Office", "Downtown"
  address: string;
  latitude: number | null;
  longitude: number | null;
  mode: TravelMode; // how you'd travel there
  targetMinutes: number | null; // ideal max one-way commute; under = full credit
  weight: number; // relative importance (0-100)
}

export interface AmenityRequirement {
  key: string; // matches keys understood by placeHasAmenity(): gym, pool, basketball, indoor_basketball, coffee, beer, parking
  label: string;
  required: boolean; // hard filter when true
  weight: number; // contribution to fit score (0-100)
}

// Per-city search + scoring configuration. Replaces DMV-hardcoded logic.
export interface SearchProfile {
  id: string;
  cityId: string;
  name: string;
  query: string; // text query for Places discovery, e.g. "2 bedroom apartments"
  budgetCap: number | null; // monthly rent ceiling
  budgetWeight: number; // fit-score weight for budget (0-100)
  minBeds: number | null;
  minBaths: number | null;
  bedBathWeight: number; // weight for matching beds/baths
  anchors: Anchor[];
  amenities: AmenityRequirement[];
}

// Result of a Routes API commute lookup from a place to one anchor.
export interface CommuteResult {
  anchorId: string;
  mode: TravelMode;
  durationSeconds: number | null;
  distanceMeters: number | null;
  durationText: string;
  computedAt: string; // ISO timestamp (cache freshness)
}

// Apartment-specific data, nested under a Place when category === "apartment".
export interface ApartmentDetails {
  has2br2ba: boolean;
  priceLow: number | null;
  priceHigh: number | null;
  priceNotes: string;
  availabilityStatus: string;
  availableDateManual: string; // ISO date string, user-editable
  nearestMetro: string;
  metroLine: string;
  walkingMilesToMetro: number | null;
  walkingMinutesToMetro: number | null;
  drivingMinutesToMcLean: number | null;
  transitMinutesToMcLean: number | null;
  transitMinutesToDC: number | null;
  hasGym: boolean;
  hasCoffee: boolean;
  hasBeerOrTap: boolean;
  hasBasketballCourt: boolean;
  basketballCourtType: BasketballCourtType;
  basketballNotes: string;
  parkingNotes: string;
}

// User-editable overlay, persisted to localStorage and merged at load.
export interface UserMeta {
  notes: string;
  roommateReaction: string;
  tourDate: string; // ISO date string
  tourScheduled: boolean;
  contactedLeasing: boolean;
  personalRanking: number | null; // 1 = best
  decision: UserDecision;
  availableDateManual: string; // mirror for non-apartment categories
}

export interface Place {
  id: string;
  name: string;
  category: PlaceCategory;

  // Multi-city / provenance
  cityId?: string; // which City this belongs to
  googlePlaceId?: string; // Places API (New) resource id, for dedup + refresh

  // Location
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  neighborhood: string;
  latitude: number | null;
  longitude: number | null;
  coordsApproximate: boolean;

  // Links / provenance
  website: string;
  primarySourceUrl: string;
  secondarySourceUrls: string[];
  sourceQuotes: string[];

  // Generic scoring / display
  rating: number | null; // generic 0-5 (for restaurants etc.)
  priceLevel: string; // generic "$$" style (for restaurants etc.)
  tags: string[];
  imageUrls: string[];

  // Scoring
  confidenceScore: number; // 0-100
  fitScore: number; // 0-100
  fitReasoning: string;
  roommatePitch: string;
  pros: string[];
  cons: string[];

  lastVerified: string; // ISO date string

  // Category-specific
  apartmentDetails?: ApartmentDetails;

  // Per-anchor commute times (filled by /api/commute via Routes API).
  commutes?: CommuteResult[];

  // Arbitrary extension point for future categories
  customFields?: Record<string, string | number | boolean | null>;
}

// What we persist per-place in localStorage (id -> UserMeta).
export type UserMetaStore = Record<string, Partial<UserMeta>>;

export const DEFAULT_USER_META: UserMeta = {
  notes: "",
  roommateReaction: "",
  tourDate: "",
  tourScheduled: false,
  contactedLeasing: false,
  personalRanking: null,
  decision: "unset",
  availableDateManual: "",
};
