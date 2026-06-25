// ============================================================================
// Server-only Google Maps Platform helpers.
//
// Uses the CURRENT (non-legacy) APIs:
//   - Geocoding API           (city / address -> lat,lng)
//   - Places API (New)        (searchText + place details)
//   - Routes API              (computeRouteMatrix — replaces Distance Matrix)
//
// Field masks are applied to Places/Routes calls to keep request SKUs cheap.
// Each function reads its own API key so you can use one key per API or share.
// ============================================================================

const GEOCODE_KEY = () => process.env.GOOGLE_GEOCODING_API_KEY;
const PLACES_KEY = () => process.env.GOOGLE_PLACES_API_KEY;
const ROUTES_KEY = () => process.env.GOOGLE_ROUTES_API_KEY;

export interface LatLng {
  lat: number;
  lng: number;
}

export class GoogleApiError extends Error {
  constructor(public api: string, message: string, public status?: number) {
    super(`[${api}] ${message}`);
    this.name = "GoogleApiError";
  }
}

// ---------------------------------------------------------------------------
// Geocoding
// ---------------------------------------------------------------------------

export interface GeocodeResult {
  location: LatLng;
  formattedAddress: string;
}

export async function geocode(address: string): Promise<GeocodeResult | null> {
  const key = GEOCODE_KEY();
  if (!key) throw new GoogleApiError("geocoding", "GOOGLE_GEOCODING_API_KEY not set");

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(address)}&key=${key}`;

  const res = await fetch(url);
  const data = await res.json();
  if (data.status === "ZERO_RESULTS") return null;
  if (data.status !== "OK") {
    throw new GoogleApiError("geocoding", data.error_message || data.status, res.status);
  }
  const top = data.results[0];
  return {
    location: { lat: top.geometry.location.lat, lng: top.geometry.location.lng },
    formattedAddress: top.formatted_address,
  };
}

// ---------------------------------------------------------------------------
// Places API (New) — Text Search
// ---------------------------------------------------------------------------

// Trimmed shape of a Places API (New) place resource (only masked fields).
export interface PlacesPlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  types?: string[];
  primaryType?: string;
  editorialSummary?: { text: string };
  photos?: { name: string; widthPx: number; heightPx: number }[];
}

const SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.websiteUri",
  "places.types",
  "places.primaryType",
  "nextPageToken",
].join(",");

export interface SearchTextOptions {
  textQuery: string;
  center?: LatLng;
  radiusMeters?: number; // location bias circle
  includedType?: string; // e.g. "apartment_complex"
  maxResultCount?: number; // 1-20 per page
  pageToken?: string;
}

export interface SearchTextResult {
  places: PlacesPlace[];
  nextPageToken?: string;
}

export async function searchText(opts: SearchTextOptions): Promise<SearchTextResult> {
  const key = PLACES_KEY();
  if (!key) throw new GoogleApiError("places", "GOOGLE_PLACES_API_KEY not set");

  const body: Record<string, unknown> = {
    textQuery: opts.textQuery,
    maxResultCount: Math.min(opts.maxResultCount ?? 20, 20),
  };
  if (opts.includedType) body.includedType = opts.includedType;
  if (opts.pageToken) body.pageToken = opts.pageToken;
  if (opts.center && opts.radiusMeters) {
    body.locationBias = {
      circle: {
        center: { latitude: opts.center.lat, longitude: opts.center.lng },
        radius: opts.radiusMeters,
      },
    };
  }

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": SEARCH_FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new GoogleApiError("places", data?.error?.message || "searchText failed", res.status);
  }
  return { places: data.places ?? [], nextPageToken: data.nextPageToken };
}

// ---------------------------------------------------------------------------
// Places API (New) — Place Details
// ---------------------------------------------------------------------------

const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "addressComponents",
  "location",
  "rating",
  "userRatingCount",
  "priceLevel",
  "websiteUri",
  "nationalPhoneNumber",
  "types",
  "primaryType",
  "editorialSummary",
  "photos",
].join(",");

export async function placeDetails(placeId: string): Promise<PlacesPlace & {
  addressComponents?: { longText: string; shortText: string; types: string[] }[];
}> {
  const key = PLACES_KEY();
  if (!key) throw new GoogleApiError("places", "GOOGLE_PLACES_API_KEY not set");

  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": DETAILS_FIELD_MASK,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new GoogleApiError("places", data?.error?.message || "placeDetails failed", res.status);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Places API (New) — Reviews (official, relevance-sorted, max 5)
// ---------------------------------------------------------------------------

import { PlaceReview } from "@/lib/types";

interface GoogleReview {
  rating?: number;
  text?: { text?: string };
  originalText?: { text?: string };
  relativePublishingTimeDescription?: string;
  publishTime?: string;
  googleMapsUri?: string;
  authorAttribution?: { displayName?: string; uri?: string; photoUri?: string };
}

function mapGoogleReviews(reviews?: GoogleReview[]): PlaceReview[] {
  if (!Array.isArray(reviews)) return [];
  return reviews.map((r) => ({
    author: r.authorAttribution?.displayName ?? "Google user",
    authorPhotoUri: r.authorAttribution?.photoUri,
    authorUri: r.authorAttribution?.uri,
    rating: r.rating ?? 0,
    text: r.text?.text ?? r.originalText?.text ?? "",
    relativeTime: r.relativePublishingTimeDescription,
    publishTime: r.publishTime,
    reviewUrl: r.googleMapsUri,
    source: "google" as const,
  }));
}

// Up to 5 relevance-sorted reviews from the official Places API (New).
// `reviews` is a higher-cost SKU, so this is a dedicated call rather than part
// of the default place-details mask.
export async function placeReviews(
  placeId: string
): Promise<{ rating: number | null; reviewCount: number | null; reviews: PlaceReview[] }> {
  const key = PLACES_KEY();
  if (!key) throw new GoogleApiError("places", "GOOGLE_PLACES_API_KEY not set");

  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "id,rating,userRatingCount,reviews",
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new GoogleApiError("places", data?.error?.message || "placeReviews failed", res.status);
  }
  return {
    rating: data.rating ?? null,
    reviewCount: data.userRatingCount ?? null,
    reviews: mapGoogleReviews(data.reviews),
  };
}

// ---------------------------------------------------------------------------
// Routes API — computeRouteMatrix (replaces legacy Distance Matrix)
// ---------------------------------------------------------------------------

export type TravelMode = "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT";

export interface RouteMatrixElement {
  originIndex: number;
  destinationIndex: number;
  distanceMeters?: number;
  durationSeconds?: number; // parsed from "123s"
  condition?: string;
}

export async function computeRouteMatrix(
  origins: LatLng[],
  destinations: LatLng[],
  travelMode: TravelMode = "DRIVE"
): Promise<RouteMatrixElement[]> {
  const key = ROUTES_KEY();
  if (!key) throw new GoogleApiError("routes", "GOOGLE_ROUTES_API_KEY not set");

  const toWaypoint = (p: LatLng) => ({
    waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } },
  });

  const body: Record<string, unknown> = {
    origins: origins.map(toWaypoint),
    destinations: destinations.map(toWaypoint),
    travelMode,
  };
  // routingPreference is invalid for WALK/BICYCLE/TRANSIT; only set for DRIVE.
  if (travelMode === "DRIVE") body.routingPreference = "TRAFFIC_AWARE";

  const res = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new GoogleApiError("routes", err?.error?.message || "computeRouteMatrix failed", res.status);
  }

  const data = (await res.json()) as {
    originIndex: number;
    destinationIndex: number;
    distanceMeters?: number;
    duration?: string;
    condition?: string;
  }[];

  return data.map((el) => ({
    originIndex: el.originIndex,
    destinationIndex: el.destinationIndex,
    distanceMeters: el.distanceMeters,
    durationSeconds: el.duration ? parseInt(el.duration.replace("s", ""), 10) : undefined,
    condition: el.condition,
  }));
}
