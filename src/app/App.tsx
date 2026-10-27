import { useEffect } from "react";
import { Routes, Route, useLocation, useSearchParams } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { TopBar } from "@/components/layout/TopBar";
import { AssetPassportSheet } from "@/components/asset/AssetPassportSheet";
import { useDataStore } from "@/store/useDataStore";
import { useApplyTheme } from "@/store/useTheme";
import { useFilterStore, filtersToParams, paramsToFilters } from "@/store/useFilterStore";
import { Overview } from "@/pages/Overview";
import { Planning } from "@/pages/Planning";
import { Lifting } from "@/pages/Lifting";
import { Measuring } from "@/pages/Measuring";
import { Torque } from "@/pages/Torque";
import { DataQuality } from "@/pages/DataQuality";

const TITLES: Record<string, string> = {
  "/": "Ringkasan",
  "/perencanaan": "Perencanaan",
  "/alat-angkat": "Alat Angkat",
  "/alat-ukur": "Alat Ukur",
  "/torque": "Torque Wrench",
  "/kualitas-data": "Kualitas Data",
};

function useFilterUrlSync() {
  const [params, setParams] = useSearchParams();
  const filters = useFilterStore();
  const hydrate = useFilterStore((s) => s.hydrate);

  // Hydrate once on mount from URL.
  useEffect(() => {
    hydrate(paramsToFilters(params));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push filter changes to URL (preserving ?asset).
  useEffect(() => {
    const next = filtersToParams({
      type: filters.type,
      areas: filters.areas,
      categories: filters.categories,
      vendors: filters.vendors,
      statuses: filters.statuses,
      usable: filters.usable,
      period: filters.period,
    });
    const asset = params.get("asset");
    if (asset) next.set("asset", asset);
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.type, filters.areas, filters.categories, filters.vendors, filters.statuses, filters.usable, filters.period]);
}

export function App() {
  useApplyTheme();
  const init = useDataStore((s) => s.init);
  const loading = useDataStore((s) => s.loading);
  const error = useDataStore((s) => s.error);
  const model = useDataStore((s) => s.model);
  const location = useLocation();

  useEffect(() => {
    void init();
  }, [init]);

  const title = TITLES[location.pathname] ?? "Dashboard";

  return (
    <TooltipProvider delayDuration={200}>
      <FilterSync />
      <div className="flex h-screen overflow-hidden">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar title={title} />
          <main className="flex-1 overflow-y-auto">
            {error ? (
              <div className="p-6 text-sm text-destructive">Gagal memuat data: {error}</div>
            ) : !model && loading ? (
              <div className="p-6 text-sm text-muted-foreground">Memuat data…</div>
            ) : (
              <Routes>
                <Route path="/" element={<Overview />} />
                <Route path="/perencanaan" element={<Planning />} />
                <Route path="/alat-angkat" element={<Lifting />} />
                <Route path="/alat-ukur" element={<Measuring />} />
                <Route path="/torque" element={<Torque />} />
                <Route path="/kualitas-data" element={<DataQuality />} />
              </Routes>
            )}
          </main>
        </div>
      </div>
      <AssetPassportSheet />
    </TooltipProvider>
  );
}

function FilterSync() {
  useFilterUrlSync();
  return null;
}
