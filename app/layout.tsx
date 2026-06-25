import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PlaceScout Map",
  description: "Reusable Google Maps research tool — DMV apartment search edition.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
