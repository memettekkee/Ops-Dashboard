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
import { useFilteredAssets, useModel, useToday } from "@/lib/useModel";
import { expiryByMonth } from "@/domain/selectors";
import { differenceInCalendarDays } from "date-fns";
import { formatDateID } from "@/lib/format";

export function Planning() {
  const assets = useFilteredAssets();
  const model = useModel();
  const today = useToday();

  const byMonth = useMemo(() => expiryByMonth(assets, today), [assets, today]);

  const pipeline = useMemo(() => {
    const stages = [
      { key: "2. Need Inspect", label: "Perlu Inspeksi" },
      { key: "4. Prepare for Certification", label: "Persiapan Sertifikasi" },
      { key: "1. Certified", label: "Tersertifikasi" },
    ];
    return stages.map((s) => ({
      label: s.label,
      count: assets.filter((a) => a.processStage === s.key).length,
    }));
  }, [assets]);

  const vendorOpen = useMemo(() => {
    if (!model) return [];
    return model.calibrations
      .filter((c) => c.poStatus === "OPEN")
      .map((c) => {
        const lead =
          c.sentToVendorAt && c.returnedFromVendorAt
            ? differenceInCalendarDays(c.returnedFromVendorAt, c.sentToVendorAt)
            : undefined;
        return { ...c, lead };
      });
  }, [model]);

  if (!model) return null;

  const maxMonth = byMonth.reduce((m, b) => Math.max(m, b.lifting + b.measuring + b.torque), 0);

  return (
    <div>
      <PageHeader
        overline="1–3 Bulan ke Depan"
        title="Apa yang harus disiapkan?"
        description="Beban sertifikasi/kalibrasi mendatang, pipeline proses, dan alat yang sedang di vendor."
      />
      <div className="flex flex-col gap-5 p-5">
        <GlobalFilterBar />

        <ChartCard
          question="Bulan mana beban sertifikasi paling tinggi?"
          subtitle="Jumlah aset yang akan expire per bulan, 12 bulan ke depan."
          empty={maxMonth === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byMonth}>
              <XAxis dataKey="label" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <RTooltip />
              <Legend />
              <Bar dataKey="lifting" name="Alat Angkat" stackId="a" fill="var(--chart-1)" />
              <Bar dataKey="measuring" name="Alat Ukur" stackId="a" fill="var(--chart-5)" />
              <Bar dataKey="torque" name="Torque" stackId="a" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className="grid gap-5 lg:grid-cols-2">
          <ChartCard question="Di mana posisi proses sertifikasi alat angkat?" empty={pipeline.every((p) => p.count === 0)}>
            <div className="flex flex-col gap-3">
              {pipeline.map((p, i) => {
                const max = Math.max(...pipeline.map((x) => x.count), 1);
                return (
                  <div key={p.label}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{p.label}</span>
                      <span className="font-mono">{p.count}</span>
                    </div>
                    <div className="h-6 overflow-hidden rounded bg-muted">
                      <div
                        className="h-full rounded"
                        style={{
                          width: `${(p.count / max) * 100}%`,
                          backgroundColor: [`var(--status-urgent)`, `var(--status-warn)`, `var(--status-ok)`][i],
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </ChartCard>

          <ChartCard
            question="Alat ukur apa yang sedang di vendor?"
            subtitle="PO yang masih OPEN beserta lead time."
            empty={vendorOpen.length === 0}
          >
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">ID</th>
                    <th className="px-2 py-1.5 font-medium">Vendor</th>
                    <th className="px-2 py-1.5 font-medium">Dikirim</th>
                    <th className="px-2 py-1.5 font-medium">Lead</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorOpen.map((c, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1.5 font-mono text-xs">{c.assetId}</td>
                      <td className="px-2 py-1.5">{c.vendor ?? "—"}</td>
                      <td className="px-2 py-1.5">{formatDateID(c.sentToVendorAt)}</td>
                      <td className="px-2 py-1.5">{c.lead !== undefined ? `${c.lead} hari` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
