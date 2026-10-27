import { useMemo } from "react";
import { useDataStore } from "@/store/useDataStore";
import { useFilterStore, applyFilters } from "@/store/useFilterStore";
import type { Asset, DomainModel } from "@/domain/types";

/** Reference date for all calculations = today. */
export function useToday(): Date {
  return useMemo(() => new Date(), []);
}

export function useModel(): DomainModel | null {
  return useDataStore((s) => s.model);
}

/** Returns globally-filtered assets, optionally pre-scoped to a control type. */
export function useFilteredAssets(scope?: Asset["controlType"]): Asset[] {
  const model = useDataStore((s) => s.model);
  const filters = useFilterStore();
  return useMemo(() => {
    let assets = model?.assets ?? [];
    if (scope) assets = assets.filter((a) => a.controlType === scope);
    return applyFilters(assets, {
      type: filters.type,
      areas: filters.areas,
      categories: filters.categories,
      vendors: filters.vendors,
      statuses: filters.statuses,
      usable: filters.usable,
      period: filters.period,
    });
  }, [model, filters, scope]);
}
