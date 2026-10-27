import { useMemo } from "react";
import { X } from "lucide-react";
import { useFilterStore } from "@/store/useFilterStore";
import { useDataStore } from "@/store/useDataStore";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MultiSelect } from "./MultiSelect";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { COMPLIANCE_LABEL } from "@/config/statusMaps";
import type { ComplianceStatus, ControlType } from "@/domain/types";

const STATUS_OPTIONS: ComplianceStatus[] = ["VALID", "DUE_60", "DUE_30", "EXPIRED", "UNKNOWN"];

export function GlobalFilterBar({ hide = [] }: { hide?: ("vendor" | "category" | "usable")[] }) {
  const model = useDataStore((s) => s.model);
  const f = useFilterStore();

  const { areas, categories, vendors } = useMemo(() => {
    const assets = model?.assets ?? [];
    return {
      areas: [...new Set(assets.map((a) => a.area).filter(Boolean) as string[])].sort(),
      categories: [...new Set(assets.map((a) => a.category))].sort(),
      vendors: [...new Set(assets.map((a) => a.vendor).filter(Boolean) as string[])].sort(),
    };
  }, [model]);

  const hasActive =
    f.type !== "ALL" ||
    f.areas.length > 0 ||
    f.categories.length > 0 ||
    f.vendors.length > 0 ||
    f.statuses.length > 0 ||
    f.usable !== "ALL";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          value={f.type}
          onValueChange={(v) => v && f.setType(v as ControlType | "ALL")}
        >
          <ToggleGroupItem value="ALL">Semua</ToggleGroupItem>
          <ToggleGroupItem value="LIFTING">Alat Angkat</ToggleGroupItem>
          <ToggleGroupItem value="MEASURING">Alat Ukur</ToggleGroupItem>
          <ToggleGroupItem value="TORQUE">Torque</ToggleGroupItem>
        </ToggleGroup>

        <MultiSelect label="Area" options={areas} selected={f.areas} onToggle={f.toggleArea} />
        {!hide.includes("category") && (
          <MultiSelect label="Kategori" options={categories} selected={f.categories} onToggle={f.toggleCategory} />
        )}
        {!hide.includes("vendor") && (
          <MultiSelect label="Vendor" options={vendors} selected={f.vendors} onToggle={f.toggleVendor} />
        )}
        <MultiSelect
          label="Status"
          options={STATUS_OPTIONS}
          selected={f.statuses}
          onToggle={(v) => f.toggleStatus(v as ComplianceStatus)}
        />
        {!hide.includes("usable") && (
          <ToggleGroup
            type="single"
            value={f.usable}
            onValueChange={(v) => v && f.setUsable(v as "ALL" | "YES" | "NO")}
          >
            <ToggleGroupItem value="ALL">Semua</ToggleGroupItem>
            <ToggleGroupItem value="YES">Boleh Dipakai</ToggleGroupItem>
            <ToggleGroupItem value="NO">Jangan</ToggleGroupItem>
          </ToggleGroup>
        )}

        {hasActive && (
          <Button variant="ghost" size="sm" onClick={f.reset}>
            <X className="size-4" /> Reset
          </Button>
        )}
      </div>

      {hasActive && (
        <div className="flex flex-wrap items-center gap-1.5">
          {f.type !== "ALL" && <Chip label={`Jenis: ${f.type}`} onClear={() => f.setType("ALL")} />}
          {f.areas.map((a) => (
            <Chip key={a} label={a} onClear={() => f.toggleArea(a)} />
          ))}
          {f.categories.map((c) => (
            <Chip key={c} label={c} onClear={() => f.toggleCategory(c)} />
          ))}
          {f.vendors.map((v) => (
            <Chip key={v} label={v} onClear={() => f.toggleVendor(v)} />
          ))}
          {f.statuses.map((s) => (
            <Chip key={s} label={COMPLIANCE_LABEL[s]} onClear={() => f.toggleStatus(s)} />
          ))}
          {f.usable !== "ALL" && (
            <Chip label={f.usable === "YES" ? "Boleh Dipakai" : "Jangan Dipakai"} onClear={() => f.setUsable("ALL")} />
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <Badge variant="outline" className="gap-1 pr-1">
      {label}
      <button onClick={onClear} className="rounded-sm hover:bg-muted" aria-label={`Hapus filter ${label}`}>
        <X className="size-3" />
      </button>
    </Badge>
  );
}
