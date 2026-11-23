# Changelog

## rev1 — Data Verifikasi November 2026

**Sumber data**
- Verifikasi sekarang multi-file: `public/data/verifikasi/verifikasi-2026-10.xlsx` dan `verifikasi-2026-11.xlsx`, daftar file di `public/data/manifest.json`.
- Semua record digabung dan di-dedupe per `(assetId, period)`; file yang lebih baru menang.
- Dialog "Perbarui Data": file verifikasi ditambahkan (bukan mengganti semua), disimpan per file di IndexedDB, daftar file aktif + periode + tombol hapus.

**Parser & domain**
- Parser baru `src/parsers/verifikasi-v2.ts` untuk sheet `Data` (header `RESULT (GOOD / DAMAGE)` + `STATUS`); parser lama tetap untuk sheet bulanan.
- `VerificationRecord` bertambah: `format`, `group`, `physicalResult`, `calibrationStatus`, `poNumber`, `note`, `sourceFile`.
- Status di record terbaru menentukan status alat ukur (Perlu Kalibrasi / Di Vendor / Rusak); `Asset.complianceReason` membedakan alasan tanggal vs status.
- Kategori alat ukur (`src/config/categories.ts`) dan nomor seri dari nama.
- Rekonsiliasi torque wrench berdasarkan `torqueKey = nomor|Nm`; ID kanonik dari data verifikasi, ID lama masuk `aliases`.
- Isu data baru: `ID_CONFLICT`, `MISSING_IN_LATEST`, `STATUS_DATE_CONFLICT`, `LAST_CAL_AFTER_CHECK`, `SUMMARY_MISMATCH`, `NON_STANDARD_ID`, `FORMULA_ERROR`.
- Sheet `Summary` tidak dipakai sebagai sumber data, hanya dibandingkan.
- Parser lama berhenti di baris footer "Checked by" (sebelumnya terbaca sebagai aset).

**UI**
- Alat Ukur: KPI status v2, bar status per kategori, matriks perubahan status, panel "Sedang di Vendor" per PO, filter kategori/status/alat baru.
- Torque: kolom kalibrasi eksternal, tabel status, panel Rekonsiliasi ID, indikator kalibrasi per bay.
- Ringkasan: kartu "Perubahan sejak periode lalu".
- Asset Passport: nomor seri, PO, ID lama, kalibrasi eksternal, sumber file per riwayat.
- Top bar: periode terbaru per sumber. ⌘K mencari juga lewat ID lama dan nomor seri.

**Test**
- `tests/rev1.test.ts` (22 test baru). Test lama tidak diubah; `tests/helpers.ts` hanya menyesuaikan path file Oktober.
