import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/misc";
import { useDataStore } from "@/store/useDataStore";
import { UsableBadge } from "./UsableBadge";
import { StatusBadge } from "./StatusBadge";
import { formatDateID, formatMonthID } from "@/lib/format";
import { VERIFICATION_LABEL } from "@/config/statusMaps";
import { torqueDeviation } from "@/domain/rules";
import type { Asset } from "@/domain/types";

export function AssetPassportSheet() {
  const [params, setParams] = useSearchParams();
  const assetId = params.get("asset");
  const model = useDataStore((s) => s.model);

  const asset = useMemo(
    () => model?.assets.find((a) => a.id === assetId),
    [model, assetId],
  );

  const close = () => {
    const next = new URLSearchParams(params);
    next.delete("asset");
    setParams(next, { replace: true });
  };

  return (
    <Sheet open={!!assetId} onOpenChange={(o) => !o && close()}>
      <SheetContent className="overflow-y-auto">
        <SheetTitle className="sr-only">Detail aset {assetId}</SheetTitle>
        <SheetDescription className="sr-only">Paspor aset dengan status dan riwayat.</SheetDescription>
        {asset ? (
          <AssetDetail asset={asset} />
        ) : (
          <div className="pt-10 text-sm text-muted-foreground">
            Aset <span className="font-mono">{assetId}</span> tidak ditemukan.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="label-tech">{label}</span>
      <span className="text-sm">{value ?? "—"}</span>
    </div>
  );
}

function AssetDetail({ asset }: { asset: Asset }) {
  const model = useDataStore((s) => s.model);
  const typeLabel =
    asset.controlType === "LIFTING"
      ? "Alat Angkat"
      : asset.controlType === "MEASURING"
        ? "Alat Ukur"
        : "Torque Wrench";

  const verifications = (model?.verifications ?? [])
    .filter((v) => v.assetId === asset.id)
    .sort((a, b) => b.period.localeCompare(a.period));
  const torqueSessions = (model?.torqueSessions ?? [])
    .filter((s) => s.assetId === asset.id)
    .sort((a, b) => b.period.localeCompare(a.period) || b.sessionIndex - a.sessionIndex);
  const issues = (model?.issues ?? []).filter((i) => i.assetId === asset.id);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="font-mono text-2xl font-bold tracking-tight">{asset.id}</div>
        <div className="text-sm text-muted-foreground">{asset.name}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-tech rounded border px-2 py-0.5">{typeLabel}</span>
        <StatusBadge status={asset.compliance} torque={asset.controlType === "TORQUE"} />
      </div>
      <UsableBadge usable={asset.usable} large />
      {!asset.usable.ok && (
        <ul className="list-inside list-disc text-sm text-muted-foreground">
          {asset.usable.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}

      <Separator />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Kategori" value={asset.category} />
        <Field label="Kapasitas" value={asset.capacityLabel} />
        <Field label="Lokasi" value={asset.location ?? "Lokasi belum diisi"} />
        <Field label="Brand" value={asset.brand} />
        <Field label="Vendor" value={asset.vendor} />
        <Field
          label="Expire"
          value={
            asset.expiryDate
              ? `${formatDateID(asset.expiryDate)}${asset.expiryIsEstimated ? " (estimasi)" : ""}`
              : undefined
          }
        />
        <Field label="Inspeksi Terakhir" value={formatDateID(asset.lastInspection)} />
        <Field label="PR/PO" value={asset.prPo} />
      </div>

      {verifications.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="label-tech mb-2">Riwayat Verifikasi</h3>
            <div className="flex flex-col gap-1">
              {verifications.map((v) => (
                <div key={v.period} className="flex items-center justify-between text-sm">
                  <span>{formatMonthID(v.period)}</span>
                  <span>{VERIFICATION_LABEL[v.result]}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {torqueSessions.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="label-tech mb-2">Sesi Torque</h3>
            <div className="flex flex-col gap-3">
              {torqueSessions.map((s, i) => {
                const dev = torqueDeviation(s);
                return (
                  <div key={i} className="rounded-md border p-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span>{formatMonthID(s.period)}{s.location ? ` · ${s.location}` : ""}</span>
                      <span>{s.overall}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Rentang {s.min ?? "?"}–{s.max ?? "?"} Nm
                      {dev.deviationPct !== undefined ? ` · deviasi ${dev.deviationPct.toFixed(1)}%` : ""}
                    </div>
                    <ReadingBar session={s} />
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {issues.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="label-tech mb-2">Catatan Data</h3>
            <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
              {issues.map((i) => (
                <li key={i.id}>• {i.message}</li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function ReadingBar({ session }: { session: { readings: (number | null)[]; min?: number; max?: number } }) {
  if (session.min === undefined || session.max === undefined) return null;
  const lo = session.min;
  const hi = session.max;
  const span = hi - lo || 1;
  const pad = span * 0.3;
  const axisLo = lo - pad;
  const axisHi = hi + pad;
  const axisSpan = axisHi - axisLo;
  return (
    <div className="relative mt-2 h-6 rounded bg-muted">
      <div
        className="absolute inset-y-0 rounded"
        style={{
          left: `${((lo - axisLo) / axisSpan) * 100}%`,
          width: `${(span / axisSpan) * 100}%`,
          backgroundColor: "color-mix(in oklch, var(--status-ok) 25%, transparent)",
        }}
      />
      {session.readings
        .filter((r): r is number => r !== null)
        .map((r, i) => {
          const inRange = r >= lo && r <= hi;
          return (
            <div
              key={i}
              className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${((r - axisLo) / axisSpan) * 100}%`,
                backgroundColor: inRange ? "var(--status-ok)" : "var(--status-danger)",
              }}
              title={`${r} Nm`}
            />
          );
        })}
    </div>
  );
}
