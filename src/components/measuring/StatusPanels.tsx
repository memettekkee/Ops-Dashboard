import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CALIBRATION_STATUS_LABEL, CALIBRATION_STATUS_TOKEN } from "@/config/statusMaps";
import { CAL_STATUS_ORDER, type StatusOrNone, type StatusTransitions, type VendorGroup } from "@/domain/selectors";
import type { Asset, CalibrationStatus } from "@/domain/types";
import { useAssetLink } from "@/lib/useAssetLink";
import { formatMonthID } from "@/lib/format";

/** Dialog listing asset ids; clicking one opens the asset passport. */
export function AssetListDialog({
  title,
  ids,
  onClose,
}: {
  title: string;
  ids: string[] | null;
  onClose: () => void;
}) {
  const openAsset = useAssetLink();
  return (
    <Dialog open={ids !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{ids?.length ?? 0} alat. Klik untuk membuka detail.</DialogDescription>
        </DialogHeader>
        <ul className="grid max-h-80 grid-cols-2 gap-1 overflow-auto text-sm">
          {(ids ?? []).map((id) => (
            <li key={id}>
              <button
                className="w-full rounded px-2 py-1 text-left font-mono hover:bg-accent/20"
                onClick={() => {
                  onClose();
                  openAsset(id);
                }}
              >
                {id}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

const statusLabel = (s: StatusOrNone) => (s === "NONE" ? "Tidak ada" : CALIBRATION_STATUS_LABEL[s]);

export function CategoryStatusBars({
  data,
}: {
  data: { category: string; total: number; counts: Record<CalibrationStatus, number> }[];
}) {
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <div className="flex flex-col gap-2">
      {data.map((d) => (
        <div key={d.category} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-2 text-xs">
          <span className="truncate">{d.category}</span>
          <div className="flex h-5 overflow-hidden rounded bg-muted" style={{ width: `${(d.total / max) * 100}%` }}>
            {CAL_STATUS_ORDER.map((s) =>
              d.counts[s] > 0 ? (
                <div
                  key={s}
                  style={{ width: `${(d.counts[s] / d.total) * 100}%`, backgroundColor: CALIBRATION_STATUS_TOKEN[s] }}
                  title={`${d.category} · ${CALIBRATION_STATUS_LABEL[s]}: ${d.counts[s]}`}
                />
              ) : null,
            )}
          </div>
          <span className="text-right font-mono tabular-nums">{d.total}</span>
        </div>
      ))}
      <div className="mt-1 flex flex-wrap gap-3 text-xs">
        {CAL_STATUS_ORDER.filter((s) => s !== "UNKNOWN").map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-sm" style={{ backgroundColor: CALIBRATION_STATUS_TOKEN[s] }} />
            {CALIBRATION_STATUS_LABEL[s]}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Rows = status in the older period, columns = status in the newer period. */
export function TransitionMatrix({
  from,
  to,
  data,
}: {
  from: string;
  to: string;
  data: StatusTransitions;
}) {
  const [picked, setPicked] = useState<{ title: string; ids: string[] } | null>(null);
  const order: StatusOrNone[] = [...CAL_STATUS_ORDER.filter((s) => s !== "UNKNOWN"), "UNKNOWN", "NONE"];
  const present = order.filter((s) =>
    [...data.cells.keys()].some((k) => k.startsWith(`${s}>`) || k.endsWith(`>${s}`)),
  );
  const max = Math.max(1, ...[...data.cells.values()].map((v) => v.length));
  return (
    <>
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left font-medium">
                {formatMonthID(from)} ↓ / {formatMonthID(to)} →
              </th>
              {present.map((s) => (
                <th key={s} className="px-2 py-1 font-medium">{statusLabel(s)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {present.map((r) => (
              <tr key={r}>
                <th className="px-2 py-1 text-left font-medium">{statusLabel(r)}</th>
                {present.map((c) => {
                  const ids = data.cells.get(`${r}>${c}`) ?? [];
                  const diagonal = r === c;
                  return (
                    <td key={c} className="p-0.5">
                      <button
                        disabled={ids.length === 0}
                        onClick={() =>
                          setPicked({ title: `${statusLabel(r)} → ${statusLabel(c)}`, ids })
                        }
                        className="h-9 w-20 rounded font-mono tabular-nums enabled:hover:ring-2 enabled:hover:ring-ring disabled:opacity-30"
                        style={{
                          backgroundColor: ids.length
                            ? `color-mix(in oklch, ${diagonal ? "var(--status-muted)" : "var(--status-urgent)"} ${Math.round(15 + (ids.length / max) * 55)}%, transparent)`
                            : undefined,
                        }}
                        aria-label={`${statusLabel(r)} ke ${statusLabel(c)}: ${ids.length} alat`}
                      >
                        {ids.length}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AssetListDialog title={picked?.title ?? ""} ids={picked?.ids ?? null} onClose={() => setPicked(null)} />
    </>
  );
}

export function VendorPanel({ groups }: { groups: VendorGroup[] }) {
  const [picked, setPicked] = useState<VendorGroup | null>(null);
  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <button
            key={g.po}
            onClick={() => setPicked(g)}
            className="rounded-lg border p-3 text-left hover:bg-accent/10"
          >
            <div className="label-tech">PO</div>
            <div className="font-mono text-sm">{g.po}</div>
            <div className="mt-1 font-mono text-2xl font-bold tabular-nums">{g.assets.length} alat</div>
          </button>
        ))}
      </div>
      <AssetListDialog
        title={picked ? `PO ${picked.po}` : ""}
        ids={picked ? picked.assets.map((a: Asset) => a.id) : null}
        onClose={() => setPicked(null)}
      />
    </>
  );
}
