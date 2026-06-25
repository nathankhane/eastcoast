"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { City, CommuteResult, Place, SearchProfile, UserMeta, UserMetaStore } from "@/lib/types";
import { SEED_PLACES } from "@/data/seed";
import { CITIES, makeDefaultProfile } from "@/data/profiles";
import { Filters, DEFAULT_FILTERS, applyFilters } from "@/lib/filters";
import { getMetaForPlace } from "@/lib/storage";
import {
  isCloud,
  getCities,
  upsertCity,
  getProfiles,
  upsertProfile,
  getPlaces,
  upsertPlaces,
  getUserMeta,
  saveUserMetaEntry,
} from "@/lib/db";
import FilterBar from "@/components/FilterBar";
import TableView from "@/components/TableView";
import DetailPanel from "@/components/DetailPanel";
import Toolbar from "@/components/Toolbar";
import PresentationView from "@/components/PresentationView";
import MapPlaceholder from "@/components/MapPlaceholder";
import CityBar from "@/components/CityBar";
import ProfileEditor from "@/components/ProfileEditor";
import AddApartmentModal from "@/components/AddApartmentModal";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function Home() {
  const [cities, setCities] = useState<City[]>([]);
  const [activeCityId, setActiveCityId] = useState<string>("dmv");
  const [profiles, setProfiles] = useState<SearchProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  const [places, setPlaces] = useState<Place[]>([]);
  const [meta, setMeta] = useState<UserMetaStore>({});
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"explore" | "present">("explore");
  const [hydrated, setHydrated] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showAddApartment, setShowAddApartment] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [computing, setComputing] = useState(false);

  const hasMapKey = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const cloud = isCloud();

  const activeCity = cities.find((c) => c.id === activeCityId) ?? null;
  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? profiles[0] ?? null;

  // Load cities + meta once.
  useEffect(() => {
    (async () => {
      const [cs, mt] = await Promise.all([getCities(), getUserMeta()]);
      setCities(cs);
      setMeta(mt);
      // Keep the active city valid (avoids select/state divergence).
      if (!cs.some((c) => c.id === activeCityId)) setActiveCityId(cs[0]?.id ?? "dmv");
      // Seed built-in cities into the cloud so place/profile FKs always resolve.
      CITIES.forEach((c) => {
        upsertCity(c);
      });
      setHydrated(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load profiles + places whenever the active city changes.
  useEffect(() => {
    if (!hydrated) return;
    (async () => {
      const [ps, pl] = await Promise.all([getProfiles(activeCityId), getPlaces(activeCityId)]);
      const profs = ps.length ? ps : [makeDefaultProfile(activeCityId)];
      setProfiles(profs);
      setActiveProfileId(profs[0]?.id ?? null);

      let list = pl;
      if (!list.length && activeCityId === "dmv") list = SEED_PLACES; // ship-with default
      setPlaces(list);
      setSelectedId(null);
      setFilters(DEFAULT_FILTERS);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCityId, hydrated]);

  const effectiveAvailableDate = (p: Place) => getMetaForPlace(meta, p.id).availableDateManual || "";

  const filtered = useMemo(
    () => applyFilters(places, filters, activeProfile, effectiveAvailableDate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [places, filters, meta, activeProfile]
  );

  const selected = places.find((p) => p.id === selectedId) ?? null;
  const selectedMeta: UserMeta = getMetaForPlace(meta, selectedId ?? "");

  function updateMeta(patch: Partial<UserMeta>) {
    if (!selectedId) return;
    saveUserMetaEntry(meta, selectedId, patch).then(setMeta);
  }

  function importPlaces(next: Place[]) {
    const tagged = next.map((p) => ({ ...p, cityId: p.cityId ?? activeCityId }));
    setPlaces(tagged);
    (async () => {
      if (activeCity) await upsertCity(activeCity); // satisfy places.city_id FK
      await upsertPlaces(tagged);
    })();
    setSelectedId(null);
  }

  function addApartment(place: Place) {
    const next = mergePlaces(places, [place]);
    setPlaces(next);
    (async () => {
      if (activeCity) await upsertCity(activeCity); // satisfy places.city_id FK
      await upsertPlaces([place]);
    })();
    setSelectedId(place.id);
  }

  function resetData() {
    if (!confirm("Reset this city to its default dataset? Your notes/status are kept.")) return;
    const base = activeCityId === "dmv" ? SEED_PLACES : [];
    setPlaces(base);
    upsertPlaces(base);
    setSelectedId(null);
  }

  // Merge discovered/new places by id without clobbering curated entries.
  function mergePlaces(existing: Place[], incoming: Place[]): Place[] {
    const map = new Map(existing.map((p) => [p.id, p] as const));
    for (const p of incoming) if (!map.has(p.id)) map.set(p.id, p);
    return Array.from(map.values());
  }

  async function discover() {
    if (!activeCity) return;
    setDiscovering(true);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: activeCity, query: activeProfile?.query }),
      });
      const data = await res.json();
      if (data.error) {
        alert("Discover failed: " + data.error);
        return;
      }
      const incoming: Place[] = data.places ?? [];
      if (!incoming.length) {
        alert("No new places found for this search.");
        return;
      }
      const merged = mergePlaces(places, incoming);
      setPlaces(merged);
      await upsertPlaces(incoming);
    } catch (e) {
      alert("Discover failed: " + String(e));
    } finally {
      setDiscovering(false);
    }
  }

  async function computeCommutes() {
    if (!activeProfile || activeProfile.anchors.length === 0) {
      alert("Add at least one anchor in the profile editor first.");
      return;
    }
    const origins = places
      .filter((p) => p.latitude != null && p.longitude != null)
      .map((p) => ({ id: p.id, lat: p.latitude as number, lng: p.longitude as number }));
    if (!origins.length) return;

    setComputing(true);
    try {
      const res = await fetch("/api/commute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ places: origins, anchors: activeProfile.anchors }),
      });
      const data = await res.json();
      if (data.enabled === false) {
        alert(data.reason || "Routes API not configured.");
        return;
      }
      if (data.error) {
        alert("Commute failed: " + data.error);
        return;
      }
      const commutes: Record<string, CommuteResult[]> = data.commutes ?? {};
      const updated = places.map((p) => (commutes[p.id] ? { ...p, commutes: commutes[p.id] } : p));
      setPlaces(updated);
      await upsertPlaces(updated.filter((p) => commutes[p.id]));

      // Persist any geocoded anchor coordinates back onto the profile.
      if (data.anchors) saveProfile({ ...activeProfile, anchors: data.anchors });
    } catch (e) {
      alert("Commute failed: " + String(e));
    } finally {
      setComputing(false);
    }
  }

  function saveProfile(next: SearchProfile) {
    setProfiles((prev) => prev.map((p) => (p.id === next.id ? next : p)));
    // Ensure the parent city row exists (profiles.city_id -> cities.id FK) before saving.
    (async () => {
      if (activeCity) await upsertCity(activeCity);
      await upsertProfile(next);
    })();
  }

  async function addCity() {
    const name = window.prompt("City to add (e.g. 'Brooklyn, NY' or 'Austin, TX')");
    if (!name) return;
    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: name }),
      });
      const data = await res.json();
      if (data.error || !data.location) {
        alert("Could not find that city: " + (data.error || "no result"));
        return;
      }
      const id = slugify(name);
      const city: City = {
        id,
        name,
        region: "",
        country: "US",
        center: { lat: data.location.lat, lng: data.location.lng },
        defaultZoom: 12,
      };
      setCities((prev) => (prev.some((c) => c.id === id) ? prev : [...prev, city]));
      await upsertCity(city);
      // Seed a default profile for the new city.
      const prof = makeDefaultProfile(id);
      await upsertProfile(prof);
      setActiveCityId(id);
    } catch (e) {
      alert("Add city failed: " + String(e));
    }
  }

  return (
    <main className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <header className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            PlaceScout <span className="text-brand-600">Map</span>
          </h1>
          <p className="text-xs text-slate-500">
            Multi-city apartment scout · auto-discovery · commute scoring
          </p>
        </div>
        <Toolbar
          places={places}
          onImport={importPlaces}
          onResetData={resetData}
          view={view}
          onToggleView={() => setView(view === "explore" ? "present" : "explore")}
        />
      </header>

      <CityBar
        cities={cities}
        activeCityId={activeCityId}
        onCityChange={setActiveCityId}
        onAddCity={addCity}
        profiles={profiles}
        activeProfileId={activeProfile?.id ?? null}
        onProfileChange={setActiveProfileId}
        onDiscover={discover}
        discovering={discovering}
        onComputeCommutes={computeCommutes}
        computing={computing}
        anchorCount={activeProfile?.anchors.length ?? 0}
        onToggleProfileEditor={() => setShowProfileEditor((v) => !v)}
        onAddApartment={() => setShowAddApartment(true)}
        cloud={cloud}
      />

      {showProfileEditor && activeProfile && (
        <ProfileEditor
          profile={activeProfile}
          onChange={saveProfile}
          onClose={() => setShowProfileEditor(false)}
        />
      )}

      {showAddApartment && (
        <AddApartmentModal
          city={activeCity}
          profile={activeProfile}
          onAdd={addApartment}
          onClose={() => setShowAddApartment(false)}
        />
      )}

      {view === "present" ? (
        <PresentationView places={places} profile={activeProfile} city={activeCity} onSelect={setSelectedId} />
      ) : (
        <>
          <FilterBar
            filters={filters}
            profile={activeProfile}
            onChange={setFilters}
            onReset={() => setFilters(DEFAULT_FILTERS)}
            count={filtered.length}
            total={places.length}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="h-[420px] lg:h-[560px]">
              {hasMapKey ? (
                <MapView
                  places={filtered}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  center={activeCity?.center}
                  zoom={activeCity?.defaultZoom}
                  profile={activeProfile}
                />
              ) : (
                <MapPlaceholder />
              )}
            </div>
            <div className="lg:h-[560px] lg:overflow-y-auto">
              {hydrated && (
                <TableView
                  places={filtered}
                  meta={meta}
                  profile={activeProfile}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              )}
            </div>
          </div>

          <Legend profile={activeProfile} />
        </>
      )}

      {selected && (
        <DetailPanel
          place={selected}
          meta={selectedMeta}
          profile={activeProfile}
          onClose={() => setSelectedId(null)}
          onMetaChange={updateMeta}
        />
      )}
    </main>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || `city-${Date.now()}`;
}

function Legend({ profile }: { profile: SearchProfile | null }) {
  const hasBasketball = (profile?.amenities ?? []).some((a) => a.key.includes("basketball"));
  const hasAnchors = (profile?.anchors ?? []).length > 0;
  return (
    <div className="no-print flex flex-wrap items-center gap-4 rounded-xl border border-brand-100 bg-white p-3 text-xs text-slate-600">
      <span className="font-semibold text-brand-700">Map legend:</span>
      <Dot color="#16a34a" label="Strong fit" />
      <Dot color="#eab308" label="Good, tradeoffs" />
      <Dot color="#dc2626" label="Weak fit / over budget" />
      {hasBasketball && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-orange-500" /> basketball court
        </span>
      )}
      {hasAnchors && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-brand-500" /> close to your anchor
        </span>
      )}
    </div>
  );
}

function Dot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-3 w-3 rounded-full" style={{ background: color }} /> {label}
    </span>
  );
}
