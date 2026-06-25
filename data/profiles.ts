import { City, SearchProfile, AmenityRequirement } from "@/lib/types";

// ============================================================================
// Built-in cities. Users can add more at runtime (geocoded on the fly), but
// these ship as starting points so the app is useful immediately.
// ============================================================================

export const CITIES: City[] = [
  {
    id: "dmv",
    name: "DC / Arlington (DMV)",
    region: "VA-DC-MD",
    country: "US",
    center: { lat: 38.89, lng: -77.12 },
    defaultZoom: 11,
  },
  {
    id: "nyc",
    name: "New York City",
    region: "NY",
    country: "US",
    center: { lat: 40.7128, lng: -74.006 },
    defaultZoom: 11,
  },
  {
    id: "boston",
    name: "Boston",
    region: "MA",
    country: "US",
    center: { lat: 42.3601, lng: -71.0589 },
    defaultZoom: 12,
  },
  {
    id: "philadelphia",
    name: "Philadelphia",
    region: "PA",
    country: "US",
    center: { lat: 39.9526, lng: -75.1652 },
    defaultZoom: 12,
  },
];

// Shared amenity catalog. placeHasAmenity() in scoring.ts understands these keys.
export const DEFAULT_AMENITIES: AmenityRequirement[] = [
  { key: "gym", label: "Gym", required: false, weight: 10 },
  { key: "pool", label: "Pool", required: false, weight: 6 },
  { key: "basketball", label: "Basketball court", required: false, weight: 12 },
  { key: "indoor_basketball", label: "Indoor basketball", required: false, weight: 8 },
  { key: "coffee", label: "Coffee / cafe", required: false, weight: 4 },
  { key: "beer", label: "Beer on tap / lounge", required: false, weight: 4 },
  { key: "parking", label: "Parking", required: false, weight: 6 },
];

// The original DMV search, expressed as a profile so legacy behavior is
// reproducible and editable rather than hardcoded.
export const DMV_PROFILE: SearchProfile = {
  id: "dmv-2br-bball",
  cityId: "dmv",
  name: "2BR/2BA · Metro · McLean ↔ DC · 🏀",
  query: "2 bedroom 2 bath apartments near metro",
  budgetCap: 3000,
  budgetWeight: 25,
  minBeds: 2,
  minBaths: 2,
  bedBathWeight: 10,
  anchors: [
    {
      id: "mclean-office",
      label: "McLean office (Pam.ai)",
      address: "McLean, VA",
      latitude: 38.9339,
      longitude: -77.1773,
      mode: "TRANSIT",
      targetMinutes: 30,
      weight: 25,
    },
    {
      id: "dc-downtown",
      label: "Downtown DC",
      address: "Washington, DC",
      latitude: 38.9,
      longitude: -77.0365,
      mode: "TRANSIT",
      targetMinutes: 30,
      weight: 15,
    },
  ],
  amenities: [
    { key: "gym", label: "Gym", required: false, weight: 10 },
    { key: "basketball", label: "Basketball court", required: false, weight: 15 },
    { key: "indoor_basketball", label: "Indoor basketball", required: false, weight: 10 },
    { key: "coffee", label: "Coffee / cafe", required: false, weight: 4 },
    { key: "beer", label: "Beer on tap / lounge", required: false, weight: 4 },
  ],
};

// Factory for a fresh, generic profile in any city.
export function makeDefaultProfile(cityId: string): SearchProfile {
  return {
    id: `${cityId}-default`,
    cityId,
    name: "2BR apartments",
    query: "2 bedroom apartments",
    budgetCap: 3500,
    budgetWeight: 25,
    minBeds: 2,
    minBaths: 1,
    bedBathWeight: 10,
    anchors: [],
    amenities: DEFAULT_AMENITIES,
  };
}

export const DEFAULT_PROFILES: SearchProfile[] = [DMV_PROFILE];
