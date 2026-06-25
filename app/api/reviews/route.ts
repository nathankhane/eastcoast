import { NextRequest, NextResponse } from "next/server";
import { placeReviews, GoogleApiError } from "@/lib/google";
import { outscraperEnabled, outscraperNewestReviews } from "@/lib/outscraper";
import { PlaceReview } from "@/lib/types";

// ============================================================================
// POST /api/reviews
// Body: { googlePlaceId?, name, city?, state? }
//
// Returns a pooled, deduped set of reviews for one place:
//   - up to 5 relevance-sorted reviews from the official Places API (New)
//   - the newest reviews from Outscraper (if OUTSCRAPER_API_KEY is set), which
//     lets the UI surface the most recent 1★ (low) and 5★ (high) reviews.
//
// Response:
//   { reviews, reviewsPerScore?, rating?, reviewCount?, outscraperEnabled,
//     updatedAt, notes[] }
// ============================================================================

export const runtime = "nodejs";

interface ReviewRequest {
  googlePlaceId?: string;
  name?: string;
  city?: string;
  state?: string;
}

// Dedup key: same author + same opening text => same review across sources.
function dedupKey(r: PlaceReview): string {
  return `${r.author.toLowerCase()}|${r.text.slice(0, 60).toLowerCase()}`;
}

export async function POST(req: NextRequest) {
  let body: ReviewRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { googlePlaceId, name, city, state } = body;
  if (!googlePlaceId && !name) {
    return NextResponse.json({ error: "googlePlaceId or name required" }, { status: 400 });
  }

  const notes: string[] = [];
  const pooled: PlaceReview[] = [];
  let rating: number | null = null;
  let reviewCount: number | null = null;
  let reviewsPerScore: Record<string, number> | undefined;
  const osEnabled = outscraperEnabled();

  // 1) Outscraper (newest first) — gives recency + full star distribution.
  if (osEnabled) {
    const query = googlePlaceId || [name, city, state].filter(Boolean).join(", ");
    try {
      const os = await outscraperNewestReviews(query, 20);
      if (os) {
        pooled.push(...os.reviews);
        reviewsPerScore = os.reviewsPerScore;
        if (os.rating != null) rating = os.rating;
        if (os.reviewCount != null) reviewCount = os.reviewCount;
      }
    } catch (e) {
      notes.push(`Outscraper: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    notes.push("Add OUTSCRAPER_API_KEY to fetch most-recent and 1★/5★ reviews.");
  }

  // 2) Official Google reviews (relevance-sorted, max 5) — adds the rating and
  //    fills in if Outscraper is unavailable.
  if (googlePlaceId && process.env.GOOGLE_PLACES_API_KEY) {
    try {
      const g = await placeReviews(googlePlaceId);
      if (g.rating != null) rating = rating ?? g.rating;
      if (g.reviewCount != null) reviewCount = reviewCount ?? g.reviewCount;
      pooled.push(...g.reviews);
    } catch (e) {
      if (e instanceof GoogleApiError) notes.push(`Google: ${e.message}`);
      else notes.push(`Google: ${String(e)}`);
    }
  }

  // Dedup (prefer entries that carry a publishTime so sorting by newest works).
  const byKey = new Map<string, PlaceReview>();
  for (const r of pooled) {
    if (!r.text && r.rating === 0) continue;
    const key = dedupKey(r);
    const existing = byKey.get(key);
    if (!existing || (!existing.publishTime && r.publishTime)) byKey.set(key, r);
  }
  const reviews = [...byKey.values()].sort((a, b) => {
    const ta = a.publishTime ? Date.parse(a.publishTime) : 0;
    const tb = b.publishTime ? Date.parse(b.publishTime) : 0;
    return tb - ta;
  });

  return NextResponse.json({
    reviews,
    reviewsPerScore,
    rating,
    reviewCount,
    outscraperEnabled: osEnabled,
    updatedAt: new Date().toISOString(),
    notes,
  });
}
