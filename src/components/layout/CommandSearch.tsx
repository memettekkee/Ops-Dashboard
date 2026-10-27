import { useEffect, useState } from "react";
import { CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useDataStore } from "@/store/useDataStore";
import { useAssetLink } from "@/lib/useAssetLink";

export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const model = useDataStore((s) => s.model);
  const openAsset = useAssetLink();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground hover:bg-accent/20"
      >
        Cari alat…
        <kbd className="rounded border bg-muted px-1 font-mono text-xs">⌘K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Ketik ID atau nama alat…" />
        <CommandList>
          <CommandEmpty>Tidak ditemukan.</CommandEmpty>
          {(model?.assets ?? []).slice(0, 400).map((a) => (
            <CommandItem
              key={a.id}
              value={`${a.id} ${a.name}`}
              onSelect={() => {
                openAsset(a.id);
                setOpen(false);
              }}
            >
              <span className="font-mono text-xs">{a.id}</span>
              <span className="truncate text-muted-foreground">{a.name}</span>
            </CommandItem>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
