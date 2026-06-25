"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { MapPinHouse } from "lucide-react";
import { City, CommuteResult, Place, SearchProfile, UserMeta, UserMetaStore } from "@/lib/types";
import { SEED_PLACES } from "@/data/seed";
import { CITIES, makeDefaultProfile } from "@/data/profiles";
import { Filters, DEFAULT_FILTERS, applyFilters } from "@/lib/filters";
import { getMetaForPlace } from "@/lib/storage";
import { lowestPrice } from "@/lib/scoring";
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
import WorkflowStrip from "@/components/WorkflowStrip";
import NextBestActions from "@/components/NextBestActions";
import {
  ToastProvider,
  useToast,
  ConfirmDialog,
  ConfirmOptions,
  PromptModal,
  EmptyState,
  Spinner,
} from "@/components/ui";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function Home() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}

function AppShell() {
  const toast = useToast();

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
  const [autofilling, setAutofilling] = useState(false);
  const [placesLoading, setPlacesLoading] = useState(true);

  // App-native dialogs (replacing window.alert/confirm/prompt).
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const [showAddCity, setShowAddCity] = useState(false);
  const [addCityLoading, setAddCityLoading] = useState(false);
  const [addCityError, setAddCityError] = useState<string | null>(null);

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
      if (!cs.some((c) => c.id === activeCityId)) setActiveCityId(cs[0]?.id ?? "dmv");
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
    let cancelled = false;
    setPlacesLoading(true);
    setSelectedId(null);
    setFilters(DEFAULT_FILTERS);

    // Show the shipped seed for the default city immediately so first paint has
    // real data while the cloud copy loads/reconciles in the background.
    if (activeCityId === "dmv") {
      setPlaces(SEED_PLACES);
      setPlacesLoading(false);
    } else {
      setPlaces([]);
    }

    (async () => {
      const [ps, pl] = await Promise.all([getProfiles(activeCityId), getPlaces(activeCityId)]);
      if (cancelled) return;
      const profs = ps.length ? ps : [makeDefaultProfile(activeCityId)];
      setProfiles(profs);
      setActiveProfileId(profs[0]?.id ?? null);

      let list = pl;
      if (activeCityId === "dmv") {
        const haveIds = new Set(pl.map((p) => p.id));
        const missing = SEED_PLACES.filter((s) => !haveIds.has(s.id));
        list = [...pl, ...missing];
        if (missing.length && activeCity) {
          await upsertCity(activeCity);
          await upsertPlaces(missing);
        }
      }
      if (cancelled) return;
      setPlaces(list);
      setPlacesLoading(false);
    })();

    return () => {
      cancelled = true;
    };
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

  // Workflow status counts.
  const decidedCount = useMemo(
    () =>
      places.filter((p) => {
        const dec = getMetaForPlace(meta, p.id).decision;
        return dec && dec !== "unset";
      }).length,
    [places, meta]
  );
  const needsVerifyCount = useMemo(
    () =>
      places.filter((p) => p.apartmentDetails?.needsPriceConfirmation || lowestPrice(p) === null)
        .length,
    [places]
  );

  // ---- Overlay exclusivity ---------------------------------------------------
  function closeOverlays() {
    setShowProfileEditor(false);
    setShowAddApartment(false);
    setSelectedId(null);
  }
  function selectPlace(id: string) {
    setSelectedId(id);
    setShowAddApartment(false); // opening detail closes the add modal
  }
  function openAddApartment() {
    setShowAddApartment(true);
    setShowProfileEditor(false);
    setSelectedId(null);
  }
  function toggleProfileEditor() {
    const next = !showProfileEditor;
    setShowProfileEditor(next);
    if (next) {
      setShowAddApartment(false);
      setSelectedId(null);
    }
  }
  function toggleView() {
    const next = view === "explore" ? "present" : "explore";
    setView(next);
    if (next === "present") closeOverlays();
  }
  function goToRoommateView() {
    setView("present");
    closeOverlays();
  }

  // ---- Workflow / next-best-action navigation --------------------------------
  function focusCompare() {
    document.getElementById("compare")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function gotoVerify() {
    setView("explore");
    setFilters({ ...DEFAULT_FILTERS, needsPriceConfirmation: true });
    setTimeout(focusCompare, 50);
  }
  function filterNeedsPrice() {
    setView("explore");
    setFilters({ ...DEFAULT_FILTERS, needsPriceConfirmation: true });
    setTimeout(focusCompare, 50);
  }
  function openFirstUndecided() {
    const p = places.find((pl) => {
      const dec = getMetaForPlace(meta, pl.id).decision;
      return !dec || dec === "unset";
    });
    if (p) selectPlace(p.id);
    else toast.info("Every place already has a decision.");
  }

  function importPlaces(next: Place[]) {
    const tagged = next.map((p) => ({ ...p, cityId: p.cityId ?? activeCityId }));
    setPlaces(tagged);
    (async () => {
      if (activeCity) await upsertCity(activeCity);
      await upsertPlaces(tagged);
    })();
    setSelectedId(null);
    toast.success(`Imported ${tagged.length} place${tagged.length === 1 ? "" : "s"}.`);
  }

  function addApartment(place: Place) {
    const next = mergePlaces(places, [place]);
    setPlaces(next);
    (async () => {
      if (activeCity) await upsertCity(activeCity);
      await upsertPlaces([place]);
    })();
    selectPlace(place.id);
    toast.success(`Added "${place.name}".`);
  }

  function needsAutofill(p: Place): boolean {
    const hasLink = Boolean(p.website || p.primarySourceUrl || p.googlePlaceId);
    return hasLink && p.apartmentDetails?.priceLow == null;
  }

  function requestAutofillAll() {
    const targets = places.filter(needsAutofill);
    if (!targets.length) {
      toast.info("Nothing needs auto-fill right now.");
      return;
    }
    setConfirm({
      title: "Auto-fill rent & amenities?",
      message: `Read ${targets.length} website${targets.length === 1 ? "" : "s"} and fill rent + amenities with the LLM (${targets.length} model call${targets.length === 1 ? "" : "s"}).`,
      confirmLabel: "Run auto-fill",
      onConfirm: runAutofillAll,
    });
  }

  async function runAutofillAll() {
    const targets = places.filter(needsAutofill);
    if (!targets.length) return;
    setAutofilling(true);
    let ok = 0;
    let failed = 0;
    try {
      for (const p of targets) {
        try {
          const res = await fetch("/api/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: p.website || p.primarySourceUrl,
              googlePlaceId: p.googlePlaceId,
              name: p.name,
              address: `${p.streetAddress}, ${p.city}, ${p.state}`,
            }),
          });
          const data = await res.json();
          if (!data.implemented) {
            toast.error(data.reason || "Auto-fill needs an LLM key configured.");
            break;
          }
          if (data.ok && data.fields) {
            const prev = p.apartmentDetails;
            updatePlace(p.id, {
              website: p.website || data.url,
              apartmentDetails: prev
                ? { ...prev, ...data.fields, availableDateManual: prev.availableDateManual }
                : data.fields,
            });
            ok++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }
      toast.success(`Auto-fill complete: ${ok} filled, ${failed} skipped.`);
    } finally {
      setAutofilling(false);
    }
  }

  function updatePlace(id: string, patch: Partial<Place>) {
    let updated: Place | null = null;
    setPlaces((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        updated = { ...p, ...patch };
        return updated;
      })
    );
    if (updated) upsertPlaces([updated]);
  }

  function resetData() {
    setConfirm({
      title: "Reset this city?",
      message: "Restore the default dataset for this city. Your notes, tour status, and decisions are kept.",
      confirmLabel: "Reset data",
      tone: "danger",
      onConfirm: () => {
        const base = activeCityId === "dmv" ? SEED_PLACES : [];
        setPlaces(base);
        upsertPlaces(base);
        setSelectedId(null);
        toast.success("City reset to its default dataset.");
      },
    });
  }

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
        toast.error("Discover failed: " + data.error);
        return;
      }
      const incoming: Place[] = data.places ?? [];
      if (!incoming.length) {
        toast.info("No new places found for this search.");
        return;
      }
      const merged = mergePlaces(places, incoming);
      setPlaces(merged);
      await upsertPlaces(incoming);
      toast.success(`Discovery complete: added ${incoming.length} place${incoming.length === 1 ? "" : "s"}.`);
    } catch (e) {
      toast.error("Discover failed: " + String(e));
    } finally {
      setDiscovering(false);
    }
  }

  async function computeCommutes() {
    if (!activeProfile || activeProfile.anchors.length === 0) {
      toast.info("Add at least one commute anchor in the profile editor first.");
      setShowProfileEditor(true);
      setShowAddApartment(false);
      setSelectedId(null);
      return;
    }
    const origins = places
      .filter((p) => p.latitude != null && p.longitude != null)
      .map((p) => ({ id: p.id, lat: p.latitude as number, lng: p.longitude as number }));
    if (!origins.length) {
      toast.info("No places have coordinates to measure from yet.");
      return;
    }

    setComputing(true);
    try {
      const res = await fetch("/api/commute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ places: origins, anchors: activeProfile.anchors }),
      });
      const data = await res.json();
      if (data.enabled === false) {
        toast.error(data.reason || "Routes API is not configured.");
        return;
      }
      if (data.error) {
        toast.error("Commute failed: " + data.error);
        return;
      }
      const commutes: Record<string, CommuteResult[]> = data.commutes ?? {};
      const updated = places.map((p) => (commutes[p.id] ? { ...p, commutes: commutes[p.id] } : p));
      setPlaces(updated);
      await upsertPlaces(updated.filter((p) => commutes[p.id]));
      if (data.anchors) saveProfile({ ...activeProfile, anchors: data.anchors });
      toast.success(`Commutes computed for ${Object.keys(commutes).length} place${Object.keys(commutes).length === 1 ? "" : "s"}.`);
    } catch (e) {
      toast.error("Commute failed: " + String(e));
    } finally {
      setComputing(false);
    }
  }

  function saveProfile(next: SearchProfile) {
    setProfiles((prev) => prev.map((p) => (p.id === next.id ? next : p)));
    (async () => {
      if (activeCity) await upsertCity(activeCity);
      await upsertProfile(next);
    })();
  }

  async function submitAddCity(name: string) {
    setAddCityLoading(true);
    setAddCityError(null);
    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: name }),
      });
      const data = await res.json();
      if (data.error || !data.location) {
        setAddCityError("Could not find that city: " + (data.error || "no result"));
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
      const prof = makeDefaultProfile(id);
      await upsertProfile(prof);
      setActiveCityId(id);
      setShowAddCity(false);
      toast.success(`Added ${name}.`);
    } catch (e) {
      setAddCityError("Add city failed: " + String(e));
    } finally {
      setAddCityLoading(false);
    }
  }

  const placeCount = places.length;

  return (
    <main className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <header className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <MapPinHouse className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
          </span>
          <div>
            <h1 className="wordmark text-2xl leading-none">
              PlaceScout <span className="wordmark-accent">Map</span>
            </h1>
            <p className="mt-1.5 text-xs text-tan-ink">
              Multi-city apartment scout · auto-discovery · commute scoring
            </p>
          </div>
        </div>
        <Toolbar
          places={places}
          onImport={importPlaces}
          onResetData={resetData}
          view={view}
          onToggleView={toggleView}
        />
      </header>

      <WorkflowStrip
        total={placeCount}
        shown={filtered.length}
        needsVerify={needsVerifyCount}
        decided={decidedCount}
        discovering={discovering}
        view={view}
        onDiscover={discover}
        onCompare={() => {
          setView("explore");
          setTimeout(focusCompare, 50);
        }}
        onVerify={gotoVerify}
        onDecide={openFirstUndecided}
        onShare={goToRoommateView}
      />

      <CityBar
        cities={cities}
        activeCityId={activeCityId}
        onCityChange={setActiveCityId}
        onAddCity={() => {
          setAddCityError(null);
          setShowAddCity(true);
        }}
        profiles={profiles}
        activeProfileId={activeProfile?.id ?? null}
        onProfileChange={setActiveProfileId}
        onDiscover={discover}
        discovering={discovering}
        onComputeCommutes={computeCommutes}
        computing={computing}
        anchorCount={activeProfile?.anchors.length ?? 0}
        onToggleProfileEditor={toggleProfileEditor}
        onAddApartment={openAddApartment}
        onAutofillAll={requestAutofillAll}
        autofilling={autofilling}
        autofillCount={places.filter(needsAutofill).length}
        cloud={cloud}
      />

      {showProfileEditor && activeProfile && (
        <ProfileEditor
          profile={activeProfile}
          onChange={saveProfile}
          onClose={() => setShowProfileEditor(false)}
        />
      )}

      {view === "explore" && hydrated && placeCount > 0 && (
        <NextBestActions
          places={places}
          meta={meta}
          profile={activeProfile}
          onComputeCommutes={computeCommutes}
          onFilterNeedsPrice={filterNeedsPrice}
          onOpenPlace={selectPlace}
          onRoommateView={goToRoommateView}
          onAutofillAll={requestAutofillAll}
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
        <PresentationView places={places} profile={activeProfile} city={activeCity} onSelect={selectPlace} />
      ) : !hydrated || placesLoading ? (
        <LoadingPanel city={activeCity} />
      ) : placeCount === 0 ? (
        <EmptyState
          icon="🏙️"
          title={`No places in ${activeCity?.name ?? "this city"} yet`}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <button
                onClick={discover}
                disabled={discovering}
                className="rounded-lg bg-red-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
              >
                {discovering ? "Discovering…" : "Discover apartments here"}
              </button>
              <button
                onClick={openAddApartment}
                className="rounded-lg border border-warm px-4 py-1.5 text-sm font-medium text-ink hover:border-tan"
              >
                + Add apartment
              </button>
            </div>
          }
        >
          Run a discovery search, add a listing by link, or import a JSON/CSV file to get started.
        </EmptyState>
      ) : (
        <>
          <div id="compare">
            <FilterBar
              filters={filters}
              profile={activeProfile}
              onChange={setFilters}
              onReset={() => setFilters(DEFAULT_FILTERS)}
              count={filtered.length}
              total={placeCount}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="h-[420px] lg:h-[560px]">
              {hasMapKey ? (
                <MapView
                  places={filtered}
                  selectedId={selectedId}
                  onSelect={selectPlace}
                  center={activeCity?.center}
                  zoom={activeCity?.defaultZoom}
                  profile={activeProfile}
                />
              ) : (
                <MapPlaceholder />
              )}
            </div>
            <div className="lg:h-[560px]">
              {hydrated && (
                <TableView
                  places={filtered}
                  meta={meta}
                  profile={activeProfile}
                  selectedId={selectedId}
                  onSelect={selectPlace}
                  totalCount={placeCount}
                  hasAnchors={(activeProfile?.anchors.length ?? 0) > 0}
                  onComputeCommutes={computeCommutes}
                  computing={computing}
                  onResetFilters={() => setFilters(DEFAULT_FILTERS)}
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
          hasAnchors={(activeProfile?.anchors.length ?? 0) > 0}
          computing={computing}
          onComputeCommutes={computeCommutes}
          onClose={() => setSelectedId(null)}
          onMetaChange={updateMeta}
          onPlaceChange={updatePlace}
        />
      )}

      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
      <PromptModal
        open={showAddCity}
        title="Add a city"
        label="City to add"
        placeholder="e.g. Brooklyn, NY or Austin, TX"
        submitLabel="Add city"
        loading={addCityLoading}
        error={addCityError}
        onSubmit={submitAddCity}
        onClose={() => setShowAddCity(false)}
      />
    </main>
  );
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || `city-${Date.now()}`
  );
}

function LoadingPanel({ city }: { city: City | null }) {
  return (
    <div className="flex h-[420px] w-full flex-col items-center justify-center gap-3 rounded-xl border border-warm bg-white lg:h-[560px]">
      <Spinner className="h-6 w-6 text-blue-600" />
      <p className="text-sm font-medium text-ink/70">Loading {city?.name ?? "apartments"}…</p>
    </div>
  );
}

function Legend({ profile }: { profile: SearchProfile | null }) {
  const hasBasketball = (profile?.amenities ?? []).some((a) => a.key.includes("basketball"));
  const hasAnchors = (profile?.anchors ?? []).length > 0;
  return (
    <div className="no-print flex flex-wrap items-center gap-4 rounded-xl border border-warm bg-white p-3 text-xs text-ink/70">
      <span className="font-semibold text-blue-700">Map legend:</span>
      <Dot color="#16a34a" label="Strong fit" />
      <Dot color="#d99a16" label="Good, tradeoffs" />
      <Dot color="#bd3342" label="Weak fit / over budget" />
      {hasBasketball && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-orange-500" /> basketball court
        </span>
      )}
      {hasAnchors && (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-blue-600" /> close to your anchor
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
