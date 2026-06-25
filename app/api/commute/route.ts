import { NextRequest, NextResponse } from "next/server";
import { computeRouteMatrix, geocode, GoogleApiError, LatLng, TravelMode } from "@/lib/google";
import { Anchor, CommuteResult } from "@/lib/types";

// ============================================================================
// POST /api/commute
// Body: { places: { id, lat, lng }[], anchors: Anchor[] }
//
// Computes travel time from every place to every anchor via the Routes API,
// grouped by the anchor's travel mode (a matrix request is single-mode).
// Geocodes any anchor missing coordinates. Returns:
//   { commutes: Record<placeId, CommuteResult[]>, anchors: Anchor[] }
// (anchors echoed back with resolved coords so the client can persist them).
// ============================================================================

export const runtime = "nodejs";

interface OriginPlace {
  id: string;
  lat: number;
  lng: number;
}

export async function POST(req: NextRequest) {
  if (!process.env.GOOGLE_ROUTES_API_KEY) {
    return NextResponse.json({ enabled: false, reason: "No Routes API key configured" });
  }

  let body: { places?: OriginPlace[]; anchors?: Anchor[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const places = (body.places ?? []).filter((p) => p.lat != null && p.lng != null);
  const anchors = body.anchors ?? [];
  if (!places.length || !anchors.length) {
    return NextResponse.json({ error: "places and anchors required" }, { status: 400 });
  }

  try {
    // Resolve anchor coordinates (geocode any that are missing).
    const resolved: Anchor[] = [];
    for (const a of anchors) {
      if (a.latitude != null && a.longitude != null) {
        resolved.push(a);
        continue;
      }
      const geo = a.address ? await geocode(a.address) : null;
      resolved.push(
        geo ? { ...a, latitude: geo.location.lat, longitude: geo.location.lng } : a
      );
    }

    const usable = resolved.filter((a) => a.latitude != null && a.longitude != null);
    const commutes: Record<string, CommuteResult[]> = {};
    for (const p of places) commutes[p.id] = [];

    // One matrix request per travel mode.
    const byMode = groupBy(usable, (a) => a.mode);
    const now = new Date().toISOString();

    for (const [mode, modeAnchors] of byMode) {
      const dests = modeAnchors.map((a) => ({ lat: a.latitude!, lng: a.longitude! }) as LatLng);
      const origins = places.map((p) => ({ lat: p.lat, lng: p.lng }) as LatLng);

      // Respect element caps: TRANSIT/traffic = 100, otherwise 600.
      const maxElements = mode === "TRANSIT" ? 100 : 600;
      const originChunk = Math.max(1, Math.floor(maxElements / dests.length));

      for (let i = 0; i < origins.length; i += originChunk) {
        const slice = origins.slice(i, i + originChunk);
        const slicePlaces = places.slice(i, i + originChunk);
        const matrix = await computeRouteMatrix(slice, dests, mode as TravelMode);

        for (const el of matrix) {
          const place = slicePlaces[el.originIndex];
          const anchor = modeAnchors[el.destinationIndex];
          if (!place || !anchor) continue;
          commutes[place.id].push({
            anchorId: anchor.id,
            mode: mode as TravelMode,
            durationSeconds: el.durationSeconds ?? null,
            distanceMeters: el.distanceMeters ?? null,
            durationText: el.durationSeconds != null ? formatDuration(el.durationSeconds) : "—",
            computedAt: now,
          });
        }
      }
    }

    return NextResponse.json({ commutes, anchors: resolved });
  } catch (e) {
    if (e instanceof GoogleApiError) {
      return NextResponse.json({ error: e.message }, { status: e.status ?? 502 });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

function groupBy<T, K>(arr: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const item of arr) {
    const k = key(item);
    const list = m.get(k);
    if (list) list.push(item);
    else m.set(k, [item]);
  }
  return m;
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
