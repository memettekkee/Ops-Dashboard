import { useState } from "react";
import { Menu } from "lucide-react";
import { NavLink } from "react-router-dom";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Ringkasan", end: true },
  { to: "/perencanaan", label: "Perencanaan" },
  { to: "/alat-angkat", label: "Alat Angkat" },
  { to: "/alat-ukur", label: "Alat Ukur" },
  { to: "/torque", label: "Torque Wrench" },
  { to: "/kualitas-data", label: "Kualitas Data" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu" onClick={() => setOpen(true)}>
        <Menu className="size-5" />
      </Button>
      <SheetContent side="left">
        <SheetTitle className="text-sm font-bold">Navigasi</SheetTitle>
        <nav className="mt-4 flex flex-col gap-1">
          {NAV.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-2 text-sm font-medium",
                  isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
