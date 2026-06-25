// ============================================================================
// One-time enrichment for the 13 CURATED apartments in data/seed.ts.
//
// The curated set was hand-written without Google data. This script looks each
// one up in the Places API (New) and bakes in:
//   - googlePlaceId, Google rating + review count, Google Maps URL
//   - up to 5 relevance-sorted reviews (free; same SKU as enrich-seed.mjs)
//
// It does NOT touch the hand-curated fields — output is a per-id PARTIAL that
// data/seed.ts merges over each curated place at load time.
//
// Output: data/curated-enrichment.ts (committed). Re-runnable.
// Usage:  node scripts/enrich-curated.mjs
// ============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_TS = resolve(__dirname, "../data/seed.ts");
const ENV_FILE = resolve(__dirname, "../.env.local");
const OUT_FILE = resolve(__dirname, "../data/curated-enrichment.ts");

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

const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;

// ---- extract curated places from seed.ts -----------------------------------
function extractCurated() {
  const src = readFileSync(SEED_TS, "utf8");
  const start = src.indexOf("const CURATED_SEED_PLACES");
  const arrStart = src.indexOf("[", start);
  // The curated array is closed by the first "\n];" after it.
  const arrEnd = src.indexOf("\n];", arrStart);
  const block = src.slice(arrStart, arrEnd);

  // Split into per-place chunks at each `id: "..."`.
  const idRe = /\bid:\s*"([^"]+)"/g;
  const matches = [...block.matchAll(idRe)];
  const out = [];
  for (let i = 0; i < matches.length; i++) {
    const from = matches[i].index;
    const to = i + 1 < matches.length ? matches[i + 1].index : block.length;
    const chunk = block.slice(from, to);
    const grab = (key) => chunk.match(new RegExp(`\\b${key}:\\s*"([^"]*)"`))?.[1] ?? "";
    out.push({
      id: matches[i][1],
      name: grab("name"),
      streetAddress: grab("streetAddress"),
      city: grab("city"),
      state: grab("state"),
    });
  }
  return out;
}

// ---- Google Places helper --------------------------------------------------
function mapGoogleReviews(reviews) {
  if (!Array.isArray(reviews)) return [];
  return reviews.map((r) => ({
    author: r.authorAttribution?.displayName ?? "Google user",
    authorPhotoUri: r.authorAttribution?.photoUri ?? undefined,
    authorUri: r.authorAttribution?.uri ?? undefined,
    rating: r.rating ?? 0,
    text: r.text?.text ?? r.originalText?.text ?? "",
    relativeTime: r.relativePublishingTimeDescription ?? undefined,
    publishTime: r.publishTime ?? undefined,
    reviewUrl: r.googleMapsUri ?? undefined,
    source: "google",
  }));
}

async function findPlace(textQuery) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": PLACES_KEY,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.rating,places.userRatingCount,places.reviews,places.googleMapsUri",
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
    googleMapsUri: p.googleMapsUri ?? null,
    reviews: mapGoogleReviews(p.reviews),
  };
}

// ---- main ------------------------------------------------------------------
async function main() {
  if (!PLACES_KEY) throw new Error("GOOGLE_PLACES_API_KEY not set in .env.local");
  const curated = extractCurated();
  console.log(`Enriching ${curated.length} curated apartments…`);

  const enrichment = {};
  for (const c of curated) {
    const query = `${c.name} ${c.streetAddress} ${c.city} ${c.state}`.trim();
    try {
      const fp = await findPlace(query);
      if (!fp) {
        console.log(`  – ${c.id}: no Places match`);
        continue;
      }
      enrichment[c.id] = {
        googlePlaceId: fp.id,
        rating: fp.rating,
        reviewCount: fp.reviewCount,
        googleMapsUri: fp.googleMapsUri ?? `https://www.google.com/maps/place/?q=place_id:${fp.id}`,
        reviews: fp.reviews,
        reviewsUpdatedAt: fp.reviews.length ? new Date().toISOString() : undefined,
      };
      console.log(
        `  ✓ ${c.id}: ${fp.rating != null ? `★${fp.rating}(${fp.reviewCount})` : "no-rating"} · ${fp.reviews.length} reviews`
      );
    } catch (err) {
      console.warn(`  ! ${c.id}: ${err.message}`);
    }
  }

  const header =
    "// AUTO-GENERATED by scripts/enrich-curated.mjs — do not edit by hand.\n" +
    "// Google enrichment (place id, rating, review count, Maps URL, up to 5\n" +
    "// reviews) for the curated apartments, merged over them in data/seed.ts.\n\n" +
    'import { Place } from "@/lib/types";\n\n' +
    "export const CURATED_ENRICHMENT: Record<string, Partial<Place>> = ";
  writeFileSync(OUT_FILE, header + JSON.stringify(enrichment, null, 2) + ";\n");
  console.log(`\nWrote enrichment for ${Object.keys(enrichment).length} places to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
