import { useMemo } from "react";
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
import { verificationByMonth, verificationHeatmap } from "@/domain/selectors";
import { VERIFICATION_LABEL, VERIFICATION_TOKEN } from "@/config/statusMaps";
import { formatMonthID } from "@/lib/format";
import { useAssetLink } from "@/lib/useAssetLink";
import type { VerificationResult } from "@/domain/types";

export function Measuring() {
  const assets = useFilteredAssets("MEASURING");
  const model = useModel();
  const openAsset = useAssetLink();

  const line = useMemo(() => (model ? verificationByMonth(model) : []), [model]);
  const heatmap = useMemo(() => (model ? verificationHeatmap(model) : { periods: [], rows: [] }), [model]);

  if (!model) return null;

  const latestPeriod = line.length ? line[line.length - 1].period : null;
  const okLatest = latestPeriod
    ? model.verifications.filter((v) => v.period === latestPeriod && v.result === "OK").length
    : 0;
  const dueCal = latestPeriod
    ? model.verifications.filter((v) => v.period === latestPeriod && v.result === "DUE_CALIBRATION").length
    : 0;
  const backup = model.verifications.filter((v) => v.result === "BACKUP").length;
  const missingReplace = model.verifications.filter((v) => v.result === "MISSING" || v.result === "REPLACE").length;
  const unknownCal = model.issues.filter((i) => i.type === "UNKNOWN_LAST_CALIBRATION").length;

  return (
    <div>
      <PageHeader
        overline="Kalibrasi & Verifikasi Alat Ukur"
        title="Alat Ukur"
        description="Hasil verifikasi bulanan internal dan kalibrasi eksternal alat ukur."
      />
      <div className="flex flex-col gap-5 p-5">
        <GlobalFilterBar hide={["vendor"]} />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <KpiCard label="Total Alat Ukur" value={assets.length} />
          <KpiCard label="OK Bulan Terakhir" value={okLatest} tone="ok" />
          <KpiCard label="Perlu Kalibrasi" value={dueCal} tone="urgent" />
          <KpiCard label="Cadangan" value={backup} />
          <KpiCard label="Hilang/Diganti" value={missingReplace} tone="danger" />
          <KpiCard label="Kalibrasi Tak Diketahui" value={unknownCal} />
        </div>

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
                            title={`${row.assetId} · ${formatMonthID(p)}: ${VERIFICATION_LABEL[r]}`}
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
