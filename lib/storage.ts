import { UserMeta, UserMetaStore, DEFAULT_USER_META, Place } from "@/lib/types";

const META_KEY = "placescout:userMeta:v1";
const PLACES_KEY = "placescout:places:v1";

// ---- User meta (notes, tour status, ranking, decision) ----

export function loadUserMeta(): UserMetaStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as UserMetaStore) : {};
  } catch {
    return {};
  }
}

export function saveUserMeta(store: UserMetaStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(META_KEY, JSON.stringify(store));
  } catch {
    /* quota or serialization error — ignore */
  }
}

export function getMetaForPlace(store: UserMetaStore, id: string): UserMeta {
  return { ...DEFAULT_USER_META, ...(store[id] ?? {}) };
}

export function setMetaForPlace(
  store: UserMetaStore,
  id: string,
  patch: Partial<UserMeta>
): UserMetaStore {
  const next: UserMetaStore = {
    ...store,
    [id]: { ...(store[id] ?? {}), ...patch },
  };
  saveUserMeta(next);
  return next;
}

// ---- Places (allows imported datasets to override the seed) ----

export function loadStoredPlaces(): Place[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PLACES_KEY);
    return raw ? (JSON.parse(raw) as Place[]) : null;
  } catch {
    return null;
  }
}

export function saveStoredPlaces(places: Place[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PLACES_KEY, JSON.stringify(places));
  } catch {
    /* ignore */
  }
}

export function clearStoredPlaces(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PLACES_KEY);
}
