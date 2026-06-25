// ============================================================================
// Server-only Outscraper helper — Google Maps reviews beyond the official 5.
//
// The official Places API (New) caps reviews at 5 and only sorts by relevance.
// Outscraper scrapes Google Maps and lets us sort by `newest`, so we can show
// the most recent reviews and derive the latest 1★ (low) and 5★ (high).
//
// Free tier: 500 reviews/month. We pull a small `newest` window per place and
// derive the highlights client-side, so a place costs ~1 review window.
//
// Docs: https://docs.outscraper.com/endpoints/google-maps-reviews/
// ============================================================================

import { PlaceReview } from "@/lib/types";

const OUTSCRAPER_KEY = () => process.env.OUTSCRAPER_API_KEY;
const BASE = "https://api.outscraper.cloud/google-maps-reviews";

export function outscraperEnabled(): boolean {
  return Boolean(OUTSCRAPER_KEY());
}

interface OutscraperRawReview {
  author_title?: string;
  author_link?: string;
  author_image?: string;
  review_text?: string;
  review_rating?: number;
  review_timestamp?: number; // unix seconds
  review_datetime_utc?: string;
  review_link?: string;
}

interface OutscraperPlace {
  rating?: number;
  reviews?: number;
  reviews_per_score?: Record<string, number>;
  reviews_data?: OutscraperRawReview[];
}

export interface OutscraperReviewsResult {
  rating: number | null;
  reviewCount: number | null;
  reviewsPerScore?: Record<string, number>;
  reviews: PlaceReview[];
}

function mapReview(r: OutscraperRawReview): PlaceReview {
  return {
    author: r.author_title ?? "Google user",
    authorPhotoUri: r.author_image || undefined,
    authorUri: r.author_link || undefined,
    rating: r.review_rating ?? 0,
    text: r.review_text ?? "",
    publishTime: r.review_timestamp
      ? new Date(r.review_timestamp * 1000).toISOString()
      : undefined,
    reviewUrl: r.review_link || undefined,
    source: "outscraper",
  };
}

// Fetch the newest `limit` reviews for one place. `query` is best supplied as a
// Google place_id (e.g. "ChIJ...") for an exact match, but a "Name, City, ST"
// string also works. Returns null when no key is configured.
export async function outscraperNewestReviews(
  query: string,
  limit = 20
): Promise<OutscraperReviewsResult | null> {
  const key = OUTSCRAPER_KEY();
  if (!key) return null;

  const url =
    `${BASE}?query=${encodeURIComponent(query)}` +
    `&reviewsLimit=${limit}&sort=newest&language=en&async=false&ignoreEmpty=true`;

  const res = await fetch(url, { headers: { "X-API-KEY": key } });
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = data?.errorMessage || `Outscraper request failed (${res.status})`;
    throw new Error(msg);
  }
  if (data?.status && data.status !== "Success") {
    // Async fallback shouldn't happen with async=false, but guard anyway.
    throw new Error(`Outscraper returned status "${data.status}" (expected Success)`);
  }

  const place: OutscraperPlace | undefined = Array.isArray(data?.data) ? data.data[0] : undefined;
  if (!place) return { rating: null, reviewCount: null, reviews: [] };

  return {
    rating: place.rating ?? null,
    reviewCount: place.reviews ?? null,
    reviewsPerScore: place.reviews_per_score,
    reviews: (place.reviews_data ?? []).map(mapReview),
  };
}
