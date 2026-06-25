"use client";

import { useEffect, useRef } from "react";
import { Loader } from "@googlemaps/js-api-loader";
import { Place, SearchProfile } from "@/lib/types";
import { computeFit, fitTier, TIER_COLOR, hasAnyCourt, hasIndoorCourt, lowestPrice } from "@/lib/scoring";

interface Props {
  places: Place[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  center?: { lat: number; lng: number };
  zoom?: number;
  profile?: SearchProfile | null;
}

const DEFAULT_CENTER = { lat: 38.89, lng: -77.12 };

// Build an SVG pin: colored teardrop, optional basketball dot, optional metro ring.
function pinSVG(color: string, court: "none" | "court" | "indoor", strongMetro: boolean): string {
  const ring = strongMetro
    ? `<circle cx="14" cy="14" r="13" fill="none" stroke="#2f5f7f" stroke-width="2.5"/>`
    : "";
  const ball =
    court === "indoor"
      ? `<circle cx="14" cy="13" r="6" fill="#f97316" stroke="#7c2d12" stroke-width="1"/><path d="M8 13h12M14 7v12M9.5 8.5c3 2 3 7 0 9M18.5 8.5c-3 2-3 7 0 9" stroke="#7c2d12" stroke-width="0.8" fill="none"/>`
      : court === "court"
      ? `<circle cx="14" cy="13" r="5" fill="#f97316" stroke="#7c2d12" stroke-width="1"/>`
      : `<circle cx="14" cy="13" r="4.5" fill="#ffffff"/>`;
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="46" viewBox="0 0 28 40">
      <path d="M14 0C6.8 0 1 5.8 1 13c0 9.2 13 27 13 27s13-17.8 13-27C27 5.8 21.2 0 14 0z"
            fill="${color}" stroke="#29251f" stroke-width="1"/>
      ${ring}
      ${ball}
    </svg>`;
}

export default function MapView({ places, selectedId, onSelect, center, zoom, profile }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const profileRef = useRef<SearchProfile | null | undefined>(profile);
  profileRef.current = profile;

  // Init map once.
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!ref.current) return;
    if (!key) return; // PlaceholderMap is rendered by parent when key missing

    const loader = new Loader({ apiKey: key, version: "weekly" });
    let cancelled = false;

    loader.load().then(() => {
      if (cancelled || !ref.current) return;
      mapRef.current = new google.maps.Map(ref.current, {
        center: center ?? DEFAULT_CENTER,
        zoom: zoom ?? 11,
        mapId: undefined,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
      });
      infoRef.current = new google.maps.InfoWindow();
      drawMarkers();
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw markers when places (or active profile) change.
  useEffect(() => {
    if (mapRef.current) drawMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, profile]);

  // Recenter when the active city changes (only meaningful when not auto-fitting).
  useEffect(() => {
    if (mapRef.current && center) {
      mapRef.current.setCenter(center);
      if (zoom) mapRef.current.setZoom(zoom);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.lat, center?.lng]);

  // Pan / open info on selection.
  useEffect(() => {
    if (!mapRef.current || !selectedId) return;
    const place = places.find((p) => p.id === selectedId);
    const marker = markersRef.current.get(selectedId);
    if (place && marker && place.latitude && place.longitude) {
      mapRef.current.panTo({ lat: place.latitude, lng: place.longitude });
      openInfo(place, marker);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function openInfo(place: Place, marker: google.maps.Marker) {
    if (!infoRef.current || !mapRef.current) return;
    const d = place.apartmentDetails;
    const price = lowestPrice(place);
    const courtLabel = d?.hasBasketballCourt ? `${d.basketballCourtType} court` : "no court";
    infoRef.current.setContent(`
      <div style="font-family:ui-sans-serif,system-ui;max-width:260px;padding:12px 14px;">
        <div style="font-weight:700;font-size:14px;margin-bottom:2px;">${escapeHTML(place.name)}</div>
        <div style="color:#8a6a47;font-size:12px;margin-bottom:6px;">${escapeHTML(place.neighborhood)}, ${escapeHTML(place.city)}</div>
        <div style="font-size:12px;line-height:1.5;">
          <div>${price ? "From $" + price.toLocaleString() + "/mo" : "Price: confirm"}</div>
          <div>${d?.nearestMetro ?? ""} (${d?.metroLine ?? ""}) · ${d?.walkingMinutesToMetro ?? "?"} min walk</div>
          <div>🏀 ${courtLabel} · 🏋️ ${d?.hasGym ? "gym" : "no gym"}</div>
          <div style="margin-top:4px;font-weight:600;">Fit ${computeFit(place, profileRef.current ?? undefined).score}/100</div>
        </div>
        <a href="${escapeHTML(place.website)}" target="_blank" rel="noopener"
           style="display:inline-block;margin-top:8px;font-size:12px;color:#2f5f7f;font-weight:600;">Visit website →</a>
      </div>`);
    infoRef.current.open({ map: mapRef.current, anchor: marker });
  }

  function drawMarkers() {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current.clear();

    const bounds = new google.maps.LatLngBounds();
    places.forEach((place) => {
      if (place.latitude == null || place.longitude == null) return;
      const tier = fitTier(computeFit(place, profileRef.current ?? undefined).score);
      const court = hasIndoorCourt(place) ? "indoor" : hasAnyCourt(place) ? "court" : "none";
      const strongMetro = (place.apartmentDetails?.walkingMinutesToMetro ?? 99) <= 10;
      const svg = pinSVG(TIER_COLOR[tier], court, strongMetro);

      const marker = new google.maps.Marker({
        position: { lat: place.latitude, lng: place.longitude },
        map,
        title: place.name,
        icon: {
          url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
          scaledSize: new google.maps.Size(34, 46),
          anchor: new google.maps.Point(17, 46),
        },
      });
      marker.addListener("click", () => {
        onSelect(place.id);
        openInfo(place, marker);
      });
      markersRef.current.set(place.id, marker);
      bounds.extend({ lat: place.latitude, lng: place.longitude });
    });
    if (!bounds.isEmpty() && places.length > 1) map.fitBounds(bounds, 60);
  }

  return <div ref={ref} className="h-full w-full rounded-xl" />;
}

function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}
