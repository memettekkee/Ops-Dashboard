import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, Download, Search } from "lucide-react";
import type { Asset } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/misc";
import { StatusBadge } from "@/components/asset/StatusBadge";
import { UsableBadge } from "@/components/asset/UsableBadge";
import { useAssetLink } from "@/lib/useAssetLink";
import { exportToCsv } from "@/lib/export-csv";
import { formatDateID, formatDays } from "@/lib/format";

export function AssetTable({ assets, torque = false }: { assets: Asset[]; torque?: boolean }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const openAsset = useAssetLink();

  const columns = useMemo<ColumnDef<Asset>[]>(
    () => [
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
      },
      { accessorKey: "name", header: "Nama" },
      { accessorKey: "category", header: "Kategori" },
      {
        accessorKey: "location",
        header: "Lokasi",
        cell: ({ row }) => row.original.location ?? "—",
      },
      {
        accessorKey: "compliance",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.compliance} torque={torque} />,
      },
      {
        accessorKey: "daysToExpiry",
        header: "Sisa",
        cell: ({ row }) => formatDays(row.original.daysToExpiry),
      },
      {
        id: "expiry",
        header: "Expire",
        accessorFn: (a) => a.expiryDate?.getTime() ?? 0,
        cell: ({ row }) => formatDateID(row.original.expiryDate),
      },
      {
        id: "usable",
        header: "Boleh Dipakai",
        cell: ({ row }) => <UsableBadge usable={row.original.usable} />,
      },
    ],
    [torque],
  );

  const table = useReactTable({
    data: assets,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 15 } },
  });

  const handleExport = () => {
    exportToCsv(
      "peralatan",
      assets.map((a) => ({
        ID: a.id,
        Nama: a.name,
        Jenis: a.controlType,
        Kategori: a.category,
        Lokasi: a.location ?? "",
        Status: a.compliance,
        SisaHari: a.daysToExpiry ?? "",
        Expire: a.expiryDate ? formatDateID(a.expiryDate) : "",
        BolehDipakai: a.usable.ok ? "Ya" : "Tidak",
        Alasan: a.usable.ok ? "" : a.usable.reasons.join("; "),
      })),
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cari di tabel…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Menampilkan {table.getFilteredRowModel().rows.length} alat</span>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="size-4" /> CSV
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="px-3 py-2 text-left font-medium">
                    {h.isPlaceholder ? null : (
                      <button
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={h.column.getToggleSortingHandler()}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {h.column.getCanSort() && <ArrowUpDown className="size-3 opacity-50" />}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-t hover:bg-accent/10"
                onClick={() => openAsset(row.original.id)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">
                  Tidak ada data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          Sebelumnya
        </Button>
        <span className="text-sm text-muted-foreground">
          Hal {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
        </span>
        <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          Berikutnya
        </Button>
      </div>
    </div>
  );
}
