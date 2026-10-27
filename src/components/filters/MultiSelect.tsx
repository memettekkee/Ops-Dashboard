import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export function MultiSelect({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Filter ${label}`}
        >
          {label}
          {selected.length > 0 && (
            <span className="rounded bg-primary px-1.5 text-xs text-primary-foreground">{selected.length}</span>
          )}
          <ChevronDown className="size-4 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        <Command>
          <CommandInput placeholder={`Cari ${label.toLowerCase()}…`} />
          <CommandList>
            <CommandEmpty>Tidak ada pilihan.</CommandEmpty>
            {options.map((opt) => (
              <CommandItem key={opt} value={opt} onSelect={() => onToggle(opt)}>
                <div
                  className={cn(
                    "flex size-4 items-center justify-center rounded border",
                    selected.includes(opt) ? "bg-primary text-primary-foreground" : "opacity-50",
                  )}
                >
                  {selected.includes(opt) && <Check className="size-3" />}
                </div>
                <span className="truncate">{opt}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
