import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
} from "recharts";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlobalFilterBar } from "@/components/filters/GlobalFilterBar";
import { KpiCard } from "@/components/KpiCard";
import { ChartCard } from "@/components/charts/ChartCard";
import { ExpiryRunway } from "@/components/charts/ExpiryRunway";
import { StatusBadge } from "@/components/asset/StatusBadge";
import { useFilteredAssets, useModel, useToday } from "@/lib/useModel";
import { useFilterStore } from "@/store/useFilterStore";
import { useAssetLink } from "@/lib/useAssetLink";
import {
  kpiSummary,
  complianceComposition,
  compliancePerArea,
  actionItems,
} from "@/domain/selectors";
import { COMPLIANCE_LABEL, COMPLIANCE_TOKEN } from "@/config/statusMaps";
import { formatDays } from "@/lib/format";

export function Overview() {
  const assets = useFilteredAssets();
  const model = useModel();
  const today = useToday();
  const openAsset = useAssetLink();
  const toggleStatus = useFilterStore((s) => s.toggleStatus);

  const kpi = useMemo(() => kpiSummary(assets), [assets]);
  const composition = useMemo(() => complianceComposition(assets), [assets]);
  const perArea = useMemo(() => compliancePerArea(assets), [assets]);
  const actions = useMemo(() => actionItems(assets).slice(0, 25), [assets]);

  if (!model) return null;

  return (
    <div>
      <PageHeader
        overline="Safety & Compliance"
        title="Hari ini, alat mana yang aman dipakai?"
        description="Ringkasan kondisi seluruh peralatan workshop berdasarkan tanggal hari ini."
      />
      <div className="flex flex-col gap-5 p-5">
        <GlobalFilterBar />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="Total Aset" value={kpi.total} />
          <KpiCard label="Compliant" value={kpi.compliantPct} suffix="%" tone="ok" />
          <KpiCard label="Expired" value={kpi.expired} tone="danger" onClick={() => toggleStatus("EXPIRED")} />
          <KpiCard label="Jatuh Tempo ≤30 hari" value={kpi.due30} tone="urgent" onClick={() => toggleStatus("DUE_30")} />
          <KpiCard label="Repair / Hilang" value={kpi.repairMissing} />
          {kpi.expiredInUse > 0 && (
            <KpiCard
              label="Expired tapi dipakai"
              value={kpi.expiredInUse}
              tone="danger"
              hint="Temuan safety paling penting"
            />
          )}
        </div>

        <ChartCard
          question="Kapan sertifikat & kalibrasi akan expire?"
          subtitle="Setiap titik adalah satu aset. Garis merah = hari ini. Klik titik untuk detail."
          empty={assets.length === 0}
        >
          <ExpiryRunway assets={assets} today={today} onSelect={openAsset} />
        </ChartCard>

        <div className="grid gap-5 lg:grid-cols-2">
          <ChartCard question="Bagaimana komposisi status compliance?" empty={composition.length === 0}>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={composition}
                  dataKey="count"
                  nameKey="status"
                  innerRadius={64}
                  outerRadius={100}
                  paddingAngle={2}
                >
                  {composition.map((d) => (
                    <Cell key={d.status} fill={COMPLIANCE_TOKEN[d.status]} />
                  ))}
                </Pie>
                <RTooltip
                  formatter={(value: number, _n, p) => [
                    `${value} aset`,
                    COMPLIANCE_LABEL[(p.payload as { status: keyof typeof COMPLIANCE_LABEL }).status],
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs">
              {composition.map((d) => (
                <span key={d.status} className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm" style={{ backgroundColor: COMPLIANCE_TOKEN[d.status] }} />
                  {COMPLIANCE_LABEL[d.status]} ({d.count})
                </span>
              ))}
            </div>
          </ChartCard>

          <ChartCard
            question="Area mana yang paling bermasalah?"
            subtitle="Persentase alat compliant per area, diurutkan dari terburuk."
            empty={perArea.length === 0}
          >
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={perArea} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} fontSize={12} />
                <YAxis type="category" dataKey="area" width={110} fontSize={12} />
                <RTooltip formatter={(v: number) => [`${v}% compliant`, "Area"]} />
                <Bar dataKey="pct" radius={4}>
                  {perArea.map((d) => (
                    <Cell
                      key={d.area}
                      fill={d.pct >= 80 ? "var(--status-ok)" : d.pct >= 50 ? "var(--status-warn)" : "var(--status-danger)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ChartCard
          question="Apa yang perlu ditindaklanjuti sekarang?"
          subtitle={`${actions.length} alat paling mendesak.`}
          empty={actions.length === 0}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">Nama</th>
                  <th className="px-3 py-2 font-medium">Lokasi</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Sisa</th>
                  <th className="px-3 py-2 font-medium">Alasan</th>
                  <th className="px-3 py-2 font-medium">PR/PO</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((a) => (
                  <tr key={a.id} className="cursor-pointer border-t hover:bg-accent/10" onClick={() => openAsset(a.id)}>
                    <td className="px-3 py-2 font-mono text-xs">{a.id}</td>
                    <td className="px-3 py-2">{a.name}</td>
                    <td className="px-3 py-2">{a.location ?? "—"}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={a.compliance} torque={a.controlType === "TORQUE"} />
                    </td>
                    <td className="px-3 py-2">{formatDays(a.daysToExpiry)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {a.usable.ok ? "—" : a.usable.reasons.join("; ")}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{a.prPo ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
