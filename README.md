# Happy Group Invoice

Aplikasi internal untuk membuat dan mengelola invoice Happy Group. Repo ini berisi web client React, backend Node.js/Express, database MySQL, dan client Flutter.

## Repository

- GitHub: https://github.com/kaizeenn/happy-group-invoice
- Branch utama: `main`

## Fitur utama

- Autentikasi pengguna dan pengelolaan invoice.
- Pengelolaan pelanggan, layanan, item, kuantitas, dan satuan.
- Pratinjau invoice responsif serta ekspor PDF A4 dengan teks yang dapat dipilih.
- PDF dirender oleh Puppeteer/Chromium di server.

## Teknologi

- Web: React, Vite
- API: Node.js, Express
- Database: MySQL (`happy_invoice` pada lingkungan produksi)
- PDF: Puppeteer/Chromium
- Aplikasi Flutter tersedia di `lib/`.

## Menjalankan web secara lokal

1. Pasang Node.js yang sesuai dan MySQL.
2. Salin `.env.example` menjadi `.env`, lalu isi konfigurasi lokal. **Jangan commit `.env` atau membagikan kredensial.**
3. Buat database kosong, misalnya `happy_invoice`, dan sesuaikan variabel koneksi di `.env`.
4. Pasang dependency dan siapkan skema:

   ```bash
   npm ci
   npm run db:migrate
   ```

5. Jalankan backend dan Vite bersama-sama:

   ```bash
   npm run dev
   ```

Untuk build web production lokal:

```bash
npm run build
npm start
```

`npm start` menjalankan server; konfigurasi production harus mengatur penyajian `dist/` sesuai lingkungan deploy.

## Konfigurasi dan data

Lihat `.env.example` untuk nama variabel yang dibutuhkan. Nilai aktual disediakan terpisah oleh pengelola sistem. Gunakan database development/test tersendiri; jangan menguji migrasi atau operasi destruktif pada database produksi. Migrasi harus ditinjau dan database dibackup sebelum perubahan skema.

## Struktur direktori

- `src/` — antarmuka web React.
- `server/` — API, koneksi database, migrasi dan renderer PDF.
- `lib/` — source Flutter.
- `public/` — aset web.
- `deploy/`, `Dockerfile`, `docker-compose.yml`, `DEPLOY_VPS.md` — materi deployment.

## Serah terima

Sebelum mengubah aplikasi, tinjau `.env.example`, skema/migrasi, dan alur pembuatan PDF. Jangan menaruh data pelanggan, nomor rekening produksi, secret, atau file environment runtime dalam commit. Koordinasikan akses server/database dengan pemilik sistem; dokumentasi ini tidak menyertakan kredensial.
