# PlaceScout Map 🗺️🏀

A **multi-city** apartment research tool. Pick (or add) any city, **auto-discover apartment
candidates via the Google Places API**, score & rank them against a configurable **search profile**
(budget, beds/baths, amenities, and commute time to your own "anchors" like an office or downtown),
then curate, take notes, and share a ranked roommate view. Ships pre-loaded with **13 verified DMV
apartments** as the default dataset.

Built with **Next.js 14 + TypeScript + Tailwind CSS**, the **Google Maps Platform**
(Maps JavaScript, Places API New, Geocoding, Routes), and **Supabase** (optional — falls back to
`localStorage` when not configured).

---

## What's inside

- **Interactive map** — color-coded pins (green = strong fit, yellow = tradeoffs, red = over budget/weak fit), an **orange dot for a basketball court** (filled-in = indoor), and a **blue ring for ≤10-min walk to Metro**. Click a pin for a quick card.
- **Sortable, filterable table** beside the map.
- **Filters** — max price, 2BR/2BA, walk ≤10/≤15 min, gym, basketball, indoor-court-only, Arlington-only, under-$3k, available-by-date, plus free-text search.
- **Detail side panel** — map preview, full facts, fit-score breakdown, pros/cons, sources & quotes, and **manual editing** (notes, roommate reaction, tour date, personal rank, tour-scheduled / contacted-leasing checkboxes, keep/maybe/reject). Saved to `localStorage`.
- **Import / Export** — JSON (full), CSV (in + out), print-friendly view.
- **Roommate presentation view** — clean ranked comparison cards to share with your roommate.
- **Optional live walk-times** — "Check live walk-time" button in the detail panel calls `/api/distance` if a server key is set; otherwise it gracefully uses the shipped research data.

---

## Quick start

```bash
# 1. Install
npm install

# 2. Add your Google Maps key (see "Google Maps setup" below)
cp .env.local.example .env.local
#   then edit .env.local and paste your browser key

# 3. Run
npm run dev
#   open http://localhost:3000
```

The table, filters, editing, import/export, and presentation view **all work without an API key** —
only the map itself needs one. (You'll see a friendly placeholder until the key is added.)

---

## Google Maps setup

1. [Google Cloud Console](https://console.cloud.google.com/) → create/select a project → **enable billing** (required even for the free monthly tier; set a **budget alert + quota caps**).
2. **APIs & Services → Library** → enable all four:
   - **Maps JavaScript API** — renders the map + markers (browser key).
   - **Places API (New)** — automated apartment discovery (server).
   - **Geocoding API** — resolves city names + anchor addresses (server).
   - **Routes API** — commute/walk times (server). *(Replaces the deprecated Distance Matrix API.)*
3. **Credentials → Create credentials → API key.** Recommended setup:
   - One **browser key** restricted to Maps JavaScript API + your HTTP referrers → `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
   - Three **server keys** (or one shared) restricted to their API → `GOOGLE_PLACES_API_KEY`, `GOOGLE_GEOCODING_API_KEY`, `GOOGLE_ROUTES_API_KEY`.
4. Copy `.env.local.example` → `.env.local` and paste your values. Restart `npm run dev` after editing.

> ⚠️ Only the `NEXT_PUBLIC_` key is exposed to the browser (by design — restrict it by referrer).
> The server keys are used only inside the `/api/*` routes and never shipped to the client.

## Supabase setup (optional but recommended)

Without Supabase the app runs in `localStorage`-only mode (per-browser). With it, cities, discovered
places, profiles, and your notes persist across devices, and Places results are cached to save API cost.

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor** → paste and run [`db/schema.sql`](db/schema.sql).
3. **Project Settings → API** → copy into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```

> The shipped RLS policies grant the `anon` role full access (single-user personal tool). Add auth +
> per-user policies before exposing the app publicly.

## How discovery works

1. Pick a city (or **+ Add city** — any city, geocoded on the fly) and a **search profile**.
2. **Discover apartments here** → Places API (New) finds candidates and maps them into the dataset.
3. **Edit profile / anchors** → set budget, amenity weights, and commute anchors (office, downtown…).
4. **Compute commutes** → Routes API fills per-anchor travel times; the fit score and table update live.
5. Curate, take notes/decisions, and share the roommate view.

---

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. On [vercel.com](https://vercel.com) → **New Project** → import the repo. Framework auto-detects as Next.js.
3. **Project → Settings → Environment Variables** — add:
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (required)
   - `GOOGLE_MAPS_SERVER_API_KEY` (optional)
4. Deploy. Then add your `*.vercel.app` domain to the browser key's HTTP-referrer allow-list in Google Cloud.

CLI alternative:

```bash
npm i -g vercel
vercel            # follow prompts
vercel env add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
vercel --prod
```

### Running in Cursor
Open this folder in Cursor, run `npm install` then `npm run dev` in the integrated terminal. Edit any
file and the dev server hot-reloads. Use Cursor's AI to tweak components in `components/` or extend
the data model in `lib/types.ts`.

---

## Project structure

```
app/
  page.tsx              # main wiring: map + filters + table + panel + present view
  layout.tsx            # root layout
  globals.css           # Tailwind + print styles
  api/distance/route.ts # OPTIONAL serverless Distance Matrix proxy
components/
  MapView.tsx           # Google Map + custom SVG markers + info windows
  MapPlaceholder.tsx    # shown when no API key
  FilterBar.tsx         # all filters
  TableView.tsx         # sortable table
  DetailPanel.tsx       # detail + manual editing + live-distance button
  PresentationView.tsx  # roommate comparison cards
  Toolbar.tsx           # import/export/print/reset/view toggle
lib/
  types.ts              # generic Place model + ApartmentDetails + UserMeta
  scoring.ts            # fit-score formula + marker tiers
  filters.ts            # filter state + predicate
  io.ts                 # CSV/JSON import + export
  storage.ts            # localStorage persistence
data/
  seed.ts               # the 13 verified apartments
public/
  apartments.json       # standalone JSON export of the dataset
  apartments.csv        # standalone CSV export of the dataset
```

---

## Fit score (out of 100)

Computed live in `lib/scoring.ts` so imported data scores consistently:

| Signal | Points |
|---|---|
| Price under $3,000 | +25 |
| ≤10-min walk to Metro | +25 |
| ≤15-min walk to Metro (if not ≤10) | +15 |
| Has gym | +10 |
| Has basketball court | +15 |
| Indoor basketball court | +10 extra |
| Good location between McLean & DC | +15 |
| 2BR/2BA confirmed | +10 |
| Unknown price / 2BA not confirmed | −10 each |
| Long walk to Metro (>20 min) | −5 |
| Far out (Ashburn) long commute | −25 |

The detail panel shows the full per-signal breakdown for transparency.

---

## Reusing for other research (restaurants, hotels, etc.)

The `Place` model is generic. To map something other than apartments:

1. Add a category to `PlaceCategory` if needed (already supports `restaurant | business | hotel | vendor | other`).
2. Create `Place` objects with the shared fields (`name`, `streetAddress`, `latitude/longitude`, `website`, `rating`, `priceLevel`, `tags`, `sourceQuotes`, `customFields`, etc.).
3. Leave `apartmentDetails` undefined for non-apartments — the table/panel already guard for it, and the fit score falls back to the stored `fitScore`.
4. Import via **Import JSON** in the toolbar (replaces the active dataset; your notes/status persist by `id`).

---

## Data gaps to confirm with leasing offices

These are flagged in the dataset but should be verified by phone/email before deciding:

- **True 2BR/2BA existence & pricing:** Lyon Village (may be 2BR/1BA only), RiverHouse (which 2BRs are 2-bath and under $3k), The Paramount/Cortland (cheaper "2BR" listings are 1.5-bath — confirm 2-bath price).
- **Exact door-to-turnstile Metro walk times:** MAA Tysons Corner (~0.9 mi), Commons of McLean (~0.6 mi), RiverHouse (~0.7 mi).
- **Coffee bar / beer-on-tap:** mostly "unknown" except Commons (Starbucks), The Point (cafés), Paramount/Cortland (club-room bar), Avalon Dunn Loring (pool bar/lounge).
- **Basketball court access hours:** Halstead "The Dunk," The Garrett, BLVD Gramercy East.
- **Coordinates:** approximate for all except The Paramount/Cortland — geocode street addresses before relying on exact pin placement.
- **End-of-July 2026 availability:** verify per property (units turn over; don't rule a place out on today's availability).
- **WMATA summer track work:** Orange/Silver lines through Arlington/Fairfax have had summer single-tracking/closures in past years — check service status near your move-in, as it affects the Dunn Loring and McLean commutes.

---

## Leasing-office outreach script

Copy/paste and fill the brackets. Short text version and longer email version below.

**Text / quick DM:**

> Hi! I'm relocating to the area end of July and looking at a 2BR/2BA at [COMMUNITY NAME].
> Could you share: (1) current 2BR/2BA availability & earliest move-in, (2) monthly rent + any
> specials, (3) walking time to [METRO STATION], (4) whether you have a fitness center, coffee
> bar, beer/tap or resident lounge, and a basketball court (indoor or outdoor)? Thanks so much!

**Email:**

> **Subject:** 2BR/2BA availability & amenities — [COMMUNITY NAME], end-of-July move-in
>
> Hi [LEASING TEAM],
>
> My future roommate and I are relocating to the DMV for work and are very interested in a
> **2-bedroom / 2-bathroom** apartment at **[COMMUNITY NAME]**, targeting an **end-of-July** move-in.
> Could you help with a few questions?
>
> 1. **Availability:** Which 2BR/2BA floor plans are available for late July, and what are the earliest move-in dates?
> 2. **Price:** Current monthly rent for those units, plus any move-in specials, amenity fees, or parking costs.
> 3. **Commute:** Approximate walking time/distance from the community to **[METRO STATION]** ([LINE] line).
> 4. **Fitness:** Details on the fitness center (hours, equipment, classes).
> 5. **Food/drink amenities:** Is there a **coffee bar/café**, and any **beer on tap / resident lounge / happy-hour** amenity?
> 6. **Basketball:** Do you have a **basketball court** on site? Is it **indoor or outdoor**, and what are the resident access hours?
>
> We'd also love to schedule a tour if a 2BR/2BA is available. Thank you!
>
> Best,
> [YOUR NAME] · [PHONE] · [EMAIL]

---

## Notes & caveats

- Pricing and availability change daily; figures last verified **2026-06-24**. Always confirm with the leasing office.
- "Beer on tap" is marked `false`/unknown unless explicitly found — not assumed.
- Basketball court type distinguishes **indoor** vs **outdoor/half-court** vs **nearby public park** (Lyon Village's court is a public park, not on-site).
- This is a research aid, not financial or legal advice.
