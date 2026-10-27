import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ChartCard } from "@/components/charts/ChartCard";
import { KpiCard } from "@/components/KpiCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useModel } from "@/lib/useModel";
import { exportToCsv } from "@/lib/export-csv";
import { useAssetLink } from "@/lib/useAssetLink";
import type { DataIssue } from "@/domain/types";

const SEVERITY_COLOR: Record<DataIssue["severity"], string> = {
  high: "var(--status-danger)",
  medium: "var(--status-warn)",
  low: "var(--status-muted)",
};

const TYPE_LABEL: Record<DataIssue["type"], string> = {
  EXPIRY_CONFLICT: "Konflik Tanggal Expire",
  MISSING_IN_REGISTRY: "Tidak Cocok Antar Sheet",
  NO_EXPIRY: "Tanpa Tanggal Expire",
  UNKNOWN_LAST_CALIBRATION: "Kalibrasi Terakhir Tak Diketahui",
  EXPIRED_BUT_IN_USE: "Expired Tapi Dipakai",
  INVALID_RANGE: "Rentang Torsi Tidak Valid",
  DUPLICATE_ID_USAGE: "ID Dipakai >1 Unit",
  MISSING_PERIOD: "Periode Hilang",
  EMPTY_RESULTS: "Hasil Kosong",
  UNMAPPED_VALUE: "Nilai Tidak Dikenali",
  INVALID_ID: "ID Tidak Valid",
};

export function DataQuality() {
  const model = useModel();
  const openAsset = useAssetLink();
  const [severityFilter, setSeverityFilter] = useState<DataIssue["severity"] | "ALL">("ALL");

  const issues = model?.issues ?? [];
  const filtered = useMemo(
    () => (severityFilter === "ALL" ? issues : issues.filter((i) => i.severity === severityFilter)),
    [issues, severityFilter],
  );

  const byType = useMemo(() => {
    const map = new Map<DataIssue["type"], number>();
    for (const i of issues) map.set(i.type, (map.get(i.type) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [issues]);

  if (!model) return null;

  const counts = {
    high: issues.filter((i) => i.severity === "high").length,
    medium: issues.filter((i) => i.severity === "medium").length,
    low: issues.filter((i) => i.severity === "low").length,
  };

  return (
    <div>
      <PageHeader
        overline="Di Mana Masalah Berulang?"
        title="Kualitas Data"
        description="Daftar temuan yang perlu diperbaiki di berkas Excel. Setiap baris bisa langsung ditindaklanjuti."
      />
      <div className="flex flex-col gap-5 p-5">
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Severity Tinggi" value={counts.high} tone="danger" onClick={() => setSeverityFilter("high")} />
          <KpiCard label="Severity Sedang" value={counts.medium} tone="urgent" onClick={() => setSeverityFilter("medium")} />
          <KpiCard label="Severity Rendah" value={counts.low} onClick={() => setSeverityFilter("low")} />
        </div>

        <ChartCard question="Jenis masalah apa yang paling banyak?" empty={byType.length === 0}>
          <div className="flex flex-col gap-2">
            {byType.map(([type, count]) => {
              const max = Math.max(...byType.map((b) => b[1]), 1);
              return (
                <div key={type}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{TYPE_LABEL[type]}</span>
                    <span className="font-mono">{count}</span>
                  </div>
                  <div className="h-5 overflow-hidden rounded bg-muted">
                    <div className="h-full rounded bg-primary" style={{ width: `${(count / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>

        <ChartCard question="Daftar temuan" subtitle={`${filtered.length} temuan ditampilkan.`} empty={filtered.length === 0}>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex gap-1">
              {(["ALL", "high", "medium", "low"] as const).map((s) => (
                <Button
                  key={s}
                  variant={severityFilter === s ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSeverityFilter(s)}
                >
                  {s === "ALL" ? "Semua" : s === "high" ? "Tinggi" : s === "medium" ? "Sedang" : "Rendah"}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportToCsv(
                  "kualitas-data",
                  filtered.map((i) => ({
                    Severity: i.severity,
                    Jenis: TYPE_LABEL[i.type],
                    Aset: i.assetId ?? "",
                    Sumber: i.source,
                    Pesan: i.message,
                  })),
                )
              }
            >
              <Download className="size-4" /> CSV
            </Button>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Severity</th>
                  <th className="px-3 py-2 font-medium">Jenis</th>
                  <th className="px-3 py-2 font-medium">Aset</th>
                  <th className="px-3 py-2 font-medium">Sumber</th>
                  <th className="px-3 py-2 font-medium">Pesan</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => (
                  <tr key={i.id} className="border-t">
                    <td className="px-3 py-2">
                      <Badge variant="outline" style={{ color: SEVERITY_COLOR[i.severity], borderColor: SEVERITY_COLOR[i.severity] }}>
                        {i.severity}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">{TYPE_LABEL[i.type]}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {i.assetId ? (
                        <button className="hover:underline" onClick={() => openAsset(i.assetId!)}>{i.assetId}</button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{i.source}</td>
                    <td className="px-3 py-2">{i.message}</td>
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
