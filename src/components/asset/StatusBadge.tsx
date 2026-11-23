import { CheckCircle2, AlertTriangle, Clock, XCircle, HelpCircle } from "lucide-react";
import type { Asset, ComplianceStatus } from "@/domain/types";
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
  asset,
  className,
}: {
  status: ComplianceStatus;
  torque?: boolean;
  /** When given, status-driven expiry (rev1) shows "Perlu Kalibrasi" / "Di Vendor" instead of "Expired". */
  asset?: Pick<Asset, "complianceReason" | "calibrationStatus">;
  className?: string;
}) {
  const Icon = ICON[status];
  let label = torque ? TORQUE_COMPLIANCE_LABEL[status] : COMPLIANCE_LABEL[status];
  if (!torque && status === "EXPIRED" && asset?.complianceReason === "STATUS") {
    label = asset.calibrationStatus === "ON_PROGRESS" ? "Di Vendor" : "Perlu Kalibrasi";
  }
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
