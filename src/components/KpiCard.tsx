import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatInt } from "@/lib/format";

function useCountUp(target: number, durationMs = 700) {
  const [value, setValue] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, durationMs]);
  return value;
}

export function KpiCard({
  label,
  value,
  suffix = "",
  tone = "default",
  onClick,
  hint,
}: {
  label: string;
  value: number;
  suffix?: string;
  tone?: "default" | "danger" | "ok" | "urgent";
  onClick?: () => void;
  hint?: string;
}) {
  const display = useCountUp(value);
  const toneColor =
    tone === "danger"
      ? "var(--status-danger)"
      : tone === "ok"
        ? "var(--status-ok)"
        : tone === "urgent"
          ? "var(--status-urgent)"
          : undefined;
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card
        className={cn("p-4", onClick && "cursor-pointer transition-shadow hover:shadow-md")}
        style={tone !== "default" ? { borderColor: toneColor } : undefined}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={(e) => {
          if (onClick && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onClick();
          }
        }}
      >
        <div className="label-tech">{label}</div>
        <div
          className="mt-1 font-mono text-4xl font-bold tabular-nums tracking-tight"
          style={toneColor ? { color: toneColor } : undefined}
        >
          {formatInt(display)}
          {suffix}
        </div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </Card>
    </motion.div>
  );
}
