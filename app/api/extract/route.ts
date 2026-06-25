import { NextRequest, NextResponse } from "next/server";

// POST /api/extract  { url: string }
// Future home for website-scrape / LLM extraction of apartment details from a
// listing URL. Stubbed for now so the "Auto-fill from link" button has a stable
// contract; the client treats `implemented: false` as "fill in manually".
//
// Planned implementation: fetch the page, then use the Vercel AI SDK to extract
// structured fields (name, rent, beds/baths, amenities, availability) via a
// schema-constrained generateObject call.

export const runtime = "nodejs";

export async function POST(_req: NextRequest) {
  return NextResponse.json({
    implemented: false,
    reason: "Auto-fill from link is not enabled yet. Enter details manually for now.",
  });
}
