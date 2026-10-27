import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarClock,
  Container,
  Ruler,
  Wrench,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Ringkasan", icon: LayoutDashboard, end: true },
  { to: "/perencanaan", label: "Perencanaan", icon: CalendarClock },
  { to: "/alat-angkat", label: "Alat Angkat", icon: Container },
  { to: "/alat-ukur", label: "Alat Ukur", icon: Ruler },
  { to: "/torque", label: "Torque Wrench", icon: Wrench },
  { to: "/kualitas-data", label: "Kualitas Data", icon: Database },
];

export function AppSidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex size-8 items-center justify-center rounded bg-primary text-primary-foreground">
          <Wrench className="size-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-bold">Kontrol Peralatan</div>
          <div className="label-tech">BRC Workshop</div>
        </div>
      </div>
      <nav className="flex flex-col gap-0.5 p-2">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60",
              )
            }
          >
            <Icon className="size-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
