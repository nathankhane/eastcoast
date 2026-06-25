"use client";

export default function MapPlaceholder() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center rounded-xl border border-dashed border-warm bg-cream p-8 text-center">
      <div className="text-4xl">🗺️</div>
      <h3 className="mt-3 font-semibold text-ink">Map needs a Google Maps API key</h3>
      <p className="mt-1 max-w-sm text-sm text-tan-ink">
        Add <code className="rounded bg-warm px-1">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to
        your <code className="rounded bg-warm px-1">.env.local</code> file and restart the dev
        server. The table, filters, and all editing work without it.
      </p>
      <p className="mt-2 text-xs text-tan">See README.md → &ldquo;Google Maps setup&rdquo;.</p>
    </div>
  );
}
