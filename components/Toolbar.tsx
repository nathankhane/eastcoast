"use client";

import { useRef } from "react";
import { Place } from "@/lib/types";
import { downloadCSV, downloadJSON, parseJSON, parseCSV } from "@/lib/io";

interface Props {
  places: Place[];
  onImport: (places: Place[]) => void;
  onResetData: () => void;
  view: "explore" | "present";
  onToggleView: () => void;
}

export default function Toolbar({ places, onImport, onResetData, view, onToggleView }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      try {
        if (file.name.endsWith(".json")) onImport(parseJSON(text));
        else if (file.name.endsWith(".csv")) onImport(parseCSV(text, places));
        else alert("Please choose a .json or .csv file.");
      } catch (err) {
        alert("Import failed: " + (err as Error).message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const btn = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-400";

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <button onClick={onToggleView} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
        {view === "explore" ? "Roommate view →" : "← Back to explore"}
      </button>
      <span className="mx-1 h-5 w-px bg-slate-200" />
      <button onClick={() => downloadJSON(places)} className={btn}>Export JSON</button>
      <button onClick={() => downloadCSV(places)} className={btn}>Export CSV</button>
      <button onClick={() => fileRef.current?.click()} className={btn}>Import JSON/CSV</button>
      <button onClick={() => window.print()} className={btn}>Print</button>
      <button onClick={onResetData} className={`${btn} text-red-600`}>Reset data</button>
      <input ref={fileRef} type="file" accept=".json,.csv" onChange={handleFile} className="hidden" />
    </div>
  );
}
