import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function ChartCard({
  question,
  subtitle,
  children,
  empty,
  className,
}: {
  question: string;
  subtitle?: string;
  children: ReactNode;
  empty?: boolean;
  className?: string;
}) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={className}>
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold leading-tight">{question}</h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </CardHeader>
        <CardContent>
          {empty ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              Tidak ada data untuk filter ini.
            </div>
          ) : (
            children
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
