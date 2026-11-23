import { useState } from "react";
import { Trash2, UploadCloud } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/store/useDataStore";

export function UpdateDataDialog() {
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const uploadFiles = useDataStore((s) => s.uploadFiles);
  const loading = useDataStore((s) => s.loading);
  const files = useDataStore((s) => s.files);
  const removeFile = useDataStore((s) => s.removeFile);
  const error = useDataStore((s) => s.error);
  const KIND_LABEL = { sertifikasi: "Sertifikasi", verifikasi: "Verifikasi", torque: "Torque", unknown: "?" } as const;
  const periodText = (periods?: string[]) =>
    periods && periods.length
      ? periods
          .map((p) => {
            const [y, m] = p.split("-").map(Number);
            return format(new Date(y, m - 1, 1), "MMM yy", { locale: idLocale });
          })
          .join(", ")
      : "";
  // sertifikasi / torque: only the last file of the kind is in effect.
  const activeFiles = files.filter(
    (f, i) => f.kind === "verifikasi" || (f.kind !== "unknown" && files.map((g) => g.kind).lastIndexOf(f.kind) === i),
  );

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    await uploadFiles(Array.from(files));
    if (!useDataStore.getState().error) setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UploadCloud className="size-4" /> Perbarui Data
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Perbarui Data Excel</DialogTitle>
          <DialogDescription>
            Seret berkas Excel ke sini. Jenis berkas dikenali otomatis dari isinya. Berkas verifikasi ditambahkan ke yang sudah ada; berkas dengan periode yang sama dianggap lebih baru.
          </DialogDescription>
        </DialogHeader>
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void handleFiles(e.dataTransfer.files);
          }}
          className={`flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm transition-colors ${
            dragging ? "border-accent bg-accent/10" : "border-input"
          }`}
        >
          <UploadCloud className="size-8 text-muted-foreground" />
          {loading ? "Memproses…" : "Letakkan berkas di sini atau klik untuk memilih"}
          <input
            type="file"
            multiple
            accept=".xlsx"
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </label>
        {error && <p className="text-sm text-[var(--status-danger)]">{error}</p>}
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Berkas aktif</p>
          <ul className="max-h-48 space-y-1 overflow-auto text-sm">
            {activeFiles.map((f) => (
              <li key={`${f.origin}:${f.name}`} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
                <div className="min-w-0">
                  <div className="truncate">
                    {f.name.split("/").pop()} <span className="text-xs text-muted-foreground">· {KIND_LABEL[f.kind]}{f.origin === "uploaded" ? " · unggahan" : ""}</span>
                  </div>
                  {f.kind === "verifikasi" && (
                    <div className="text-xs text-muted-foreground">Periode: {periodText(f.periods) || "—"}</div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Hapus ${f.name}`}
                  disabled={loading}
                  onClick={() => void removeFile(f)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
