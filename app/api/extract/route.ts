import { NextRequest, NextResponse } from "next/server";
import { extractApartmentFacts, extractionProvider, fetchPageText, ExtractedFacts } from "@/lib/extract";
import { placeDetails } from "@/lib/google";
import { ApartmentDetails } from "@/lib/types";

// ============================================================================
// POST /api/extract
// Body: { url?, name?, address?, googlePlaceId? }
//
// Reads the listing/property website and uses an LLM to extract rent, 2BR/2BA,
// and amenities (gym, pool, basketball, coffee) — the fields Google's APIs
// cannot provide. Returns a Partial<ApartmentDetails> patch plus metadata.
//
// If no website is given but a googlePlaceId is, we look up the official site
// via Place Details first. If no LLM key is configured, returns implemented:false.
// ============================================================================

export const runtime = "nodejs";
export const maxDuration = 60;

interface ExtractBody {
  url?: string;
  name?: string;
  address?: string;
  googlePlaceId?: string;
}

export async function POST(req: NextRequest) {
  const provider = extractionProvider();
  if (!provider) {
    return NextResponse.json({
      implemented: false,
      reason: "Auto-fill needs an LLM key. Add OPENAI_API_KEY (or ANTHROPIC_API_KEY) to enable it.",
    });
  }

  let body: ExtractBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Resolve a website to read.
  let url = body.url?.trim();
  if (!url && body.googlePlaceId && process.env.GOOGLE_PLACES_API_KEY) {
    try {
      const d = await placeDetails(body.googlePlaceId);
      if (d.websiteUri) url = d.websiteUri;
    } catch {
      /* best effort */
    }
  }
  if (!url) {
    return NextResponse.json({
      implemented: true,
      ok: false,
      reason: "No website URL available for this place — add a listing link to auto-fill.",
    });
  }

  const text = await fetchPageText(url);

  let facts: ExtractedFacts;
  try {
    facts = await extractApartmentFacts({ name: body.name, address: body.address, url, text });
  } catch (e) {
    return NextResponse.json(
      { implemented: true, ok: false, reason: `Extraction failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }

  const thinPage = text.length < 400;
  const patch = factsToApartmentPatch(facts);

  return NextResponse.json({
    implemented: true,
    ok: true,
    provider,
    url,
    confidence: facts.confidence,
    summary: facts.summary,
    thinPage, // true when the page had little readable text (likely JS-rendered)
    fields: patch,
  });
}

// Map the LLM output to a Partial<ApartmentDetails>, leaving unknown fields out
// so the caller can merge without clobbering existing data.
function factsToApartmentPatch(f: ExtractedFacts): Partial<ApartmentDetails> {
  const patch: Partial<ApartmentDetails> = {};
  if (f.priceLow != null) patch.priceLow = f.priceLow;
  if (f.priceHigh != null) patch.priceHigh = f.priceHigh;
  if (f.has2br2ba != null) patch.has2br2ba = f.has2br2ba;
  if (f.hasGym != null) patch.hasGym = f.hasGym;
  if (f.hasBasketballCourt != null) {
    patch.hasBasketballCourt = f.hasBasketballCourt;
    patch.basketballCourtType =
      f.basketballCourtType && f.basketballCourtType !== null ? f.basketballCourtType : f.hasBasketballCourt ? "unknown" : "none";
  }
  if (f.hasCoffee != null) patch.hasCoffee = f.hasCoffee;
  if (f.hasBeerOrTap != null) patch.hasBeerOrTap = f.hasBeerOrTap;
  if (f.parkingNotes) patch.parkingNotes = f.parkingNotes;
  if (f.availabilityStatus) patch.availabilityStatus = f.availabilityStatus;
  if (f.priceNotes) patch.priceNotes = f.priceNotes;
  // Flag for re-confirmation when price/2BA are missing or the model was unsure.
  patch.needsPriceConfirmation = f.priceLow == null || f.has2br2ba !== true || (f.confidence ?? 0) < 0.5;
  return patch;
}
