import { Place } from "@/lib/types";

// ---- JSON ----

export function downloadJSON(places: Place[], filename = "placescout-data.json") {
  const blob = new Blob([JSON.stringify(places, null, 2)], { type: "application/json" });
  triggerDownload(blob, filename);
}

export function parseJSON(text: string): Place[] {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error("JSON must be an array of Place objects");
  return data as Place[];
}

// ---- CSV ----

const CSV_COLUMNS: { key: string; header: string; get: (p: Place) => string | number | boolean | null }[] = [
  { key: "id", header: "id", get: (p) => p.id },
  { key: "name", header: "name", get: (p) => p.name },
  { key: "category", header: "category", get: (p) => p.category },
  { key: "neighborhood", header: "neighborhood", get: (p) => p.neighborhood },
  { key: "city", header: "city", get: (p) => p.city },
  { key: "state", header: "state", get: (p) => p.state },
  { key: "streetAddress", header: "street_address", get: (p) => p.streetAddress },
  { key: "zip", header: "zip", get: (p) => p.zip },
  { key: "latitude", header: "latitude", get: (p) => p.latitude },
  { key: "longitude", header: "longitude", get: (p) => p.longitude },
  { key: "website", header: "website", get: (p) => p.website },
  { key: "rating", header: "google_rating", get: (p) => p.rating ?? "" },
  { key: "reviewCount", header: "google_review_count", get: (p) => p.reviewCount ?? "" },
  { key: "googleMapsUri", header: "google_maps_url", get: (p) => p.googleMapsUri ?? "" },
  { key: "googlePlaceId", header: "google_place_id", get: (p) => p.googlePlaceId ?? "" },
  { key: "nearestMetro", header: "nearest_metro", get: (p) => p.apartmentDetails?.nearestMetro ?? "" },
  { key: "metroLine", header: "metro_line", get: (p) => p.apartmentDetails?.metroLine ?? "" },
  { key: "walkMin", header: "walk_min_to_metro", get: (p) => p.apartmentDetails?.walkingMinutesToMetro ?? "" },
  { key: "priceLow", header: "price_low", get: (p) => p.apartmentDetails?.priceLow ?? "" },
  { key: "priceHigh", header: "price_high", get: (p) => p.apartmentDetails?.priceHigh ?? "" },
  { key: "has2br2ba", header: "has_2br_2ba", get: (p) => p.apartmentDetails?.has2br2ba ?? "" },
  { key: "hasGym", header: "has_gym", get: (p) => p.apartmentDetails?.hasGym ?? "" },
  { key: "hasCoffee", header: "has_coffee", get: (p) => p.apartmentDetails?.hasCoffee ?? "" },
  { key: "hasBeerOrTap", header: "has_beer_or_tap", get: (p) => p.apartmentDetails?.hasBeerOrTap ?? "" },
  { key: "hasBball", header: "has_basketball", get: (p) => p.apartmentDetails?.hasBasketballCourt ?? "" },
  { key: "bballType", header: "basketball_court_type", get: (p) => p.apartmentDetails?.basketballCourtType ?? "" },
  { key: "availability", header: "availability_status", get: (p) => p.apartmentDetails?.availabilityStatus ?? "" },
  { key: "needsPriceConfirm", header: "needs_price_confirmation", get: (p) => p.apartmentDetails?.needsPriceConfirmation ?? "" },
  { key: "fitScore", header: "fit_score", get: (p) => p.fitScore },
  { key: "confidence", header: "confidence_score", get: (p) => p.confidenceScore },
  { key: "lastVerified", header: "last_verified", get: (p) => p.lastVerified },
];

function csvEscape(val: string | number | boolean | null): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCSV(places: Place[], filename = "placescout-data.csv") {
  const header = CSV_COLUMNS.map((c) => c.header).join(",");
  const rows = places.map((p) => CSV_COLUMNS.map((c) => csvEscape(c.get(p))).join(","));
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  triggerDownload(blob, filename);
}

// Minimal CSV parser (handles quoted fields). Returns partial Place objects;
// merges onto an existing place by id when possible.
export function parseCSV(text: string, existing: Place[]): Place[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return existing;
  const headers = splitCSVLine(lines[0]);
  const byId = new Map(existing.map((p) => [p.id, structuredClone(p)] as const));

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => (row[h] = cells[idx] ?? ""));
    const id = row["id"];
    if (!id) continue;
    const place = byId.get(id);
    if (!place) continue; // CSV import updates known places; full new records use JSON

    if (place.apartmentDetails) {
      if (row["price_low"]) place.apartmentDetails.priceLow = Number(row["price_low"]) || null;
      if (row["price_high"]) place.apartmentDetails.priceHigh = Number(row["price_high"]) || null;
      if (row["availability_status"]) place.apartmentDetails.availabilityStatus = row["availability_status"];
      if (row["walk_min_to_metro"]) place.apartmentDetails.walkingMinutesToMetro = Number(row["walk_min_to_metro"]) || null;
    }
    if (row["fit_score"]) place.fitScore = Number(row["fit_score"]) || place.fitScore;
    if (row["last_verified"]) place.lastVerified = row["last_verified"];
  }
  return Array.from(byId.values());
}

function splitCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
