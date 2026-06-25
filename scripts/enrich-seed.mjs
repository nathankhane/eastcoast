// ============================================================================
// One-time seed enrichment.
//
// Reads the researched seed JSON, drops the 5 properties that already exist in
// data/seed.ts, converts the remaining 21 into the app's Place shape, and uses
// Google Maps Platform to bake in:
//   - latitude / longitude            (Geocoding API)
//   - Google rating + review count    (Places API New, Text Search)
//   - Google Maps URL + place id      (Places API New)
//   - walking time/distance to Metro  (Routes API computeRouteMatrix, WALK)
//
// Output: data/seed-extra.ts (committed). Re-runnable; safe to run again.
//
// Usage:  node scripts/enrich-seed.mjs
// ============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_JSON = resolve(__dirname, "../../../placescout_dmv_apartments_seed_2026-06-24.json");
const ENV_FILE = resolve(__dirname, "../.env.local");
const OUT_FILE = resolve(__dirname, "../data/seed-extra.ts");

// Properties already present in data/seed.ts (curated, richer) — skip to avoid
// data redundancy. See cross-reference in the chat plan.
const DUPLICATE_IDS = new Set([
  "maa-tysons-corner", // == existing maa-tysons-corner
  "meridian-courthouse", // == existing meridian-courthouse
  "riverhouse-pentagon-city", // == existing riverhouse-pentagon-city
  "the-garrett", // == existing the-garrett-collective (150 I St SE)
  "cortland-south-eads", // == existing paramount-cortland (1425 S Eads St)
]);

// ---- env -------------------------------------------------------------------
function loadEnv() {
  const txt = readFileSync(ENV_FILE, "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}
loadEnv();

const GEOCODE_KEY = process.env.GOOGLE_GEOCODING_API_KEY;
const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;
const ROUTES_KEY = process.env.GOOGLE_ROUTES_API_KEY;

// ---- Google helpers --------------------------------------------------------
async function geocode(address) {
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GEOCODE_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== "OK" || !data.results?.length) return null;
  const top = data.results[0];
  return { lat: top.geometry.location.lat, lng: top.geometry.location.lng, formatted: top.formatted_address };
}

async function findPlace(textQuery) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": PLACES_KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.websiteUri",
    },
    body: JSON.stringify({ textQuery, maxResultCount: 1 }),
  });
  const data = await res.json();
  if (!res.ok || !data.places?.length) return null;
  const p = data.places[0];
  return {
    id: p.id,
    rating: p.rating ?? null,
    reviewCount: p.userRatingCount ?? null,
    website: p.websiteUri ?? null,
    location: p.location ? { lat: p.location.latitude, lng: p.location.longitude } : null,
  };
}

async function walkToMetro(origin, station) {
  const body = {
    origins: [{ waypoint: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } } }],
    destinations: [{ waypoint: { location: { latLng: { latitude: station.lat, longitude: station.lng } } } }],
    travelMode: "WALK",
  };
  const res = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": ROUTES_KEY,
      "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const el = Array.isArray(data) ? data[0] : null;
  if (!el || !el.duration) return null;
  const seconds = parseInt(String(el.duration).replace("s", ""), 10);
  return {
    minutes: Math.round(seconds / 60),
    miles: el.distanceMeters ? Math.round((el.distanceMeters / 1609.34) * 100) / 100 : null,
  };
}

// ---- conversion helpers ----------------------------------------------------
function parseAddress(address) {
  // "2300 24th Rd S, Arlington, VA 22206" -> { street, zip }
  const parts = address.split(",").map((s) => s.trim());
  const street = parts[0] ?? address;
  const zipMatch = address.match(/\b(\d{5})\b/);
  return { street, zip: zipMatch ? zipMatch[1] : "" };
}

function cleanStationName(raw) {
  if (!raw) return null;
  // "Pentagon City via bus" -> "Pentagon City"; "A / B / C" -> "A"
  let s = raw.split(/ via | or /i)[0];
  s = s.split("/")[0].trim();
  return s || null;
}

function mapCourtType(raw, hasCourt) {
  const s = String(raw || "").toLowerCase();
  if (!hasCourt || s === "none" || s === "") return "none";
  if (s.includes("indoor")) return "indoor";
  if (s.includes("half")) return "half-court";
  if (s.includes("outdoor")) return "outdoor";
  if (s.includes("public") || s.includes("nearby")) return "nearby public court";
  return "unknown"; // e.g. "on-site; type unclear"
}

function buildPros(e) {
  const pros = [];
  if (e.price_low && e.price_low < 3000) pros.push(`Listed 2BR from $${e.price_low.toLocaleString()}`);
  if (e.has_gym) pros.push("Fitness center");
  if (e.has_pool) pros.push("Pool");
  if (e.has_basketball_court) pros.push("Basketball court");
  if (e.has_coffee) pros.push("Coffee on-site");
  if (!pros.length) pros.push("Budget-focused option");
  return pros;
}

function buildCons(e, needsConfirm) {
  const cons = [];
  if (needsConfirm) cons.push("Price / 2BR-2BA needs leasing-office confirmation");
  if (e.has_2br_2ba == null) cons.push("2BA layout unconfirmed");
  if (/bus/i.test(e.nearest_metro_station || "")) cons.push("Metro access is bus/car-assisted");
  return cons;
}

function needsConfirmation(e) {
  if (e.price_low == null) return true;
  if (e.has_2br_2ba !== true) return true;
  if (e.under_3000_status && e.under_3000_status !== "yes") return true;
  return false;
}

// ---- main ------------------------------------------------------------------
async function main() {
  const seed = JSON.parse(readFileSync(SEED_JSON, "utf8"));
  const verifiedDate = seed.metadata?.verified_date ?? new Date().toISOString().slice(0, 10);
  const entries = seed.places.filter((e) => !DUPLICATE_IDS.has(e.id));
  console.log(`Converting ${entries.length} apartments (skipped ${seed.places.length - entries.length} duplicates).`);

  const out = [];
  for (const e of entries) {
    const { street, zip } = parseAddress(e.address);
    const needsConfirm = needsConfirmation(e);

    // 1) Geocode the street address.
    let lat = null;
    let lng = null;
    try {
      const g = await geocode(e.address);
      if (g) {
        lat = g.lat;
        lng = g.lng;
      }
    } catch (err) {
      console.warn(`  geocode failed for ${e.id}: ${err.message}`);
    }

    // 2) Places enrichment (rating, reviews, place id, maps url).
    let rating = null;
    let reviewCount = null;
    let googlePlaceId = undefined;
    let googleMapsUri = undefined;
    try {
      const fp = await findPlace(`${e.name} ${street} ${e.city} ${e.state}`);
      if (fp) {
        rating = fp.rating;
        reviewCount = fp.reviewCount;
        googlePlaceId = fp.id;
        googleMapsUri = `https://www.google.com/maps/place/?q=place_id:${fp.id}`;
        if ((lat == null || lng == null) && fp.location) {
          lat = fp.location.lat;
          lng = fp.location.lng;
        }
      }
    } catch (err) {
      console.warn(`  places failed for ${e.id}: ${err.message}`);
    }

    // 3) Walking time/distance to nearest Metro.
    let walkMin = e.walking_minutes_to_metro ?? null;
    let walkMiles = e.walking_distance_miles_to_metro ?? null;
    const stationName = cleanStationName(e.nearest_metro_station);
    if (walkMin == null && lat != null && stationName) {
      try {
        const st = await geocode(`${stationName} station, ${e.city}, ${e.state}`);
        if (st) {
          const w = await walkToMetro({ lat, lng }, st);
          if (w) {
            walkMin = w.minutes;
            walkMiles = w.miles;
          }
        }
      } catch (err) {
        console.warn(`  walk failed for ${e.id}: ${err.message}`);
      }
    }

    const place = {
      id: e.id,
      name: e.name,
      category: "apartment",
      cityId: "dmv",
      googlePlaceId,
      streetAddress: street,
      city: e.city,
      state: e.state,
      zip,
      neighborhood: e.neighborhood ?? "",
      latitude: lat,
      longitude: lng,
      coordsApproximate: lat == null,
      website: e.property_url ?? "",
      primarySourceUrl: e.property_url ?? "",
      secondarySourceUrls: Array.isArray(e.source_urls) ? e.source_urls : [],
      sourceQuotes: [],
      rating,
      reviewCount,
      googleMapsUri,
      priceLevel: "",
      tags: Array.isArray(e.tags) ? e.tags : [],
      imageUrls: [],
      confidenceScore: 55,
      fitScore: 0,
      fitReasoning: e.fit_notes ?? "",
      roommatePitch: e.fit_notes || e.amenity_notes || "",
      pros: buildPros(e),
      cons: buildCons(e, needsConfirm),
      lastVerified: verifiedDate,
      apartmentDetails: {
        has2br2ba: e.has_2br_2ba === true,
        priceLow: e.price_low ?? null,
        priceHigh: e.price_high ?? null,
        priceNotes: e.price_basis ?? "",
        availabilityStatus: e.availability_status ?? "",
        availableDateManual: "",
        nearestMetro: stationName ?? (e.nearest_metro_station ?? ""),
        metroLine: e.metro_line ?? "",
        walkingMilesToMetro: walkMiles,
        walkingMinutesToMetro: walkMin,
        drivingMinutesToMcLean: null,
        transitMinutesToMcLean: null,
        transitMinutesToDC: null,
        hasGym: e.has_gym === true,
        hasCoffee: e.has_coffee === true,
        hasBeerOrTap: false,
        hasBasketballCourt: e.has_basketball_court === true,
        basketballCourtType: mapCourtType(e.basketball_court_type, e.has_basketball_court === true),
        basketballNotes: e.has_basketball_court ? (e.amenity_notes ?? "") : "",
        parkingNotes: "",
        needsPriceConfirmation: needsConfirm,
      },
      commutes: [],
    };
    out.push(place);
    console.log(
      `  ✓ ${e.id}: ${lat != null ? "geo" : "NOGEO"} · ${rating != null ? `★${rating}(${reviewCount})` : "no-rating"} · ${walkMin != null ? `${walkMin}m walk` : "no-walk"}`
    );
  }

  const header =
    "// AUTO-GENERATED by scripts/enrich-seed.mjs — do not edit by hand.\n" +
    "// 21 researched DMV apartments (Arlington/DC, ~<$3k) enriched with Google\n" +
    "// geocoding, ratings, and Metro walk times. Re-run the script to refresh.\n\n" +
    'import { Place } from "@/lib/types";\n\n' +
    "export const SEED_EXTRA: Place[] = ";
  writeFileSync(OUT_FILE, header + JSON.stringify(out, null, 2) + ";\n");
  console.log(`\nWrote ${out.length} places to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
