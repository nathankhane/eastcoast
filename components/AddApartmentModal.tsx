"use client";

import { useState } from "react";
import { BasketballCourtType, City, Place, SearchProfile } from "@/lib/types";

interface Props {
  city: City | null;
  profile: SearchProfile | null;
  onAdd: (place: Place) => void;
  onClose: () => void;
}

export default function AddApartmentModal({ city, profile, onAdd, onClose }: Props) {
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [rent, setRent] = useState("");
  const [has2br2ba, setHas2br2ba] = useState(true);
  const [amenityKeys, setAmenityKeys] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [autofilling, setAutofilling] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const amenities = profile?.amenities ?? [];

  const toggleAmenity = (k: string) =>
    setAmenityKeys((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  async function autofillFromLink() {
    if (!website) {
      setMsg("Enter a listing link first.");
      return;
    }
    setAutofilling(true);
    setMsg(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: website }),
      });
      const data = await res.json();
      if (!data.implemented) setMsg(data.reason || "Auto-fill not available yet — enter details manually.");
    } catch {
      setMsg("Auto-fill failed — enter details manually.");
    } finally {
      setAutofilling(false);
    }
  }

  async function submit() {
    if (!name.trim()) {
      setMsg("Name is required.");
      return;
    }
    if (!address.trim()) {
      setMsg("Address is required (used to place it on the map).");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      // Geocode the address for map placement.
      let lat: number | null = null;
      let lng: number | null = null;
      let parsedCity = city?.name ?? "";
      try {
        const res = await fetch("/api/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        });
        const geo = await res.json();
        if (geo.location) {
          lat = geo.location.lat;
          lng = geo.location.lng;
          const parts = String(geo.formattedAddress ?? "").split(",");
          if (parts.length >= 3) parsedCity = parts[1].trim();
        }
      } catch {
        /* geocoding optional; place will lack coords */
      }

      const priceLow = rent ? Number(rent) || null : null;
      const hasGym = amenityKeys.includes("gym");
      const hasCoffee = amenityKeys.includes("coffee");
      const hasBeerOrTap = amenityKeys.includes("beer");
      const hasBasketballCourt = amenityKeys.includes("basketball") || amenityKeys.includes("indoor_basketball");
      const courtType: BasketballCourtType = amenityKeys.includes("indoor_basketball")
        ? "indoor"
        : amenityKeys.includes("basketball")
        ? "outdoor"
        : "none";
      const extraTags = amenityKeys.filter((k) => k === "pool" || k === "parking");

      const place: Place = {
        id: `manual-${Date.now()}`,
        name: name.trim(),
        category: "apartment",
        cityId: city?.id,
        streetAddress: address.trim(),
        city: parsedCity,
        state: city?.region ?? "",
        zip: "",
        neighborhood: neighborhood.trim() || parsedCity,
        latitude: lat,
        longitude: lng,
        coordsApproximate: lat == null,
        website: website.trim(),
        primarySourceUrl: website.trim(),
        secondarySourceUrls: [],
        sourceQuotes: [],
        rating: null,
        priceLevel: "",
        tags: ["manually added", ...extraTags],
        imageUrls: [],
        confidenceScore: 60,
        fitScore: 0,
        fitReasoning: "Manually added. Fit computed from the active profile.",
        roommatePitch: "",
        pros: [],
        cons: [],
        lastVerified: new Date().toISOString().slice(0, 10),
        apartmentDetails: {
          has2br2ba,
          priceLow,
          priceHigh: null,
          priceNotes: "",
          availabilityStatus: "",
          availableDateManual: "",
          nearestMetro: "",
          metroLine: "",
          walkingMilesToMetro: null,
          walkingMinutesToMetro: null,
          drivingMinutesToMcLean: null,
          transitMinutesToMcLean: null,
          transitMinutesToDC: null,
          hasGym,
          hasCoffee,
          hasBeerOrTap,
          hasBasketballCourt,
          basketballCourtType: courtType,
          basketballNotes: "",
          parkingNotes: amenityKeys.includes("parking") ? "Parking available" : "",
        },
        commutes: [],
        customFields: notes ? { addNotes: notes } : undefined,
      };

      onAdd(place);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const input = "w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-400 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-brand-100 bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">
            Add apartment{city ? ` in ${city.name}` : ""}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Listing link">
            <div className="flex gap-2">
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://…"
                className={input}
              />
              <button
                onClick={autofillFromLink}
                disabled={autofilling}
                className="shrink-0 rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50"
                title="Coming soon — will extract details from the listing"
              >
                {autofilling ? "…" : "Auto-fill"}
              </button>
            </div>
          </Field>

          <Field label="Address (geocoded for the map)">
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, City, ST" className={input} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Community name" className={input} />
            </Field>
            <Field label="Neighborhood (optional)">
              <input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className={input} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Rent ($/mo)">
              <input type="number" value={rent} onChange={(e) => setRent(e.target.value)} placeholder="3000" className={input} />
            </Field>
            <label className="flex items-end gap-2 pb-1.5 text-sm text-slate-700">
              <input type="checkbox" checked={has2br2ba} onChange={(e) => setHas2br2ba(e.target.checked)} className="h-4 w-4 accent-brand-500" />
              2BR / 2BA
            </label>
          </div>

          {amenities.length > 0 && (
            <div>
              <span className="mb-1 block text-[11px] font-medium text-slate-500">Amenities</span>
              <div className="flex flex-wrap gap-2">
                {amenities.map((a) => (
                  <button
                    key={a.key}
                    onClick={() => toggleAmenity(a.key)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      amenityKeys.includes(a.key)
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:border-brand-300"
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Field label="Notes (optional)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={input} />
          </Field>

          {msg && <p className="text-xs text-amber-600">{msg}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-400">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {saving ? "Adding…" : "Add apartment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
