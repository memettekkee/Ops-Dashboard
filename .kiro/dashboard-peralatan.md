---
inclusion: always
---

# Steering — Dashboard Kontrol Peralatan BRC

Dokumen ini adalah sumber kebenaran untuk project ini. Ikuti seluruh isinya. Kalau ada konflik antara asumsi kamu dan dokumen ini, ikuti dokumen ini. Kalau ada hal yang tidak diatur di sini, pilih opsi paling sederhana yang konsisten dengan prinsip di Bagian 1, lalu tulis asumsinya di `docs/ASSUMPTIONS.md`.

---

## 1. Tujuan produk

Web frontend (tanpa backend) yang membaca 3 file Excel pengelolaan peralatan workshop BRC, lalu menampilkannya sebagai dashboard interaktif untuk **Manager Operasional**.

Dashboard harus menjawab 3 pertanyaan ini, dan setiap halaman/chart wajib melayani minimal salah satunya:

1. **Hari ini, alat mana yang aman dipakai dan mana yang tidak?** (safety & compliance)
2. **1–3 bulan ke depan, apa yang harus disiapkan?** (sertifikasi/kalibrasi yang akan expire, PR/PO, vendor)
3. **Di mana masalahnya berulang?** (alat sering gagal, data bolong, bay kekurangan alat)

Prinsip UX:
- **Jawaban dulu, detail kemudian.** Setiap halaman dibuka dengan angka/kesimpulan, lalu chart, lalu tabel detail.
- **Setiap angka bisa diklik** menuju daftar alat di baliknya (drill-down).
- **Warna selalu bermakna dan selalu didampingi label/ikon** (jangan mengandalkan warna saja).
- Bahasa UI: **Bahasa Indonesia**. Istilah teknis yang lazim di workshop (RFU, PR, PO, SWL, Bay) tetap dipakai apa adanya.
- Target pengguna bukan orang IT. Tidak boleh ada istilah teknis aplikasi (JSON, parse, state, dsb.) di UI.

Bukan tujuan (non-goals) versi ini:
- Tidak ada backend, login, atau database server.
- Tidak menulis balik ke Excel. Export hanya CSV dari tabel.
- Tidak ada fitur edit data di aplikasi.

---

## 2. Tech stack (wajib)

| Kebutuhan | Pilihan |
|---|---|
| Build | **Vite + React 18/19 + TypeScript** (`strict: true`) |
| Styling & komponen | **Tailwind CSS v4 + shadcn/ui** (`npx shadcn@latest init`, style `new-york`, base color `neutral`, CSS variables aktif) |
| Chart | **shadcn Chart** (`npx shadcn@latest add chart`, berbasis Recharts). Jangan pakai library chart lain kecuali untuk kasus di Bagian 8 yang memang tidak bisa dibuat dengan Recharts |
| Tabel | **TanStack Table v8** mengikuti pola *Data Table* shadcn |
| Animasi | **motion** (`import { motion } from "motion/react"`) |
| Baca Excel | **SheetJS** — install dari CDN resmi SheetJS (`npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`), **bukan** paket `xlsx` lama di npm |
| State global (filter) | **Zustand**, disinkronkan ke URL query params supaya tampilan bisa dibagikan via link |
| Routing | **React Router** |
| Tanggal | **date-fns** (locale `id`) |
| Ikon | **lucide-react** |
| Persist file upload | **idb-keyval** (IndexedDB) |
| Test | **Vitest** |

Komponen shadcn yang kemungkinan dipakai: `card, button, badge, tabs, table, sheet, dialog, command, select, popover, calendar, toggle-group, tooltip, separator, skeleton, sidebar, chart, dropdown-menu, sonner, scroll-area, progress`.

---

## 3. Sumber data

Taruh 3 file Excel di `public/data/` dengan nama tetap berikut (rename dari nama aslinya):

| Nama di project | File asli | Isi |
|---|---|---|
| `sertifikasi-peralatan.xlsx` | `DATA SCHEDULE SERTIFIKASI PERALATAN.xlsx` | Master + sertifikasi alat angkat/peralatan, plus sheet `ALAT UKUR` (kalibrasi eksternal alat ukur) |
| `verifikasi-alat-ukur.xlsx` | `DATA VERIFKASI MEASUREMENT BRC (alat ukur).xlsx` | Verifikasi bulanan internal alat ukur |
| `kalibrasi-torque-wrench.xlsx` | `KALIBRASI TORQUE WRENCH 2026.xlsx` | Pengecekan bulanan torque wrench (5 pembacaan per alat) |

Alur data:
1. Saat aplikasi dibuka, cek IndexedDB. Kalau ada file hasil upload user, pakai itu. Kalau tidak, `fetch` dari `public/data/`.
2. Parse di **Web Worker** (`src/workers/parse.worker.ts`) supaya UI tidak freeze.
3. Hasil parse → normalisasi → model domain (Bagian 5) → disimpan di store.
4. Tombol **"Perbarui Data"** di top bar membuka dialog drag-and-drop. User boleh mengunggah 1–3 file. Jenis file dideteksi dari **nama sheet** di dalamnya, bukan dari nama file:
   - ada sheet `RAW DATA` dan `ALAT UKUR` → file sertifikasi
   - ada sheet berawalan nama bulan dan header `ID ON SITE` → file verifikasi
   - ada header `Torque result` → file torque
   File yang diunggah disimpan ke IndexedDB. Tampilkan toast ringkasan ("86 alat ukur, 30 torque wrench terbaca, 12 peringatan data").
5. Tampilkan di top bar: **"Data per: <tanggal file/unggahan>"** dan tombol "Kembalikan ke data bawaan".

**Tanggal acuan** semua perhitungan (sisa hari, expired, dsb.) = hari ini (`new Date()`), bukan kolom "Days before Exp. Date" di Excel. Kolom itu adalah snapshot lama dan **harus diabaikan**.

---

## 4. Aturan parsing per file (paling penting — baca teliti)

Aturan umum untuk semua sheet:
- **Cari baris header berdasarkan teks**, jangan hardcode nomor baris/kolom. Posisi kolom berbeda antar sheet (contoh: di `Januari 2026` kolom ID ada di F, di `OCT 2026` ada di E).
- Bandingkan header dengan normalisasi: trim, uppercase, gabungkan whitespace/newline jadi satu spasi.
- Sel kosong, `"-"`, `"0"` pada kolom teks (lokasi, vendor) = `null`.
- Berhenti membaca saat menemukan baris tanda tangan/footer (lihat per sheet) atau 3 baris kosong berturut-turut.
- Setiap anomali **jangan diperbaiki diam-diam**. Catat sebagai `DataIssue` (Bagian 5) supaya muncul di halaman Kualitas Data.

### 4.1 Normalisasi ID aset (`normalizeAssetId`)
- Uppercase, trim, hapus spasi di sekitar tanda hubung: `"BRC - TW - 02"` → `"BRC-TW-02"`.
- **Jangan** menambah/menghapus nol di depan angka. `BRC-ST-05` dan `BRC-ST-077` adalah **dua aset berbeda**:
  - `BRC-ST-0x` / `BRC-ST-1x` (2 digit) = **Stand Jack** (alat angkat, file sertifikasi).
  - `BRC-ST-0xx`/`BRC-ST-xxx` (3 digit) = **Special Tool / alat ukur**.
- **Jebakan:** `BRC-TW-01..03` di file sertifikasi adalah **TABLE WORK**, bukan torque wrench. Torque wrench memakai prefix `TW-BRC-...`. Jangan pernah menggabungkan keduanya.
- ID `"?"` atau ID kosong → lewati baris dan catat `DataIssue`.

### 4.2 File `sertifikasi-peralatan.xlsx`

Sheet yang dipakai: `RAW DATA`, `DATA`, `ALAT UKUR`.
Sheet yang **diabaikan**: `PVT`, `Sheet1`, `Sheet3`, `Sheet4`, `OLD` (isinya pivot, rekap lama, atau monitoring 2025).

**Sheet `RAW DATA`** — sumber utama sertifikasi alat angkat/peralatan. Header di baris 1. Pakai kolom A–Q saja; kolom S–T adalah sisa pivot, abaikan.

| Header | Field | Catatan |
|---|---|---|
| `Item no. / Asset No.` | `id` | normalisasi |
| `Category` | `category` | trim, uppercase |
| `SWL Capacity (Ton)` | `swlTon` | number, boleh null |
| `Location` | `location` | normalisasi lokasi (4.5) |
| `Last Insp. Date` | `lastInspection` | Date |
| `Certification No.` | `certificateNo` | |
| `Expired Date` | `expiryDate` | Date |
| `Vendor` | `vendor` | |
| `Days after...` / `Days before...` | — | **abaikan**, hitung ulang |
| `Exp. Date Remarks` | — | abaikan, hitung ulang |
| `Inspection Remarks` | `processStage` | nilai: `1. Certified`, `2. Need Inspect`, `4. Prepare for Certification` |
| `Actual Condition` | `actualCondition` | contoh `GOOD`, boleh kosong |
| `Remark` | `remark` | |
| `Last PR/PO` | `lastPrPo` | simpan sebagai string |

**Sheet `DATA`** — pelengkap (brand, status fisik, PR/PO). Header di baris 1.

| Header | Field | Catatan |
|---|---|---|
| `KODE ASET` | `id` | Kalau kosong **dan** `DESCRIPTION` cocok pola ID (`^[A-Z]{2,5}-`), pakai `DESCRIPTION` sebagai ID |
| `DESCRIPTION` | `name` | |
| `CATEGORY` | `category` | |
| `SWL (TON)` / `SIZE / KAPASITAS` | `swlTon` / `size` | |
| `MASA BERLAKU` | `expiryDateAlt` | dipakai hanya untuk deteksi konflik |
| `STATUS` | `registryStatus` | `AKTIF` / `EXPIRED` / `SCRAP` |
| `LAST INSPECTION`, `RENCANA PEMERIKSAAN` | Date | |
| `LAST PR`, `LAST PO` | string | |
| `LOKASI` | `location` | |
| `BRAND` | `brand` | |
| `REMARK` | `remark` | `BREAKDOWN` → kondisi Breakdown; `AKTUAL TIDAK ADA` → kondisi Hilang |

Aturan penggabungan `RAW DATA` + `DATA` (join pada `id`):
- `RAW DATA` adalah sumber utama tanggal sertifikasi. `DATA` mengisi field yang kosong (brand, nama, PR/PO, status).
- Kalau `Expired Date` (RAW) ≠ `MASA BERLAKU` (DATA) → pakai RAW, catat `DataIssue` jenis `EXPIRY_CONFLICT` (saat ini ada ±23 kasus).
- Aset yang hanya ada di salah satu sheet tetap dimasukkan, dengan `DataIssue` jenis `MISSING_IN_REGISTRY`.

**Sheet `ALAT UKUR`** — kalibrasi eksternal alat ukur. Header di baris 1, data mulai baris 3 (baris 2 kosong). Kolom A adalah duplikat nama, abaikan.

| Header | Field |
|---|---|
| `ID ASSET` | `id` |
| `Nama Alat ukur` | `name` |
| `BRAND` | `brand` |
| `EXPIRE DATE` | `calibrationExpiry` |
| `QTY`, `PO`, `Vendor` | `qty`, `po`, `vendor` |
| `Submit To Vendor`, `Supply from Vendor` | `sentToVendorAt`, `returnedFromVendorAt` (Date) |
| `Status` | `poStatus`: `OPEN` / `CLOSE` |
| `Tahap` | `batch` (1–4) |
| `Sertifikat`, `Keterangan` | `certificateNote`, `remark` |

### 4.3 File `verifikasi-alat-ukur.xlsx`

- Sheet bulanan: nama berupa `<Bulan> <Tahun>`, campuran Indonesia/Inggris (`Januari 2026`, `Februari 2026`, `Maret 2026`, `April 2026`, `OCT 2026`). Buat mapper bulan yang menerima nama Indonesia, Inggris, dan singkatan 3 huruf.
- Sheet `Kalibrasi 2026` adalah rencana tahap kalibrasi (matriks TAHAP 1–7). **Abaikan di versi ini.**
- Header ditemukan dengan mencari baris yang mengandung `ID ON SITE` (biasanya baris 4). Kolom dipetakan via teks header:

| Header (dinormalisasi) | Field |
|---|---|
| `ID ON SITE` | `assetId` |
| `NAMA ALAT UKUR` | `name` |
| `BRAND` | `brand` |
| `DATE INPECTION` (typo asli, terima juga `DATE INSPECTION`) | `checkedAt` |
| diawali `RESULT` | `resultRaw` |
| `REMAK` / `REMARKS` | `remark` |
| `LAST CALIBRATION` (hanya ada di sheet terbaru) | `lastCalibration` (Date, atau `null` bila `UNKNOWN`) |
| `TANGGAL BST KE LOGISTIK` | `handoverToLogisticsAt` |

- Footer berupa baris nama tanda tangan (mis. `Dani Oktariyanto`, `A Kusminto`): berhenti saat kolom ID kosong.
- Mapping `resultRaw` → `VerificationResult`:

| Raw | Enum | Label UI |
|---|---|---|
| `OK`, `OKE` | `OK` | OK |
| `NOT OK`, `NOT OKE` | `NOT_OK` | Tidak OK |
| `PREPARE FOR CALIBRATION` | `DUE_CALIBRATION` | Perlu Kalibrasi |
| `TEMPORARY FOR BACK UP` | `BACKUP` | Cadangan |
| `SEND TO VENDOR` | `AT_VENDOR` | Di Vendor |
| `REPLACE` | `REPLACE` | Perlu Diganti |
| `MISSING` | `MISSING` | Hilang |
| kosong | `NO_DATA` | Belum Dicek |
| lainnya | `UNKNOWN` + `DataIssue` | — |

- Anomali yang diketahui:
  - Sheet `April 2026` tidak punya hasil dan tanggalnya sama dengan Februari → tampilkan bulan itu sebagai "Belum Dicek" dan catat `DataIssue`.
  - Bulan Mei–September tidak ada di file → tampilkan sebagai **celah** di chart (jangan diinterpolasi), plus `DataIssue` jenis `MISSING_PERIOD`.

### 4.4 File `kalibrasi-torque-wrench.xlsx`

- Satu sheet per bulan (`JUNE 2026`, `JULY 2026`, `AUGUST 2026`, `SEPTEMBER 2026`, `OKTOBER 2026`).
- Header di baris yang mengandung `Torque result` (baris 3). Kolom:

| Kolom | Header | Field |
|---|---|---|
| A | (label kelas ukuran, mis. `TORQUEWRENCH 14KG \135NM`) | abaikan; nominal diambil dari ID |
| B | (ID alat) | `rawLabel` |
| C | `Pset name` | `unitLabel` (mis. `Power tool`, `Power tool NO. 1 TR`, `Power tool RATCHET 3/4"`) |
| D | `Result date and time` | `checkedAt` |
| E | `Min. torque` | `min` |
| F | `Max. torque` | `max` |
| G | `Torque result` | `value` |
| H | `Overall status` | `overallStatus` |
| I | `Torque status` | `torqueStatus` |
| J | `Detailed status` | `detailStatus` |
| K | `Detailed status` (kedua) | abaikan (label ukuran drive) |

- Berhenti saat kolom C berisi `Inspect by`. Nama di baris-baris sesudahnya = pemeriksa (`inspectedBy`) dan pengecek (`checkedBy`) bulan itu.
- **Parsing label ID kolom B**:
  - Base ID = label tanpa semua bagian dalam kurung, di-trim: `TW-BRC-201-68NM (BAY 1)` → `TW-BRC-201-68NM`; `TW-BRC-ST-228 (400NM) (TR)` → `TW-BRC-ST-228`.
  - Nominal Nm: dari akhiran `-68NM` / `-135NM` / `-300NM`, atau dari kurung `(400NM)` / `(1250NM)`.
  - Lokasi: isi kurung yang **bukan** kapasitas Nm. `BAY 1`…`BAY 12`, `TR` (= Tool Room), `TEST BENT PT` (= Test Bench PT), `DYNO TEST`. Normalisasi spasi (`BAY 7 ` → `BAY 7`).
- **Grouping pembacaan**: satu sesi cek = baris berurutan dengan base ID yang sama. Sesi baru dimulai saat label kolom B mengandung kurung lokasi **atau** `unitLabel` berubah ke `NO. 1`/`NO. 2`. Normalnya 5 pembacaan per sesi.
  - Satu base ID bisa muncul di >1 sesi per bulan (mis. `TW-BRC-200` "NO. 1" dan "NO. 2"; `TW-BRC-223` di TEST BENT PT dan TR). Simpan sebagai sesi terpisah dan catat `DataIssue` jenis `DUPLICATE_ID_USAGE` ("1 ID dipakai >1 unit fisik").
  - Lokasi sebuah alat bisa berubah antar bulan (mis. TW-BRC-208 BAY 8 → BAY 9). Simpan riwayat lokasinya.
- **Parsing angka**: bisa number atau string; string bisa pakai koma desimal dan spasi (`'65,43'`, `'67,72    '`, `'70.20'`). `'-'` atau kosong = `null`.
- **Parsing tanggal**: bisa Date asli, atau string format **D/M/YYYY** dengan jam bertitik: `'5/8/2026 10.40'` (= 5 Agustus), `'01/09/2026 10.50 A.M'`. Jangan pernah parse sebagai M/D. `'-'` = null.
- Mapping status: `OK` → `OK`; `NOT OKE`/`NOT OK` → `NOT_OK`; `-`/kosong → `NO_DATA`. `detailStatus`: `RFU`, `REPAIR`, `DONT` (= jangan dipakai), `-`.
- Anomali yang diketahui:
  - `TW-BRC-205-68NM`: di beberapa bulan `min = max = 75` (seharusnya 58–75 seperti unit 68 Nm lain). **Jangan dikoreksi otomatis.** Tandai sesi itu `rangeInvalid`, keluarkan dari perhitungan pass/fail, catat `DataIssue` jenis `INVALID_RANGE`.
  - `TW-BRC-ST-228 (400NM)`: NOT OK di Juli, berstatus REPAIR Agustus–Oktober.
  - `TW-BRC-200`: beberapa sesi tanpa pembacaan.

### 4.5 Normalisasi lokasi
Buat tabel mapping di `src/config/locations.ts` (case-insensitive, trim). Minimal:
- `STRORAGE REPAIR` → `Storage Repair`
- `DISASSY BAY 1`, `DISASSEMBLY BAY 1` → `Disassembly Bay 1`
- `TR` → `Tool Room`; `TEST BENT PT` / `TEST BENCH PT` → `Test Bench PT`
- `ASSEMBLY (BAY 4)` → `Assembly Bay 4`
- `0`, `-`, kosong → `null` (label UI: "Lokasi belum diisi")
- Selain itu: Title Case.

Lokasi juga dikelompokkan ke **area**: `Tool Room`, `Assembly`, `Disassembly`, `Test Bench`, `Storage/WIP`, `Interport`, `Lainnya`. Area dipakai untuk filter dan chart supaya tidak terlalu banyak kategori.

---

## 5. Model domain (TypeScript)

Simpan di `src/domain/types.ts`. Semua UI hanya membaca model ini, tidak pernah membaca baris Excel mentah.

```ts
export type ControlType = "LIFTING" | "MEASURING" | "TORQUE";
// LIFTING   = Sertifikasi Alat Angkat & Peralatan (file sertifikasi: RAW DATA + DATA)
// MEASURING = Kalibrasi & Verifikasi Alat Ukur (sheet ALAT UKUR + file verifikasi)
// TORQUE    = Torque Wrench (file torque)

export type ComplianceStatus =
  | "VALID"        // masih berlaku > 60 hari
  | "DUE_60"       // berlaku 31–60 hari lagi
  | "DUE_30"       // berlaku 0–30 hari lagi
  | "EXPIRED"      // sudah lewat
  | "UNKNOWN";     // tanggal tidak ada

export type PhysicalCondition = "ACTIVE" | "BREAKDOWN" | "REPAIR" | "MISSING" | "SCRAP" | "BACKUP" | "UNKNOWN";

export interface Asset {
  id: string;
  name: string;
  controlType: ControlType;
  category: string;            // mis. "STAND JACK", "MICRO METER", "TORQUE WRENCH 135 NM"
  brand?: string;
  location?: string;
  area?: string;
  capacityLabel?: string;      // "2.5 Ton" / "0–25 mm" / "135 Nm"
  vendor?: string;
  expiryDate?: Date;           // sertifikat/kalibrasi
  expiryIsEstimated?: boolean; // true bila dihitung dari lastCalibration + interval
  lastInspection?: Date;
  compliance: ComplianceStatus;
  daysToExpiry?: number;
  condition: PhysicalCondition;
  lastCheck?: { date?: Date; result: string; period: string }; // verifikasi/cek torque terakhir
  usable: UsableVerdict;
  sources: string[];           // mis. ["RAW DATA", "DATA"]
}

export type UsableVerdict =
  | { ok: true }
  | { ok: false; reasons: string[] }; // contoh: ["Sertifikat expired 21 Mar 2026", "Verifikasi terakhir: Perlu Kalibrasi"]

export interface CertificationRecord { assetId: string; certificateNo?: string; lastInspection?: Date; expiryDate?: Date; vendor?: string; processStage?: string; prPo?: string; }
export interface MeasuringCalibration { assetId: string; expiryDate?: Date; vendor?: string; po?: string; poStatus?: "OPEN" | "CLOSE"; sentToVendorAt?: Date; returnedFromVendorAt?: Date; batch?: number; remark?: string; }
export interface VerificationRecord { assetId: string; period: string /* "2026-10" */; checkedAt?: Date; result: VerificationResult; remark?: string; lastCalibration?: Date | null; }
export interface TorqueSession { assetId: string; period: string; sessionIndex: number; location?: string; unitLabel?: string; checkedAt?: Date; nominalNm?: number; min?: number; max?: number; readings: (number | null)[]; overall: "OK" | "NOT_OK" | "NO_DATA"; detailStatus?: string; rangeInvalid: boolean; inspectedBy?: string; }

export interface DataIssue {
  id: string;
  severity: "high" | "medium" | "low";
  type: "EXPIRY_CONFLICT" | "MISSING_IN_REGISTRY" | "NO_EXPIRY" | "UNKNOWN_LAST_CALIBRATION" | "EXPIRED_BUT_IN_USE"
      | "INVALID_RANGE" | "DUPLICATE_ID_USAGE" | "MISSING_PERIOD" | "EMPTY_RESULTS" | "UNMAPPED_VALUE" | "INVALID_ID";
  assetId?: string;
  source: string;      // "sertifikasi-peralatan.xlsx › RAW DATA › baris 34"
  message: string;     // kalimat Bahasa Indonesia yang bisa dipahami admin
}
```

### 5.1 Aturan turunan (di `src/domain/rules.ts`, semuanya pure function dan diuji)

- `daysToExpiry = differenceInCalendarDays(expiryDate, today)`
- `compliance`: `<0` EXPIRED, `0–30` DUE_30, `31–60` DUE_60, `>60` VALID, tanpa tanggal UNKNOWN. Ambang 30/60 diletakkan di `src/config/thresholds.ts`.
- **Alat ukur**: `expiryDate` dari sheet `ALAT UKUR`. Kalau tidak ada, pakai `lastCalibration` terakhir + `CALIBRATION_INTERVAL_MONTHS` (default 12, di config) dan set `expiryIsEstimated = true`. Di UI tampilkan dengan label "estimasi". Kalau keduanya tidak ada → UNKNOWN.
- **Torque wrench**: tidak punya expire date. `compliance` dihitung dari sesi terbaru:
  - semua pembacaan dalam min–max dan overall OK → VALID
  - ada NOT_OK / REPAIR / DONT → EXPIRED (label UI: "Tidak Lolos")
  - tidak ada pembacaan → UNKNOWN
  - cek terakhir > 35 hari lalu → DUE_30 (label UI: "Cek bulanan terlewat")
- **`usable` (Boleh Dipakai?)**: `ok` hanya bila compliance ∈ {VALID, DUE_60, DUE_30} **dan** condition = ACTIVE **dan** hasil cek terakhir OK/RFU. Selain itu `ok: false` dengan daftar alasan yang jelas.
- **`EXPIRED_BUT_IN_USE`** (severity high): compliance EXPIRED tetapi cek lapangan terakhir OK/RFU. Ini temuan safety paling penting; tampilkan di halaman Ringkasan.
- **Deviasi torque**: `target = (min + max) / 2`; `deviationPct = (mean(readings) − target) / target × 100`; `marginPct` = jarak pembacaan terdekat ke batas min/max, dalam % rentang. Alat dengan `marginPct < 10%` selama 2 bulan berturut-turut → flag **"Mulai drift"**.
- **Lead time vendor** (alat ukur): `returnedFromVendorAt − sentToVendorAt` dalam hari.

---

## 6. Struktur folder

```
src/
  app/            # router, layout, providers
  pages/          # Overview, Planning, Lifting, Measuring, Torque, DataQuality
  components/
    ui/           # hasil shadcn (jangan diedit manual kecuali perlu)
    charts/       # wrapper chart yang dipakai ulang
    filters/      # GlobalFilterBar, FilterChips
    asset/        # AssetPassportSheet, StatusBadge, UsableBadge
    layout/       # AppSidebar, TopBar, CommandSearch
  domain/         # types.ts, rules.ts, selectors.ts (agregasi untuk chart)
  parsers/        # sertifikasi.ts, verifikasi.ts, torque.ts, shared.ts (date/number/id/location)
  workers/        # parse.worker.ts
  store/          # useDataStore.ts, useFilterStore.ts
  config/         # thresholds.ts, locations.ts, statusMaps.ts
  lib/            # format.ts (tanggal & angka Indonesia), export-csv.ts
tests/            # parser & rules tests memakai file asli di public/data
```

---

## 7. Layout & navigasi

- **Sidebar kiri** (shadcn `sidebar`, bisa diciutkan jadi ikon): Ringkasan · Perencanaan · Alat Angkat · Alat Ukur · Torque Wrench · Kualitas Data.
- **Top bar**: judul halaman, `GlobalFilterBar`, kotak pencarian (⌘K / Ctrl+K), "Data per …", tombol "Perbarui Data", toggle tema terang/gelap.
- **Pencarian ⌘K** (shadcn `command`): ketik ID atau nama alat → buka **Asset Passport**.
- **Asset Passport** (shadcn `sheet` dari kanan, bisa dibuka dari mana saja via `?asset=ID`):
  - Header: ID (font mono, besar), nama, badge jenis kontrol, **badge besar "Boleh Dipakai" / "Jangan Dipakai"** beserta alasannya.
  - Info: kategori, kapasitas, lokasi, brand, vendor, sertifikat, PR/PO.
  - **Timeline riwayat**: inspeksi/sertifikasi, verifikasi bulanan, sesi torque (dengan mini chart pembacaan vs min/max).
  - Daftar `DataIssue` untuk aset ini.
- Responsif: desktop (utama), tablet (dipakai di workshop), mobile (sidebar jadi `sheet`, tabel jadi kartu).

---

## 8. Halaman & isi

Semua halaman menghormati filter global. Setiap kartu/batang/irisan chart bisa diklik → menerapkan filter atau membuka daftar aset terkait.

### 8.1 Ringkasan (`/`)
- **Baris KPI** (kartu besar, angka count-up): Total Aset · % Compliant · Expired · Jatuh Tempo ≤30 hari · Repair/Hilang · **"Expired tapi masih dipakai"** (kartu merah, hanya muncul bila > 0).
- **Expiry Runway** (elemen signature halaman): strip horizontal 12 bulan ke depan, setiap aset jadi titik di tanggal expire-nya, dikelompokkan per jenis kontrol. Hover = tooltip aset, klik = Asset Passport. Bagian "hari ini" ditandai garis vertikal; area yang sudah lewat diberi warna bahaya.
- **Donut**: komposisi status compliance (maksimal 5 irisan, total di tengah).
- **Bar horizontal**: % compliant per area, diurutkan dari yang terburuk.
- **Tabel "Perlu Tindakan"**: aset EXPIRED / DUE_30 / Tidak Lolos / Expired tapi dipakai, diurutkan dari paling mendesak. Kolom: ID, nama, jenis, lokasi, status, sisa hari, alasan, PR/PO.

### 8.2 Perencanaan (`/perencanaan`)
- **Stacked column per bulan (12 bulan ke depan)**: jumlah aset yang expire, dipecah per jenis kontrol. Bulan dengan beban tertinggi diberi anotasi.
- **Pipeline proses** sertifikasi alat angkat (dari `processStage`): Perlu Inspeksi → Persiapan Sertifikasi → Tersertifikasi, ditampilkan sebagai bar bertahap dengan jumlah aset.
- **Alat ukur di vendor**: tabel PO OPEN + lead time; bar rata-rata lead time per vendor.
- **Kalender/heatmap mingguan** jumlah expire, untuk menjadwalkan vendor.

### 8.3 Alat Angkat (`/alat-angkat`)
- KPI: total, valid, due, expired, scrap/breakdown/hilang.
- Bar: jumlah aset per kategori, distack per compliance.
- Bar: per vendor.
- **Data table** lengkap (sorting, pencarian, pagination, pilih kolom, export CSV). Filter tambahan: kategori, SWL range, kondisi fisik.

### 8.4 Alat Ukur (`/alat-ukur`)
- KPI: total alat ukur, OK bulan terakhir, Perlu Kalibrasi, Cadangan, Hilang/Diganti, last calibration tidak diketahui.
- **Line chart**: % OK per bulan (bulan tanpa data = celah, bukan nol).
- **Heatmap aset × bulan**: sel diwarnai sesuai `VerificationResult`. Baris bisa diurutkan berdasarkan "paling sering bermasalah". Klik baris = Asset Passport. (Boleh dibuat dengan CSS grid biasa, tidak perlu Recharts.)
- Stacked bar status per bulan.
- Tabel kalibrasi eksternal (sheet `ALAT UKUR`) dengan batch/tahap, PO, vendor, status.

### 8.5 Torque Wrench (`/torque`)
- KPI: total unit, lolos bulan ini, tidak lolos/repair, "mulai drift", cek terlewat.
- **Peta Bay** (elemen signature halaman): grid tile `BAY 1…BAY 12`, `Tool Room`, `Test Bench PT`, `Dyno Test`. Setiap tile menampilkan ketersediaan per ukuran (68 / 135 / 300 / 400 / 1250 Nm) dengan indikator warna + ikon. Langsung kelihatan bay mana yang tidak punya torque wrench siap pakai untuk ukuran tertentu.
- **Control chart per alat** (pilih alat via select/command): titik pembacaan tiap bulan, garis min, max, dan target. Area di luar batas diberi warna bahaya.
- **Distribusi deviasi** per alat bulan terpilih (bar horizontal deviasi % dari target, diurutkan).
- Pass rate per bulan (line).

### 8.6 Kualitas Data (`/kualitas-data`)
- Ringkasan jumlah `DataIssue` per jenis dan severity.
- Tabel issue: severity, jenis, aset, sumber (file › sheet › baris), pesan. Bisa difilter dan diexport CSV.
- Tujuan halaman ini: memberi admin daftar kerja perbaikan Excel. Tulis pesan dalam bahasa yang bisa langsung ditindaklanjuti, mis. *"Tanggal expire BM-CS-7707 berbeda: RAW DATA 28 Sep 2027, DATA 3 Okt 2026."*

### 8.7 Aturan chart
- Pakai komponen `ChartContainer` + `ChartTooltip` dari shadcn chart. Warna diambil dari CSS variable (Bagian 9), bukan hex di komponen.
- **Pie/donut hanya untuk komposisi ≤5 kategori.** Untuk perbandingan antar kategori, pakai bar.
- Setiap chart punya: judul berupa pertanyaan atau kesimpulan (mis. "Bulan mana beban sertifikasi paling tinggi?"), subjudul satu baris, empty state, skeleton saat loading.
- Tooltip menampilkan angka + persentase + ajakan klik ("Klik untuk melihat 12 aset").
- Angka dan tanggal diformat Indonesia (`1.234`, `21 Mar 2026`).

---

## 9. Arah desain visual

Referensi rasa: situs-situs di Awwwards — tipografi berani, grid yang rapi, motion halus. **Tetapi kegunaan menang atas efek.** Ini alat kerja harian, bukan landing page.

Tema: **"Industrial Precision"** — terasa seperti lembar gambar teknik dan panel kontrol workshop.

- **Tipografi**: `Geist` untuk UI, `Geist Mono` untuk ID aset, angka di tabel, dan label teknis. Angka KPI besar (48–72px, `tabular-nums`, letter-spacing rapat). Judul halaman besar dan tegas; isi tetap 14–16px.
- **Warna dasar**: netral hangat (off-white/graphite), dengan satu aksen **safety amber**. Gunakan token oklch di `:root` dan `.dark`.
- **Token status** (wajib dipakai konsisten di badge, chart, heatmap, tile):
  - `--status-ok` hijau · `--status-warn` amber (DUE_60) · `--status-urgent` oranye (DUE_30) · `--status-danger` merah (EXPIRED/Tidak Lolos) · `--status-muted` abu (UNKNOWN/Belum Dicek) · `--status-info` biru (Di Vendor/Cadangan).
  - Daftarkan juga sebagai `--chart-*` untuk shadcn chart.
- **Detail khas**: garis grid tipis ala kertas milimeter di latar header halaman, label kecil uppercase dengan letter-spacing lebar (gaya label teknik), border 1px tegas, radius kecil (6–8px).
- **Motion** (pakai `motion/react`):
  - Angka KPI count-up saat pertama tampil.
  - Kartu & chart muncul bertahap (stagger 40–60ms) **hanya saat load pertama**, bukan setiap ganti filter.
  - Saat filter berubah: transisi layout halus (`layout` prop), bukan animasi ulang dari nol.
  - Hover pada baris/titik/tile: highlight dan elemen lain sedikit diredupkan.
  - Durasi ≤ 400ms, easing lembut. **Hormati `prefers-reduced-motion`** (matikan semua animasi non-esensial).
  - **Dilarang**: scroll hijacking, custom cursor, smooth-scroll library, parallax, animasi loop yang terus berjalan.
- Dark mode penuh, default mengikuti sistem.

---

## 10. Filter global

Disimpan di `useFilterStore` (Zustand) dan disinkronkan ke URL (`?type=LIFTING&area=Assembly&status=DUE_30`).

| Filter | Komponen | Nilai |
|---|---|---|
| Jenis kontrol | toggle-group | Semua / Alat Angkat / Alat Ukur / Torque |
| Periode | select bulan + rentang | untuk data bulanan (verifikasi & torque) |
| Area / Lokasi | multi-select (popover + command) | dari data |
| Kategori | multi-select | dari data |
| Vendor | multi-select | dari data |
| Status compliance | multi-select | 5 status |
| Boleh dipakai | toggle | Semua / Ya / Tidak |

- Filter aktif tampil sebagai chip yang bisa dihapus satu per satu, plus tombol "Reset".
- Filter yang tidak relevan untuk halaman tertentu disembunyikan (mis. SWL hanya di Alat Angkat).
- Jumlah hasil selalu terlihat ("Menampilkan 42 dari 389 aset").

---

## 11. Kualitas kode

- TypeScript strict, tanpa `any`. Parser mengembalikan `{ data, issues }`.
- Parser & rules adalah **pure function** dan dites dengan Vitest memakai file asli di `public/data/`. Test minimal:
  - jumlah aset per sumber dan jumlah ID yang cocok antar file (cek kasar: RAW DATA ±273 ID unik, DATA ±242, keduanya ±235; sheet ALAT UKUR ±52 ID; verifikasi Oktober ±86 alat; torque 30 base ID × 5 bulan)
  - `BRC-TW-01` **tidak** terklasifikasi sebagai torque wrench
  - `BRC-ST-05` dan `BRC-ST-077` tetap dua aset berbeda
  - tanggal `'5/8/2026 10.40'` → 5 Agustus 2026
  - angka `'67,72    '` → 67.72
  - `TW-BRC-205` terdeteksi `rangeInvalid`
  - `TW-BRC-ST-228` berstatus Tidak Lolos sejak Juli 2026
  Kalau hasil hitung berbeda jauh dari angka kasar di atas, laporkan ke user, jangan menyesuaikan test supaya lulus.
- Agregasi untuk chart diletakkan di `domain/selectors.ts` dan di-memoize. Komponen chart hanya menerima data siap pakai.
- Aksesibilitas: semua elemen interaktif bisa dijangkau keyboard, focus ring terlihat, kontras teks AA, chart punya `aria-label` ringkasan, status tidak hanya dibedakan lewat warna.
- Tanpa console error/warning saat `npm run build` dan `npm run test`.

---

## 12. Urutan pengerjaan

Kerjakan bertahap. Setelah tiap fase, jalankan test/build dan beri ringkasan singkat ke user.

1. **Setup**: Vite + TS + Tailwind v4 + shadcn + dependensi. Pindahkan & rename 3 file Excel ke `public/data/`. Tema & token warna.
2. **Parser + domain + test** (Bagian 4–5, 11). Belum ada UI selain halaman debug sederhana yang menampilkan jumlah data & issues. **Jangan lanjut ke UI sebelum test parser lulus.**
3. **Layout**: sidebar, top bar, filter global + sinkron URL, pencarian ⌘K, Asset Passport.
4. **Halaman Ringkasan**, lalu Perencanaan.
5. **Halaman Alat Angkat, Alat Ukur, Torque Wrench.**
6. **Kualitas Data**, dialog "Perbarui Data" + IndexedDB, export CSV.
7. **Polish**: motion, dark mode, responsif tablet/mobile, empty & loading state, aksesibilitas, `README.md` cara menjalankan dan cara memperbarui data.
