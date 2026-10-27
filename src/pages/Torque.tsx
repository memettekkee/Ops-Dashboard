import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  ZAxis,
} from "recharts";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlobalFilterBar } from "@/components/filters/GlobalFilterBar";
import { ChartCard } from "@/components/charts/ChartCard";
import { KpiCard } from "@/components/KpiCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useModel, useToday } from "@/lib/useModel";
import { bayMap, torqueControlSeries, torqueKpi } from "@/domain/selectors";
import { formatMonthID } from "@/lib/format";
import { useAssetLink } from "@/lib/useAssetLink";
import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";

export function Torque() {
  const model = useModel();
  const today = useToday();
  const openAsset = useAssetLink();

  const kpi = useMemo(() => (model ? torqueKpi(model, today) : null), [model, today]);
  const bays = useMemo(() => (model ? bayMap(model, today) : { bays: [], nominals: [], cells: [] }), [model, today]);
  const assetIds = useMemo(
    () => [...new Set((model?.torqueSessions ?? []).map((s) => s.assetId))].sort(),
    [model],
  );
  const [selected, setSelected] = useState<string>("");
  const activeId = selected || assetIds[0] || "";
  const series = useMemo(
    () => (model && activeId ? torqueControlSeries(model, activeId) : []),
    [model, activeId],
  );

  if (!model || !kpi) return null;

  const chartData = series.flatMap((s) =>
    s.readings
      .filter((r): r is number => r !== null)
      .map((r, i) => ({ x: `${formatMonthID(s.period)}`, value: r, idx: i, min: s.min, max: s.max, target: s.target })),
  );
  const firstWithRange = series.find((s) => s.min !== undefined);

  return (
    <div>
      <PageHeader
        overline="Pengecekan Bulanan Torque Wrench"
        title="Torque Wrench"
        description="Ketersediaan torque wrench per bay dan kestabilan pembacaan tiap alat."
      />
      <div className="flex flex-col gap-5 p-5">
        <GlobalFilterBar hide={["vendor", "category", "usable"]} />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <KpiCard label="Total Unit" value={kpi.total} />
          <KpiCard label="Lolos" value={kpi.passThisMonth} tone="ok" />
          <KpiCard label="Tidak Lolos/Repair" value={kpi.failRepair} tone="danger" />
          <KpiCard label="Mulai Drift" value={kpi.drift} tone="urgent" />
          <KpiCard label="Cek Terlewat" value={kpi.overdue} />
        </div>

        <ChartCard
          question="Bay mana yang kekurangan torque wrench siap pakai?"
          subtitle="Setiap tile menunjukkan jumlah unit siap pakai per ukuran (Nm)."
          empty={bays.bays.length === 0}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {bays.cells.map((cell) => (
              <div key={cell.bay} className="rounded-lg border p-3">
                <div className="mb-2 text-sm font-semibold">{cell.bay}</div>
                <div className="flex flex-col gap-1.5">
                  {bays.nominals.map((nm) => {
                    const slot = cell.byNominal[nm];
                    if (!slot) return null;
                    const ok = slot.ready > 0;
                    const Icon = slot.ready === slot.total ? CheckCircle2 : slot.ready > 0 ? MinusCircle : XCircle;
                    const color = slot.ready === slot.total ? "var(--status-ok)" : slot.ready > 0 ? "var(--status-warn)" : "var(--status-danger)";
                    return (
                      <div key={nm} className="flex items-center justify-between text-xs">
                        <span className="font-mono">{nm} Nm</span>
                        <span className="inline-flex items-center gap-1" style={{ color }}>
                          <Icon className="size-3.5" />
                          {slot.ready}/{slot.total}
                        </span>
                        <span className="sr-only">{ok ? "ada" : "tidak ada"} unit siap pakai</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard
          question="Apakah pembacaan sebuah alat stabil dalam batas?"
          subtitle="Pilih alat untuk melihat semua pembacaan vs rentang min–max dan target."
          empty={assetIds.length === 0}
        >
          <div className="mb-3 flex items-center gap-2">
            <Select value={activeId} onValueChange={setSelected}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Pilih alat" />
              </SelectTrigger>
              <SelectContent>
                {assetIds.map((id) => (
                  <SelectItem key={id} value={id}>{id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button className="text-sm text-muted-foreground underline-offset-2 hover:underline" onClick={() => openAsset(activeId)}>
              Buka detail
            </button>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ left: 10, bottom: 10 }}>
              <XAxis dataKey="x" type="category" fontSize={12} allowDuplicatedCategory={false} />
              <YAxis dataKey="value" type="number" fontSize={12} domain={["auto", "auto"]} unit=" Nm" />
              <ZAxis range={[60, 60]} />
              {firstWithRange?.min !== undefined && (
                <ReferenceLine y={firstWithRange.min} stroke="var(--status-danger)" strokeDasharray="4 4" label={{ value: "min", fontSize: 10 }} />
              )}
              {firstWithRange?.max !== undefined && (
                <ReferenceLine y={firstWithRange.max} stroke="var(--status-danger)" strokeDasharray="4 4" label={{ value: "max", fontSize: 10 }} />
              )}
              {firstWithRange?.target !== undefined && (
                <ReferenceLine y={firstWithRange.target} stroke="var(--status-ok)" label={{ value: "target", fontSize: 10 }} />
              )}
              <RTooltip formatter={(v: number) => [`${v} Nm`, "Pembacaan"]} />
              <Scatter data={chartData} fill="var(--chart-5)" />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard question="Bagaimana pass rate torque per bulan?" empty={series.length === 0}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={passRate(model, today)}>
              <XAxis dataKey="label" fontSize={12} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} fontSize={12} />
              <RTooltip formatter={(v: number) => [`${v}%`, "Pass rate"]} />
              <Line type="monotone" dataKey="pct" stroke="var(--status-ok)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function passRate(model: NonNullable<ReturnType<typeof useModel>>, _today: Date) {
  const byPeriod = new Map<string, { pass: number; total: number }>();
  for (const s of model.torqueSessions) {
    if (s.rangeInvalid) continue;
    const row = byPeriod.get(s.period) ?? { pass: 0, total: 0 };
    if (s.overall === "OK") row.pass++;
    if (s.overall !== "NO_DATA") row.total++;
    byPeriod.set(s.period, row);
  }
  return [...byPeriod.keys()].sort().map((period) => {
    const r = byPeriod.get(period)!;
    return { label: formatMonthID(period), pct: r.total ? Math.round((r.pass / r.total) * 100) : 0 };
  });
}
