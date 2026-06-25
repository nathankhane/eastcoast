import { NextRequest, NextResponse } from "next/server";
import { geocode, GoogleApiError } from "@/lib/google";

// POST /api/geocode  { address: string }
// Returns { location: {lat,lng}, formattedAddress } or { error }.
// Used by the "Add city" flow so any city can be added by name.

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { address?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const address = body.address?.trim();
  if (!address) return NextResponse.json({ error: "address required" }, { status: 400 });

  try {
    const result = await geocode(address);
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof GoogleApiError) {
      return NextResponse.json({ error: e.message }, { status: e.status ?? 502 });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
