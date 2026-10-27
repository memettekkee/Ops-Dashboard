import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlobalFilterBar } from "@/components/filters/GlobalFilterBar";
import { ChartCard } from "@/components/charts/ChartCard";
import { KpiCard } from "@/components/KpiCard";
import { AssetTable } from "@/components/AssetTable";
import { useFilteredAssets, useModel } from "@/lib/useModel";
import { kpiSummary } from "@/domain/selectors";

export function Lifting() {
  const assets = useFilteredAssets("LIFTING");
  const model = useModel();
  const kpi = useMemo(() => kpiSummary(assets), [assets]);

  const byCategory = useMemo(() => {
    const map = new Map<string, { category: string; valid: number; due: number; expired: number }>();
    for (const a of assets) {
      const row = map.get(a.category) ?? { category: a.category, valid: 0, due: 0, expired: 0 };
      if (a.compliance === "EXPIRED") row.expired++;
      else if (a.compliance === "DUE_30" || a.compliance === "DUE_60") row.due++;
      else row.valid++;
      map.set(a.category, row);
    }
    return [...map.values()].sort((a, b) => (b.valid + b.due + b.expired) - (a.valid + a.due + a.expired)).slice(0, 12);
  }, [assets]);

  if (!model) return null;

  const scrapBreakdown = assets.filter(
    (a) => a.condition === "SCRAP" || a.condition === "BREAKDOWN" || a.condition === "MISSING",
  ).length;

  return (
    <div>
      <PageHeader
        overline="Sertifikasi Alat Angkat & Peralatan"
        title="Alat Angkat"
        description="Status sertifikasi seluruh alat angkat dan peralatan workshop."
      />
      <div className="flex flex-col gap-5 p-5">
        <GlobalFilterBar hide={["usable"]} />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <KpiCard label="Total" value={kpi.total} />
          <KpiCard label="Valid" value={assets.filter((a) => a.compliance === "VALID").length} tone="ok" />
          <KpiCard label="Jatuh Tempo" value={kpi.due30} tone="urgent" />
          <KpiCard label="Expired" value={kpi.expired} tone="danger" />
          <KpiCard label="Scrap/Breakdown/Hilang" value={scrapBreakdown} />
        </div>

        <ChartCard
          question="Berapa banyak aset per kategori dan statusnya?"
          subtitle="12 kategori terbesar, distack per status compliance."
          empty={byCategory.length === 0}
        >
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={byCategory} margin={{ bottom: 40 }}>
              <XAxis dataKey="category" fontSize={11} angle={-30} textAnchor="end" interval={0} height={60} />
              <YAxis allowDecimals={false} fontSize={12} />
              <RTooltip />
              <Legend />
              <Bar dataKey="valid" name="Valid" stackId="a" fill="var(--status-ok)" />
              <Bar dataKey="due" name="Jatuh Tempo" stackId="a" fill="var(--status-warn)" />
              <Bar dataKey="expired" name="Expired" stackId="a" fill="var(--status-danger)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard question="Daftar lengkap alat angkat" subtitle="Urutkan, cari, dan export sesuai kebutuhan.">
          <AssetTable assets={assets} />
        </ChartCard>
      </div>
    </div>
  );
}
