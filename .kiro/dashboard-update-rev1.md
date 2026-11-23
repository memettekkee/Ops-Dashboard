---
inclusion: manual
---

# Steering Update rev1 — Data Verifikasi November 2026

File ini adalah **perubahan (delta)** untuk dashboard yang sudah dibangun berdasarkan `.kiro/steering/dashboard-peralatan.md`.

- Kalau ada yang bertentangan, **file ini yang menang**.
- Hal yang tidak disebut di sini tetap mengikuti `dashboard-peralatan.md`.
- **Jangan membangun ulang dari nol.** Ubah kode yang sudah ada seminimal mungkin. Semua fitur, halaman, dan test yang sudah ada harus tetap jalan.

---

## 0. Ringkasan perubahan

Admin mengirim versi baru file verifikasi: `DATA VERIFKASI MEASUREMENT BRC rev1.xlsx`. Isinya:

| Sheet | Status |
|---|---|
| `Kalibrasi 2026`, `Januari 2026`, `Februari 2026`, `Maret 2026`, `April 2026` | **Sama persis** dengan file lama |
| `OCT 2026` | **Dihapus** dari file baru (tapi datanya tetap harus ada di dashboard, lihat Bagian 1) |
| `Data` | **BARU** — hasil cek 6 Nov 2026, format kolom baru, **181 alat**: 147 alat ukur + **34 torque wrench** |
| `Summary` | **BARU** — pivot rekap status. **Jangan dipakai sebagai sumber data** (angkanya tidak cocok dengan sheet `Data`) |

Dampak utama:
1. Ada **format sheet verifikasi kedua** yang harus didukung parser, berdampingan dengan format lama.
2. Riwayat bulanan sekarang tersebar di **lebih dari satu file** (Oktober hanya ada di file lama).
3. **Torque wrench sekarang juga muncul di file verifikasi**, dengan status kalibrasi eksternal. Tapi **penomoran ID-nya bentrok** dengan file torque lama (Bagian 4).
4. Ada **62 alat ukur baru** (BRC-ST-438 s/d BRC-ST-542, mayoritas pressure gauge dan dial indicator) dan 1 alat dengan ID numerik.

---

## 1. Sumber data: verifikasi jadi multi-file

Ganti aturan Bagian 3 untuk file verifikasi:

- Simpan file verifikasi di folder `public/data/verifikasi/`:
  - `verifikasi-2026-10.xlsx` ← file lama (`DATA VERIFKASI MEASUREMENT BRC (alat ukur).xlsx`)
  - `verifikasi-2026-11.xlsx` ← file baru (`DATA VERIFKASI MEASUREMENT BRC rev1.xlsx`)
- Buat `public/data/manifest.json` berisi daftar file di folder data, supaya app tahu file apa saja yang perlu di-fetch:
  ```json
  {
    "sertifikasi": "sertifikasi-peralatan.xlsx",
    "torque": "kalibrasi-torque-wrench.xlsx",
    "verifikasi": ["verifikasi/verifikasi-2026-10.xlsx", "verifikasi/verifikasi-2026-11.xlsx"]
  }
  ```
- **Penggabungan antar file verifikasi:** semua `VerificationRecord` dari semua file digabung, lalu di-dedupe per `(assetId, period)`. Kalau periode yang sama muncul di lebih dari satu file, **file yang lebih baru menang** (urutan manifest/urutan upload). Contoh: Januari–April ada di kedua file dan isinya identik, jadi hasilnya tetap satu record per bulan.
- **Dialog "Perbarui Data":** file verifikasi yang diunggah **ditambahkan** ke koleksi, tidak menggantikan semuanya. Simpan di IndexedDB per file. Tampilkan daftar file verifikasi yang aktif + periode yang dicakup tiap file, dengan tombol hapus per file.
- **Deteksi jenis file** (update aturan lama): file dianggap file verifikasi kalau ada sheet dengan header `ID ON SITE` — baik sheet bulanan format lama **maupun** sheet bernama `Data`.

---

## 2. Parsing sheet `Data` (format baru)

Tambahkan parser baru, misalnya `src/parsers/verifikasi-v2.ts`. Parser lama tetap dipakai untuk sheet bulanan format lama. Pilih parser per sheet berdasarkan header:
- Header berisi `RESULT (GOOD / DAMAGE)` dan `STATUS` → **format v2**
- Header berisi `RESULT (OK / NOT OK)` → **format v1** (lama)

### 2.1 Struktur sheet
- Baris 1: judul. Sel B1 berisi `#VALUE!` (rumus error) → **abaikan**. Sel J1 berisi tanggal `2026-11-01` = **periode laporan**.
- Baris 2: header. Data mulai baris 3.
- **Periode** = bulan dari J1. Fallback kalau J1 kosong/invalid: bulan dari nilai `Date Inpection` yang paling sering muncul. Kalau keduanya gagal → `DataIssue` severity high dan sheet dilewati.
- **Berhenti** saat kolom A bukan angka (baris footer). Footer berisi:
  - baris dengan `Inspect by` (kolom D) dan `Checked by` (kolom G)
  - baris nama di bawahnya: D = pemeriksa 1, E = pemeriksa 2, G = pengecek.
  Simpan sebagai `inspectedBy: string[]` dan `checkedBy` untuk periode itu. **Jangan** sampai nama di kolom E (mis. `Eko Prasetyo`) terbaca sebagai ID aset.

### 2.2 Kolom

| Header (dinormalisasi) | Field | Catatan |
|---|---|---|
| `NO.` | — | dipakai hanya untuk deteksi akhir data |
| `DESCRIPTION SPECIAL TOOL` | `group` | `Measurement` atau `Torque Wrench` |
| `NAMA ALAT UKUR` | `name` | |
| `BRAND` | `brand` | normalisasi: `CATERPILAR`/`CAT` → `Caterpillar`, sisanya Title Case |
| `ID ON SITE` | `assetId` | **bisa berupa number** (`104050000878`). Konversi ke string **tanpa** notasi eksponen dan tanpa `.0` |
| `DATE INPECTION` | `checkedAt` | Date |
| diawali `RESULT` | `physicalResult` | `Good` → `GOOD`, `DAMAGE`/`Damage` → `DAMAGE` (case-insensitive) |
| `LAST CALIBRATION` | `lastCalibration` | Date; `-`/kosong → `null` |
| `STATUS` | `calibrationStatus` | lihat 2.3 |
| `REMARKS` | lihat bawah | |

**Kolom `Remarks` isinya campur.** Pisahkan:
- cocok `^\d{10}$` → `poNumber` (contoh `4010396340`)
- teks lain (contoh `Gauge`) → `note`

### 2.3 Status baru dan pemetaannya

Tambahkan di `src/config/statusMaps.ts`:

| `calibrationStatus` (raw) | Enum | Label UI | Boleh dipakai? |
|---|---|---|---|
| `Calibrated` | `CALIBRATED` | Terkalibrasi | Ya (kalau `physicalResult = GOOD`) |
| `Need Calibration` | `NEED_CALIBRATION` | Perlu Kalibrasi | Tidak |
| `On Progress` | `ON_PROGRESS` | Proses Kalibrasi (di vendor/PO) | Tidak |
| `Damage` | `DAMAGE` | Rusak | Tidak |
| lainnya | `UNKNOWN` + `DataIssue` | — | Tidak |

Supaya **tren bulanan tetap nyambung dengan format lama**, setiap record v2 juga diberi `result: VerificationResult` turunan:

| Kondisi v2 | `result` (enum lama) |
|---|---|
| `GOOD` + `CALIBRATED` | `OK` |
| `GOOD` + `NEED_CALIBRATION` | `DUE_CALIBRATION` |
| `GOOD` + `ON_PROGRESS` | `AT_VENDOR` |
| `DAMAGE` (status apa pun) | `NOT_OK` (label UI: "Rusak") |

### 2.4 Update model domain

Tambahkan field opsional ke `VerificationRecord` (jangan memecah tipe lama):

```ts
export interface VerificationRecord {
  // ...field lama tetap
  format: "v1" | "v2";
  group?: "MEASUREMENT" | "TORQUE";
  physicalResult?: "GOOD" | "DAMAGE";
  calibrationStatus?: "CALIBRATED" | "NEED_CALIBRATION" | "ON_PROGRESS" | "DAMAGE" | "UNKNOWN";
  poNumber?: string;
  note?: string;
  sourceFile: string;
}
```

### 2.5 Aturan turunan (update `rules.ts`)

- Untuk alat ukur, **status di record terbaru menentukan status alat**, mengalahkan perhitungan dari tanggal:
  - `NEED_CALIBRATION` → `compliance = EXPIRED`, label UI **"Perlu Kalibrasi"** (bukan "Expired")
  - `ON_PROGRESS` → `compliance = EXPIRED`, `condition = REPAIR`, label UI **"Di Vendor"**
  - `DAMAGE` → `condition = BREAKDOWN`, tidak boleh dipakai
  - `CALIBRATED` → compliance dihitung seperti biasa dari `lastCalibration + CALIBRATION_INTERVAL_MONTHS`
- Supaya label UI tidak bentrok dengan "Expired" biasa, tambahkan `complianceReason?: "DATE" | "STATUS"` di `Asset`. Badge/legend menampilkan label sesuai alasannya.
- **Alat baru:** alat yang pertama kali muncul di periode terbaru diberi flag `isNewThisPeriod = true`.

---

## 3. Kategori alat ukur

Alat ukur sekarang lebih beragam. Buat `src/config/categories.ts` yang menurunkan kategori dari `name` (case-insensitive, cek berurutan):

| Kata kunci di nama | Kategori |
|---|---|
| `PRESSURE GAUGE` (termasuk `DIGITAL PRESSURE GAUGE`) | Pressure Gauge |
| `DIAL INDICATOR`, `DIAL GAUGE` | Dial Indicator |
| `TETRA` | Tetra Gauge |
| `MICRO METER`, `MICROMETER` | Micrometer |
| `BORE GAUGE` | Bore Gauge |
| `CALIPER` | Caliper |
| `DEPTH` | Depth Gauge |
| `ROUGHNESS` | Roughness Tester |
| `TORQUE WRENCH` | Torque Wrench |
| lainnya | Lainnya |

Nama pressure gauge mengandung nomor seri (`Pressure Gauge Noshok,SN. 25-9...`). Ambil nomor seri ke field `serialNumber` (teks setelah `SN.`) dan tampilkan di Asset Passport. Untuk tampilan tabel, pakai nama tanpa SN.

---

## 4. Torque wrench: rekonsiliasi ID (penting)

Torque wrench sekarang ada di dua sumber:
- **File torque** (`kalibrasi-torque-wrench.xlsx`): cek bulanan Jun–Okt 2026, 5 pembacaan per sesi
- **Sheet `Data` (file verifikasi)**: status kalibrasi eksternal per 6 Nov 2026, **semuanya `Calibrated`**

ID di sheet `Data` memakai format baru `TW-BRC[-ST]-<nomor>-<kapasitas>NM`, dan **sebagian nomornya bentrok** dengan file torque:

| Nomor | File torque | Sheet `Data` | Perlakuan |
|---|---|---|---|
| 200–211 | `TW-BRC-2xx-68NM` | `TW-BRC-2xx-68NM` | **Cocok** → alat yang sama |
| 213–223 | `TW-BRC-2xx-135NM` | `TW-BRC-ST-2xx-135NM` | **Cocok** (nomor + Nm sama, hanya prefix beda) → alat yang sama |
| 340 | `TW-BRC-ST-340 (1250NM)` | `TW-BRC-ST-340-1250NM` | **Cocok** → alat yang sama |
| 212 | 135 Nm | **68 Nm** | **KONFLIK** |
| 224, 225 | 300 Nm | **135 Nm** | **KONFLIK** |
| 226, 227 | 400 Nm | **300 Nm** | **KONFLIK** |
| 228 | 400 Nm (Tidak Lolos/REPAIR sejak Jul) | **tidak ada** | **HILANG** |
| 229, 230 (300 Nm), 231, 232 (400 Nm), 483 (60 Nm) | tidak ada | ada | **Baru** |

Aturan implementasi:
1. Buat `torqueKey(id) = "<nomor>|<nominalNm>"`. Nomor diambil dari angka setelah `TW-BRC-` atau `TW-BRC-ST-`; nominal dari akhiran `-xxNM` atau kurung `(xxNM)`.
2. **Gabungkan dua record hanya kalau `torqueKey` sama persis** (nomor **dan** Nm sama). Jangan pernah menggabungkan berdasarkan nomor saja.
3. ID kanonik untuk aset yang digabung = ID versi sheet `Data` (lebih baru). ID lama disimpan di `aliases: string[]` dan tetap bisa dicari lewat ⌘K.
4. Nomor yang sama tapi Nm berbeda (212, 224–227) → **dua aset terpisah**, keduanya diberi `DataIssue` severity **high**, jenis `ID_CONFLICT`. Contoh pesan: *"Nomor TW 226: di file torque tercatat 400 Nm, di data verifikasi Nov 2026 tercatat 300 Nm. Konfirmasi ke admin apakah nomor di-reset atau salah ketik."*
5. Aset yang ada di periode sebelumnya tapi tidak ada di periode terbaru (TW-228, BRC-ST-148, BRC-ST-277) → `DataIssue` jenis `MISSING_IN_LATEST` (severity **high** untuk TW-228 karena status terakhirnya Tidak Lolos, **medium** untuk sisanya).
6. Jangan membuat tabel mapping manual yang di-hardcode untuk nomor-nomor di atas. Semuanya harus hasil dari aturan 1–5, supaya tetap benar saat data berikutnya datang. Tabel di atas hanya untuk acuan test.
7. **Status torque wrench** sekarang punya dua dimensi. Tampilkan keduanya, jangan digabung jadi satu angka:
   - **Cek bulanan** (dari file torque): Lolos / Tidak Lolos / Drift / Cek terlewat — aturan lama tetap.
   - **Kalibrasi eksternal** (dari sheet `Data`): Terkalibrasi + tanggal `lastCalibration`.
   - `usable` = cek bulanan terakhir lolos **dan** (kalau ada) status kalibrasi bukan Need/On Progress/Damage.

---

## 5. Isu kualitas data baru

Tambahkan ke union `DataIssue["type"]`, lalu tampilkan di halaman Kualitas Data:

| Jenis | Severity | Kapan |
|---|---|---|
| `ID_CONFLICT` | high | Bagian 4 aturan 4 |
| `MISSING_IN_LATEST` | high/medium | Bagian 4 aturan 5 (berlaku juga untuk alat ukur) |
| `STATUS_DATE_CONFLICT` | medium | `calibrationStatus = NEED_CALIBRATION` tapi `lastCalibration` ≥ tanggal cek (saat ini **24 pressure gauge** dengan Last Calibration 19 Nov 2026, sedangkan tanggal ceknya 6 Nov). **Status tetap mengikuti kolom Status**, hanya ditandai |
| `LAST_CAL_AFTER_CHECK` | low | `lastCalibration` > `checkedAt` untuk status apa pun selain kasus di atas |
| `SUMMARY_MISMATCH` | low | Hitung ulang jumlah per status dari sheet `Data` (hanya grup Measurement), lalu bandingkan dengan sheet `Summary`. Kalau beda, buat 1 issue berisi kedua angka. Saat ini: Summary bilang Calibrated 64 / Need Calibration 52, data aslinya Calibrated 36 / Need Calibration 80 |
| `NON_STANDARD_ID` | low | ID tidak berawalan `BRC-` atau `TW-` (contoh `104050000878` — Roughness) |
| `FORMULA_ERROR` | low | Sel berisi `#VALUE!`, `#REF!`, `#N/A`, dll. di area header/data |

---

## 6. Perubahan UI

### 6.1 Halaman Alat Ukur (`/alat-ukur`)
- **KPI** diganti mengikuti status v2 untuk periode terbaru: Total · Terkalibrasi · Perlu Kalibrasi · Proses di Vendor · Rusak · **Alat Baru** (badge "BARU").
  - Kalau periode yang dipilih di filter adalah periode format lama, tampilkan KPI versi lama.
- **Bar status per kategori** (stacked, horizontal, kategori dari Bagian 3): langsung kelihatan bahwa kebanyakan yang "Perlu Kalibrasi" adalah pressure gauge.
- **Matriks perubahan status** antara 2 periode yang dipilih (default: Okt → Nov). Baris = status periode lama, kolom = status periode baru, sel = jumlah alat (bisa diklik untuk melihat daftarnya). Cukup tabel/heatmap CSS grid, tidak perlu Sankey.
- **Panel "Sedang di Vendor"**: kelompokkan alat `ON_PROGRESS` per `poNumber` (saat ini PO `4010396340` = 24 alat, PO `4010396979` = 3 alat). Klik PO untuk melihat daftar alatnya.
- **Heatmap aset × bulan** tetap ada. Kolom November memakai `result` turunan (Bagian 2.3), dan sel November ditandai kecil ("format baru") lewat tooltip.
- Filter tambahan khusus halaman ini: **Kategori alat ukur**, **Status kalibrasi**, **Hanya alat baru**.

### 6.2 Halaman Torque Wrench (`/torque`)
- Setiap tile di **Peta Bay** dan setiap baris tabel menampilkan dua indikator: cek bulanan dan kalibrasi eksternal.
- Tambahkan kolom/badge **"Kalibrasi terakhir"** (dari sheet `Data`).
- Tambahkan panel **"Rekonsiliasi ID"** di bagian bawah: daftar `ID_CONFLICT`, `MISSING_IN_LATEST`, dan TW baru, dalam tabel 3 kolom (File torque | Data verifikasi | Keterangan). Panel ini hanya muncul kalau ada isinya.
- Torque wrench baru (229–232, 483) belum punya riwayat cek bulanan → tampilkan "Belum ada cek bulanan", bukan error/kosong.

### 6.3 Halaman Ringkasan (`/`)
- Angka KPI dan "Perlu Tindakan" otomatis ikut berubah lewat aturan baru di Bagian 2.5. Tidak perlu komponen baru.
- Tambahkan 1 kartu kecil **"Perubahan sejak periode lalu"**: jumlah alat yang membaik, memburuk, baru, dan hilang. Kartu bisa diklik menuju matriks di halaman Alat Ukur.

### 6.4 Asset Passport
- Tampilkan: `serialNumber`, `poNumber`, `aliases` (ID lama), dan status kalibrasi eksternal.
- Timeline riwayat menggabungkan semua periode dari semua file verifikasi, dengan label sumber file di tooltip.

### 6.5 Top bar
- "Data per" sekarang menampilkan periode terbaru per sumber, mis. *"Verifikasi: Nov 2026 · Torque: Okt 2026 · Sertifikasi: <tanggal file>"*.

---

## 7. Test (tambahkan, jangan ubah test lama)

Pakai file asli di `public/data/`. Angka acuan:

- Sheet `Data` → **181** record (147 `MEASUREMENT` + 34 `TORQUE`), periode `2026-11`.
- Alat ukur Nov 2026: `CALIBRATED` **36**, `NEED_CALIBRATION` **80**, `ON_PROGRESS` **27**, `DAMAGE` **4**.
- ID `104050000878` terbaca sebagai string `"104050000878"` (bukan `1.0405e+11`), plus `NON_STANDARD_ID`.
- `Eko Prasetyo` **tidak** muncul sebagai aset.
- Alat ukur baru periode Nov (tidak ada di periode Okt): **62** ID dengan pola `BRC-ST-438`…`BRC-ST-542`, + 1 ID numerik.
- Gabungan file Okt + Nov: periode Jan–Apr tidak dobel (1 record per aset per bulan).
- Torque: `TW-BRC-213-135NM` (file torque) dan `TW-BRC-ST-213-135NM` (Data) → **1 aset**, alias berisi ID lama.
- Torque: nomor **212, 224, 225, 226, 227** → masing-masing jadi **2 aset** + `ID_CONFLICT`.
- `TW-BRC-ST-228` → `MISSING_IN_LATEST` severity high.
- `STATUS_DATE_CONFLICT` → **24** issue.
- `SUMMARY_MISMATCH` → 1 issue.
- Remarks `4010396340` → `poNumber`; Remarks `Gauge` → `note`.

Kalau hasil hitung berbeda dari angka di atas, **laporkan ke user**. Jangan menyesuaikan test supaya lulus.

---

## 8. Urutan pengerjaan

Setelah setiap langkah: jalankan `npm run test` dan `npm run build`, lalu beri ringkasan singkat ke user.

1. Pindahkan file ke struktur baru (Bagian 1), buat `manifest.json`, update loader & dialog "Perbarui Data" agar mendukung multi-file verifikasi.
2. Parser v2 + update tipe + rules + kategori (Bagian 2–3). Pastikan **semua test lama tetap lulus**.
3. Rekonsiliasi torque wrench (Bagian 4) + isu data baru (Bagian 5) + test baru (Bagian 7). **Jangan lanjut ke UI sebelum test lulus.**
4. Update UI (Bagian 6).
5. Penutup:
   - Tulis ringkasan perubahan di `docs/CHANGELOG.md` (rev1).
   - Perbarui `.kiro/steering/dashboard-peralatan.md` (Bagian 3, 4.3, 4.4, 5, 8.4, 8.5, 11) supaya mencerminkan aturan baru ini, sehingga steering utama kembali jadi satu sumber kebenaran.
   - Setelah itu, ubah front matter file ini menjadi `inclusion: manual` supaya tidak dimuat lagi secara otomatis.
