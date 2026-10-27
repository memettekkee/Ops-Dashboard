import { CheckCircle2, AlertTriangle, Clock, XCircle, HelpCircle } from "lucide-react";
import type { ComplianceStatus } from "@/domain/types";
import { COMPLIANCE_LABEL, COMPLIANCE_TOKEN, TORQUE_COMPLIANCE_LABEL } from "@/config/statusMaps";
import { cn } from "@/lib/utils";

const ICON: Record<ComplianceStatus, typeof CheckCircle2> = {
  VALID: CheckCircle2,
  DUE_60: Clock,
  DUE_30: AlertTriangle,
  EXPIRED: XCircle,
  UNKNOWN: HelpCircle,
};

export function StatusBadge({
  status,
  torque = false,
  className,
}: {
  status: ComplianceStatus;
  torque?: boolean;
  className?: string;
}) {
  const Icon = ICON[status];
  const label = torque ? TORQUE_COMPLIANCE_LABEL[status] : COMPLIANCE_LABEL[status];
  const color = COMPLIANCE_TOKEN[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
        className,
      )}
      style={{ color, borderColor: color, backgroundColor: `color-mix(in oklch, ${color} 12%, transparent)` }}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
