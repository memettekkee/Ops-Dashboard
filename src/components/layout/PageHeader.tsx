import type { ReactNode } from "react";

export function PageHeader({
  overline,
  title,
  description,
  right,
}: {
  overline: string;
  title: string;
  description?: string;
  right?: ReactNode;
}) {
  return (
    <div className="grid-paper border-b">
      <div className="flex flex-col gap-1 p-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="label-tech">{overline}</div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">{title}</h2>
          {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {right}
      </div>
    </div>
  );
}
