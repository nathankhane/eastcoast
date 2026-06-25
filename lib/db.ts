import { browserSupabase, supabaseConfigured } from "@/lib/supabase";
import { City, Place, SearchProfile, UserMeta, UserMetaStore } from "@/lib/types";
import { CITIES, DEFAULT_PROFILES } from "@/data/profiles";
import {
  loadStoredPlaces,
  saveStoredPlaces,
  loadUserMeta,
  setMetaForPlace,
} from "@/lib/storage";

// ============================================================================
// Data-access layer. Async by design.
//   - If Supabase env vars are present  -> read/write Supabase.
//   - Otherwise                         -> fall back to localStorage + the
//                                           built-in defaults (offline mode).
// The rest of the app talks to this module, not to Supabase/localStorage
// directly, so swapping backends is a one-file change.
// ============================================================================

const LS_CITIES = "placescout:cities:v1";
const LS_PROFILES = "placescout:profiles:v1";

export function isCloud(): boolean {
  return supabaseConfigured();
}

// ---- Cities ----------------------------------------------------------------

export async function getCities(): Promise<City[]> {
  const sb = browserSupabase();
  if (sb) {
    const { data, error } = await sb.from("cities").select("data");
    // Always keep the built-in cities present; cloud rows override by id.
    if (!error && data) return mergeById(CITIES, data.map((r) => r.data as City));
  } else {
    const local = readLS<City[]>(LS_CITIES);
    if (local && local.length) return mergeById(CITIES, local);
  }
  return CITIES;
}

export async function upsertCity(city: City): Promise<void> {
  const sb = browserSupabase();
  if (sb) {
    await sb.from("cities").upsert({ id: city.id, data: city, updated_at: new Date().toISOString() });
    return;
  }
  const local = readLS<City[]>(LS_CITIES) ?? [];
  writeLS(LS_CITIES, mergeById(local, [city]));
}

// ---- Profiles --------------------------------------------------------------

export async function getProfiles(cityId?: string): Promise<SearchProfile[]> {
  const sb = browserSupabase();
  let all: SearchProfile[];
  if (sb) {
    let q = sb.from("profiles").select("data");
    if (cityId) q = q.eq("city_id", cityId);
    const { data, error } = await q;
    all = !error && data ? data.map((r) => r.data as SearchProfile) : [];
    if (!all.length) all = DEFAULT_PROFILES;
  } else {
    const local = readLS<SearchProfile[]>(LS_PROFILES) ?? [];
    all = mergeById(DEFAULT_PROFILES, local);
  }
  return cityId ? all.filter((p) => p.cityId === cityId) : all;
}

export async function upsertProfile(profile: SearchProfile): Promise<void> {
  const sb = browserSupabase();
  if (sb) {
    await sb.from("profiles").upsert({
      id: profile.id,
      city_id: profile.cityId,
      data: profile,
      updated_at: new Date().toISOString(),
    });
    return;
  }
  const local = readLS<SearchProfile[]>(LS_PROFILES) ?? [];
  writeLS(LS_PROFILES, mergeById(local, [profile]));
}

// ---- Places ----------------------------------------------------------------

export async function getPlaces(cityId?: string): Promise<Place[]> {
  const sb = browserSupabase();
  if (sb) {
    let q = sb.from("places").select("data");
    if (cityId) q = q.eq("city_id", cityId);
    const { data, error } = await q;
    if (!error && data) return data.map((r) => r.data as Place);
    return [];
  }
  const local = loadStoredPlaces() ?? [];
  return cityId ? local.filter((p) => (p.cityId ?? "dmv") === cityId) : local;
}

export async function upsertPlaces(places: Place[]): Promise<void> {
  if (!places.length) return;
  const sb = browserSupabase();
  if (sb) {
    const rows = places.map((p) => ({
      id: p.id,
      city_id: p.cityId ?? null,
      google_place_id: p.googlePlaceId ?? null,
      data: p,
      updated_at: new Date().toISOString(),
    }));
    await sb.from("places").upsert(rows);
    return;
  }
  // localStorage: merge by id into the stored set.
  const local = loadStoredPlaces() ?? [];
  saveStoredPlaces(mergeById(local, places));
}

export async function deletePlace(id: string): Promise<void> {
  const sb = browserSupabase();
  if (sb) {
    await sb.from("places").delete().eq("id", id);
    return;
  }
  const local = loadStoredPlaces() ?? [];
  saveStoredPlaces(local.filter((p) => p.id !== id));
}

// ---- User meta -------------------------------------------------------------

export async function getUserMeta(): Promise<UserMetaStore> {
  const sb = browserSupabase();
  if (sb) {
    const { data, error } = await sb.from("user_meta").select("place_id, data");
    if (!error && data) {
      const store: UserMetaStore = {};
      for (const row of data) store[row.place_id as string] = row.data as Partial<UserMeta>;
      return store;
    }
    return {};
  }
  return loadUserMeta();
}

export async function saveUserMetaEntry(
  store: UserMetaStore,
  placeId: string,
  patch: Partial<UserMeta>
): Promise<UserMetaStore> {
  const next: UserMetaStore = { ...store, [placeId]: { ...(store[placeId] ?? {}), ...patch } };
  const sb = browserSupabase();
  if (sb) {
    await sb.from("user_meta").upsert({
      place_id: placeId,
      data: next[placeId],
      updated_at: new Date().toISOString(),
    });
    return next;
  }
  // localStorage path persists via storage.ts and returns the new store.
  return setMetaForPlace(store, placeId, patch);
}

// ---- helpers ---------------------------------------------------------------

function mergeById<T extends { id: string }>(base: T[], overrides: T[]): T[] {
  const map = new Map(base.map((x) => [x.id, x] as const));
  for (const o of overrides) map.set(o.id, o);
  return Array.from(map.values());
}

function readLS<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeLS<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}
