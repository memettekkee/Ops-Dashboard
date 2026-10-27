import { useState } from "react";
import { UploadCloud } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDataStore } from "@/store/useDataStore";

export function UpdateDataDialog() {
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const uploadFiles = useDataStore((s) => s.uploadFiles);
  const loading = useDataStore((s) => s.loading);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    await uploadFiles(Array.from(files));
    setOpen(false);
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
            Seret 1–3 berkas Excel ke sini. Jenis berkas dikenali otomatis dari isinya.
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
      </DialogContent>
    </Dialog>
  );
}
