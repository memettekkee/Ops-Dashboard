import { Moon, Sun, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { CommandSearch } from "./CommandSearch";
import { UpdateDataDialog } from "./UpdateDataDialog";
import { MobileNav } from "./MobileNav";
import { useDataStore } from "@/store/useDataStore";
import { useThemeStore } from "@/store/useTheme";

export function TopBar({ title }: { title: string }) {
  const { dataAsOf, source, resetToDefault } = useDataStore();
  const { theme, setTheme } = useThemeStore();

  const asOf = dataAsOf ? format(new Date(dataAsOf), "d MMM yyyy HH:mm", { locale: idLocale }) : "—";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
      <MobileNav />
      <h1 className="text-lg font-bold tracking-tight">{title}</h1>
      <div className="ml-auto flex items-center gap-2">
        <div className="hidden text-right text-xs text-muted-foreground lg:block">
          <div>Data per: {asOf}</div>
          {source === "uploaded" && (
            <button onClick={() => void resetToDefault()} className="inline-flex items-center gap-1 hover:text-foreground">
              <RotateCcw className="size-3" /> Kembalikan ke data bawaan
            </button>
          )}
        </div>
        <CommandSearch />
        <UpdateDataDialog />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Ganti tema"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="size-4 dark:hidden" />
          <Moon className="hidden size-4 dark:block" />
        </Button>
      </div>
    </header>
  );
}
