import { NextRequest, NextResponse } from "next/server";
import { geocode, searchText, PlacesPlace, GoogleApiError } from "@/lib/google";
import { adminSupabase, supabaseConfigured } from "@/lib/supabase";
import { City, Place } from "@/lib/types";

// ============================================================================
// POST /api/discover
// Body: { city: City, query?: string, radiusMeters?: number, maxPages?: number }
//
// Geocodes the city center if needed, runs a Places API (New) Text Search for
// apartment candidates, maps them into our Place model, and (when Supabase is
// configured) upserts them into the `places` discovery cache via the service
// role. Returns { places: Place[] }.
// ============================================================================

export const runtime = "nodejs";

interface DiscoverBody {
  city: City;
  query?: string;
  radiusMeters?: number;
  maxPages?: number; // 1 page = up to 20 results
}

export async function POST(req: NextRequest) {
  let body: DiscoverBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { city } = body;
  if (!city || !city.id || !city.name) {
    return NextResponse.json({ error: "city (with id and name) is required" }, { status: 400 });
  }

  const query = body.query?.trim() || "apartments for rent";
  const radiusMeters = clampNum(body.radiusMeters ?? 15000, 500, 50000);
  const maxPages = clampNum(body.maxPages ?? 2, 1, 3);

  try {
    // Resolve a center to bias the search.
    let center = city.center;
    if (!center || center.lat == null) {
      const geo = await geocode(`${city.name}, ${city.region} ${city.country}`);
      if (!geo) return NextResponse.json({ error: `Could not geocode ${city.name}` }, { status: 404 });
      center = geo.location;
    }

    // Paginate Text Search.
    const collected: PlacesPlace[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const res = await searchText({
        textQuery: `${query} in ${city.name}`,
        center,
        radiusMeters,
        maxResultCount: 20,
        pageToken,
      });
      collected.push(...res.places);
      if (!res.nextPageToken) break;
      pageToken = res.nextPageToken;
    }

    // Dedup by google place id, then map into our model.
    const seen = new Set<string>();
    const places: Place[] = [];
    for (const pp of collected) {
      if (!pp.id || seen.has(pp.id)) continue;
      seen.add(pp.id);
      places.push(toPlace(pp, city));
    }

    // Cache server-side (bypasses RLS via service role) when configured.
    if (supabaseConfigured() && places.length) {
      try {
        const db = adminSupabase();
        // Ensure the parent city row exists first (places.city_id -> cities.id FK).
        await db
          .from("cities")
          .upsert({ id: city.id, data: city, updated_at: new Date().toISOString() });

        const rows = places.map((p) => ({
          id: p.id,
          city_id: p.cityId ?? null,
          google_place_id: p.googlePlaceId ?? null,
          data: p,
          updated_at: new Date().toISOString(),
        }));
        await db.from("places").upsert(rows);
      } catch {
        // Caching is best-effort; still return results to the client.
      }
    }

    return NextResponse.json({ places, center });
  } catch (e) {
    if (e instanceof GoogleApiError) {
      return NextResponse.json({ error: e.message }, { status: e.status ?? 502 });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// Map a Places API (New) result into a Place. Rent/amenities aren't available
// from Places, so those stay unknown for the user to curate.
function toPlace(pp: PlacesPlace, city: City): Place {
  const name = pp.displayName?.text ?? "Unknown";
  const { street, locality, region, postal } = splitAddress(pp.formattedAddress ?? "");

  return {
    id: `g-${pp.id}`,
    name,
    category: "apartment",
    cityId: city.id,
    googlePlaceId: pp.id,

    streetAddress: street,
    city: locality || city.name,
    state: region || city.region,
    zip: postal,
    neighborhood: locality,
    latitude: pp.location?.latitude ?? null,
    longitude: pp.location?.longitude ?? null,
    coordsApproximate: false,

    website: pp.websiteUri ?? "",
    primarySourceUrl: pp.websiteUri ?? "",
    secondarySourceUrls: [],
    sourceQuotes: [],

    rating: pp.rating ?? null,
    priceLevel: mapPriceLevel(pp.priceLevel),
    tags: (pp.types ?? []).filter((t) => t !== "point_of_interest" && t !== "establishment"),
    imageUrls: [],

    confidenceScore: 40, // discovered, unverified
    fitScore: 0, // computed live from the active profile
    fitReasoning: "Auto-discovered via Google Places. Verify details with leasing office.",
    roommatePitch: "",
    pros: [],
    cons: [],

    lastVerified: new Date().toISOString().slice(0, 10),

    apartmentDetails: {
      has2br2ba: false,
      priceLow: null,
      priceHigh: null,
      priceNotes: "",
      availabilityStatus: "",
      availableDateManual: "",
      nearestMetro: "",
      metroLine: "",
      walkingMilesToMetro: null,
      walkingMinutesToMetro: null,
      drivingMinutesToMcLean: null,
      transitMinutesToMcLean: null,
      transitMinutesToDC: null,
      hasGym: false,
      hasCoffee: false,
      hasBeerOrTap: false,
      hasBasketballCourt: false,
      basketballCourtType: "unknown",
      basketballNotes: "",
      parkingNotes: "",
    },
    commutes: [],
  };
}

function mapPriceLevel(level?: string): string {
  switch (level) {
    case "PRICE_LEVEL_INEXPENSIVE":
      return "$";
    case "PRICE_LEVEL_MODERATE":
      return "$$";
    case "PRICE_LEVEL_EXPENSIVE":
      return "$$$";
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return "$$$$";
    default:
      return "";
  }
}

// Best-effort parse of a US formatted address: "123 Main St, City, ST 12345, USA"
function splitAddress(formatted: string): {
  street: string;
  locality: string;
  region: string;
  postal: string;
} {
  const parts = formatted.split(",").map((s) => s.trim());
  const street = parts[0] ?? "";
  const locality = parts.length >= 3 ? parts[1] : "";
  let region = "";
  let postal = "";
  const stateZip = parts.length >= 3 ? parts[2] : "";
  const m = stateZip.match(/([A-Z]{2})\s*(\d{5})?/);
  if (m) {
    region = m[1] ?? "";
    postal = m[2] ?? "";
  }
  return { street, locality, region, postal };
}

function clampNum(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
