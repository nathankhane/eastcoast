import { NextRequest, NextResponse } from "next/server";
import { computeRouteMatrix, geocode, GoogleApiError, LatLng, TravelMode } from "@/lib/google";

// Single origin -> single destination travel time, via the Routes API
// (computeRouteMatrix). Replaces the deprecated Distance Matrix API.
//
// POST body: { origin: {lat,lng}, destination: "address" | {lat,lng}, mode? }
// Returns: { enabled, distanceMeters, durationSeconds, durationText }

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!process.env.GOOGLE_ROUTES_API_KEY) {
    return NextResponse.json({ enabled: false, reason: "No Routes API key configured" });
  }

  let body: { origin?: LatLng; destination?: unknown; mode?: TravelMode };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ enabled: true, error: "Invalid JSON body" }, { status: 400 });
  }

  const { origin, destination } = body;
  const mode: TravelMode = body.mode ?? "WALK";
  if (!origin || destination == null) {
    return NextResponse.json({ enabled: true, error: "origin and destination required" }, { status: 400 });
  }

  try {
    let dest: LatLng;
    if (typeof destination === "string") {
      const geo = await geocode(destination);
      if (!geo) return NextResponse.json({ enabled: true, error: "Destination not found" }, { status: 404 });
      dest = geo.location;
    } else {
      dest = destination as LatLng;
    }

    const matrix = await computeRouteMatrix([origin], [dest], mode);
    const el = matrix[0];
    if (!el || el.durationSeconds == null) {
      return NextResponse.json({ enabled: true, error: el?.condition ?? "No route" }, { status: 502 });
    }
    return NextResponse.json({
      enabled: true,
      distanceMeters: el.distanceMeters ?? null,
      durationSeconds: el.durationSeconds,
      durationText: formatDuration(el.durationSeconds),
    });
  } catch (e) {
    if (e instanceof GoogleApiError) {
      return NextResponse.json({ enabled: true, error: e.message }, { status: e.status ?? 502 });
    }
    return NextResponse.json({ enabled: true, error: String(e) }, { status: 500 });
  }
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
