import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
} from "recharts";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlobalFilterBar } from "@/components/filters/GlobalFilterBar";
import { ChartCard } from "@/components/charts/ChartCard";
import { KpiCard } from "@/components/KpiCard";
import { useFilteredAssets, useModel } from "@/lib/useModel";
import {
  categoryStatusCounts,
  isV2Period,
  measuringPeriods,
  recordStatus,
  statusTransitions,
  vendorGroups,
  verificationByMonth,
  verificationHeatmap,
} from "@/domain/selectors";
import { CALIBRATION_STATUS_LABEL, VERIFICATION_LABEL, VERIFICATION_TOKEN } from "@/config/statusMaps";
import { MEASURING_CATEGORIES } from "@/config/categories";
import { MultiSelect } from "@/components/filters/MultiSelect";
import { CategoryStatusBars, TransitionMatrix, VendorPanel } from "@/components/measuring/StatusPanels";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CalibrationStatus } from "@/domain/types";
import { formatMonthID } from "@/lib/format";
import { useAssetLink } from "@/lib/useAssetLink";
import type { VerificationResult } from "@/domain/types";

export function Measuring() {
  const globalAssets = useFilteredAssets("MEASURING");
  const model = useModel();
  const [cats, setCats] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<CalibrationStatus[]>([]);
  const [onlyNew, setOnlyNew] = useState(false);
  const [periodSel, setPeriodSel] = useState<string | null>(null);
  const [fromSel, setFromSel] = useState<string | null>(null);
  const [toSel, setToSel] = useState<string | null>(null);
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const assets = useMemo(
    () =>
      globalAssets.filter(
        (a) =>
          (cats.length === 0 || cats.includes(a.measuringCategory ?? "Lainnya")) &&
          (statuses.length === 0 || (a.calibrationStatus && statuses.includes(a.calibrationStatus))) &&
          (!onlyNew || a.isNewThisPeriod),
      ),
    [globalAssets, cats, statuses, onlyNew],
  );
  const periods = useMemo(() => (model ? measuringPeriods(model) : []), [model]);
  const openAsset = useAssetLink();

  const line = useMemo(() => (model ? verificationByMonth(model) : []), [model]);
  const heatmap = useMemo(() => (model ? verificationHeatmap(model) : { periods: [], rows: [] }), [model]);

  if (!model) return null;

  const latestPeriod = line.length ? line[line.length - 1].period : null;
  const period = periodSel ?? latestPeriod;
  const v2 = !!period && isV2Period(model, period);
  const assetIds = new Set(assets.map((x) => x.id));
  const inPeriod = model.verifications.filter((v) => v.period === period && assetIds.has(v.assetId));
  const countStatus = (st: CalibrationStatus) => inPeriod.filter((v) => recordStatus(v) === st).length;
  const okLatest = inPeriod.filter((v) => v.result === "OK").length;
  const dueCal = inPeriod.filter((v) => v.result === "DUE_CALIBRATION").length;
  const backup = model.verifications.filter((v) => v.result === "BACKUP").length;
  const missingReplace = model.verifications.filter((v) => v.result === "MISSING" || v.result === "REPLACE").length;
  const unknownCal = model.issues.filter((i) => i.type === "UNKNOWN_LAST_CALIBRATION").length;
  const newCount = assets.filter((x) => x.isNewThisPeriod).length;
  const v2Periods = new Set(periods.filter((p) => isV2Period(model, p)));
  const matrixTo = toSel ?? periods[periods.length - 1];
  const matrixFrom = fromSel ?? periods[periods.length - 2] ?? periods[0];
  const transitions = periods.length >= 2 && matrixFrom && matrixTo ? statusTransitions(model, matrixFrom, matrixTo) : null;
  const categoryData = categoryStatusCounts(assets.filter((x) => x.calibrationStatus));
  const vendor = vendorGroups(assets);
  return (
    <div>
      <PageHeader
        overline="Kalibrasi & Verifikasi Alat Ukur"
        title="Alat Ukur"
        description="Hasil verifikasi bulanan internal dan kalibrasi eksternal alat ukur."
      />
      <div className="flex flex-col gap-5 p-5">
        <GlobalFilterBar hide={["vendor", "category"]} />
        <div className="flex flex-wrap items-center gap-2">
          <MultiSelect
            label="Kategori Alat Ukur"
            options={MEASURING_CATEGORIES}
            selected={cats}
            onToggle={(v) => setCats((c) => toggle(c, v))}
          />
          <MultiSelect
            label="Status Kalibrasi"
            options={Object.keys(CALIBRATION_STATUS_LABEL).filter((k) => k !== "UNKNOWN")}
            selected={statuses}
            onToggle={(v) => setStatuses((c) => toggle(c, v as CalibrationStatus))}
          />
          <label className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm">
            <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
            Hanya alat baru
          </label>
          {periods.length > 1 && (
            <Select value={period ?? ""} onValueChange={(v) => setPeriodSel(v)}>
              <SelectTrigger className="w-40" aria-label="Periode KPI">
                <SelectValue placeholder="Periode" />
              </SelectTrigger>
              <SelectContent>
                {[...periods].reverse().map((p) => (
                  <SelectItem key={p} value={p}>{formatMonthID(p)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {v2 ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <KpiCard label="Total Alat Ukur" value={inPeriod.length} />
            <KpiCard label="Terkalibrasi" value={countStatus("CALIBRATED")} tone="ok" />
            <KpiCard label="Perlu Kalibrasi" value={countStatus("NEED_CALIBRATION")} tone="urgent" />
            <KpiCard label="Proses di Vendor" value={countStatus("ON_PROGRESS")} />
            <KpiCard label="Rusak" value={countStatus("DAMAGE")} tone="danger" />
            <KpiCard label="Alat Baru" value={newCount} hint={newCount > 0 ? "BARU" : undefined} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <KpiCard label="Total Alat Ukur" value={assets.length} />
            <KpiCard label="OK Bulan Terakhir" value={okLatest} tone="ok" />
            <KpiCard label="Perlu Kalibrasi" value={dueCal} tone="urgent" />
            <KpiCard label="Cadangan" value={backup} />
            <KpiCard label="Hilang/Diganti" value={missingReplace} tone="danger" />
            <KpiCard label="Kalibrasi Tak Diketahui" value={unknownCal} />
          </div>
        )}
        {categoryData.length > 0 && (
          <ChartCard
            question="Kategori alat ukur mana yang paling banyak perlu kalibrasi?"
            subtitle="Status terbaru per kategori."
          >
            <CategoryStatusBars data={categoryData} />
          </ChartCard>
        )}
        {transitions && (
          <ChartCard
            question="Status alat berubah ke mana antar periode?"
            subtitle="Baris = status periode lama, kolom = status periode baru. Klik sel untuk melihat alatnya."
          >
            <div className="mb-3 flex items-center gap-2 text-sm">
              <Select value={matrixFrom} onValueChange={setFromSel}>
                <SelectTrigger className="w-36" aria-label="Periode awal"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {periods.map((p) => <SelectItem key={p} value={p}>{formatMonthID(p)}</SelectItem>)}
                </SelectContent>
              </Select>
              →
              <Select value={matrixTo} onValueChange={setToSel}>
                <SelectTrigger className="w-36" aria-label="Periode akhir"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {periods.map((p) => <SelectItem key={p} value={p}>{formatMonthID(p)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <TransitionMatrix from={matrixFrom} to={matrixTo} data={transitions} />
          </ChartCard>
        )}
        {vendor.length > 0 && (
          <ChartCard question="Sedang di Vendor" subtitle="Alat dalam proses kalibrasi, dikelompokkan per nomor PO.">
            <VendorPanel groups={vendor} />
          </ChartCard>
        )}
        <ChartCard
          question="Bagaimana tren % OK per bulan?"
          subtitle="Bulan tanpa data ditampilkan sebagai celah, bukan nol."
          empty={line.length === 0}
        >
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={line.map((d) => ({ ...d, label: formatMonthID(d.period) }))}>
              <XAxis dataKey="label" fontSize={12} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} fontSize={12} />
              <RTooltip formatter={(v) => [v === null || v === undefined ? "Tidak ada data" : `${v}% OK`, ""]} />
              <Line
                type="monotone"
                dataKey="okPct"
                stroke="var(--status-ok)"
                strokeWidth={2}
                connectNulls={false}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          question="Alat mana yang paling sering bermasalah?"
          subtitle="Setiap sel = hasil verifikasi per bulan. Baris diurutkan dari yang paling sering bermasalah. Klik untuk detail."
          empty={heatmap.rows.length === 0}
        >
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-card px-2 py-1 text-left font-medium">Alat</th>
                  {heatmap.periods.map((p) => (
                    <th key={p} className="px-1 py-1 font-medium">{formatMonthID(p)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmap.rows.slice(0, 60).map((row) => (
                  <tr key={row.assetId} className="cursor-pointer hover:bg-accent/10" onClick={() => openAsset(row.assetId)}>
                    <td className="sticky left-0 bg-card px-2 py-1 font-mono">{row.assetId}</td>
                    {heatmap.periods.map((p) => {
                      const r: VerificationResult = row.cells[p] ?? "NO_DATA";
                      return (
                        <td key={p} className="p-0.5">
                          <div
                            className="size-5 rounded-sm"
                            style={{ backgroundColor: VERIFICATION_TOKEN[r] }}
                            title={`${row.assetId} · ${formatMonthID(p)}: ${VERIFICATION_LABEL[r]}${v2Periods.has(p) ? " (format baru)" : ""}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            {(["OK", "NOT_OK", "DUE_CALIBRATION", "BACKUP", "MISSING", "NO_DATA"] as VerificationResult[]).map((r) => (
              <span key={r} className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-sm" style={{ backgroundColor: VERIFICATION_TOKEN[r] }} />
                {VERIFICATION_LABEL[r]}
              </span>
            ))}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
