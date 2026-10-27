import { ShieldCheck, ShieldAlert } from "lucide-react";
import type { UsableVerdict } from "@/domain/types";
import { cn } from "@/lib/utils";

export function UsableBadge({ usable, large = false }: { usable: UsableVerdict; large?: boolean }) {
  const ok = usable.ok;
  const color = ok ? "var(--status-ok)" : "var(--status-danger)";
  const Icon = ok ? ShieldCheck : ShieldAlert;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border font-semibold",
        large ? "px-3 py-1.5 text-sm" : "px-2 py-0.5 text-xs",
      )}
      style={{ color, borderColor: color, backgroundColor: `color-mix(in oklch, ${color} 14%, transparent)` }}
    >
      <Icon className={large ? "size-5" : "size-3.5"} aria-hidden />
      {ok ? "Boleh Dipakai" : "Jangan Dipakai"}
    </span>
  );
}
