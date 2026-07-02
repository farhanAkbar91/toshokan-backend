# 🚀 Toshokan Backend API

Peladen backend RESTful API untuk Sistem Informasi Perpustakaan Digital Toshokan. Dibangun dengan **Node.js**, **Express.js**, dan **PostgreSQL**.

---

## 🛠️ Stack Teknologi & Pustaka

*   **Runtime:** Node.js (v24+)
*   **Framework:** Express.js (v5)
*   **Database Driver:** `pg` (node-postgres)
*   **Utility:** `cors` untuk keamanan request, `dotenv` untuk variabel lingkungan, dan `nodemon` untuk pengembangan lokal.

---

## ⚙️ Variabel Lingkungan (.env)

Buat berkas `.env` di dalam folder `toshokan-backend` dengan isi sebagai berikut:

```env
DATABASE_URL=postgresql://<username>:<password>@<host>:<port>/<database_name>?sslmode=require
PORT=3000
```

> **Catatan:** SSL Mode wajib disematkan apabila menghubungkan database dengan penyedia awan seperti Supabase PostgreSQL.

---

## 📂 Skema Tabel Database & Inisialisasi

Untuk membuat struktur tabel dan melakukan pengisian data master (*seeding*) awal, jalankan skrip inisialisasi:

```bash
# Instal dependensi terlebih dahulu
npm install

# Jalankan inisialisasi tabel PDM
node initDB.js
```

### Akun Pustakawan Bawaan (Default Admin):
Skrip migrasi akan mendaftarkan satu akun Admin secara otomatis ke database untuk pengujian awal:
*   **Username:** `admin`
*   **Password:** `admin123`
*   **Email:** `admin@toshokan.com`

---

## 🧭 Daftar Rute API (Endpoints)

### 🔑 Autentikasi (`/api/auth`)
*   `POST /api/auth/login` — Autentikasi masuk pengguna (Admin / Anggota).
*   `POST /api/auth/register` — Registrasi pendaftaran mandiri oleh calon anggota (status: `Tidak Aktif`).

### 👥 Data Anggota (`/api/anggota`)
*   `GET /api/anggota` — Menampilkan seluruh daftar anggota (Admin saja).
*   `POST /api/anggota/register` — Ditambahkan oleh Admin (status akun langsung `Aktif`).
*   `PUT /api/anggota/:id/status` — Memperbarui status keaktifan akun (Verifikasi/Suspensi oleh Admin).

### 📚 Data Buku (`/api/buku`)
*   `GET /api/buku` — Menampilkan daftar buku (bisa difilter menggunakan query string `?keyword=...`).
*   `POST /api/buku` — Menambah koleksi buku baru (Admin saja).
*   `PUT /api/buku/:id` — Memperbarui atribut detail buku (Admin saja).
*   `DELETE /api/buku/:id` — Menghapus buku dari database (Admin saja).

### 🔄 Sirkulasi Transaksi (`/api/sirkulasi`)
*   `GET /api/sirkulasi/peminjaman` — Menampilkan riwayat transaksi (mendukung filter query `?id_anggota=...` atau filter tanggal laporan `?startDate=...&endDate=...`).
*   `POST /api/sirkulasi/pinjam` — Mencatat transaksi peminjaman baru (Anggota mengajukan status `Pengajuan`, Admin langsung berstatus `Berjalan`).
*   `PUT /api/sirkulasi/:id/setujui` — Admin menyetujui pengajuan peminjaman (mengubah status ke `Berjalan` & memotong stok buku).
*   `POST /api/sirkulasi/kembali` — Proses pengembalian buku (menghitung denda otomatis jika telat).
*   `PUT /api/sirkulasi/denda/:id/bayar` — Admin mengonfirmasi pelunasan tunggakan denda.

### 🏷️ Kategori Buku (`/api/kategori`)
*   `GET /api/kategori` — Menampilkan daftar kategori buku.

---

## 🐳 Containerisasi dengan Docker

Untuk mempermudah deployment peladen backend di platform server produksi, Dockerfile telah dikonfigurasi.

### Build Docker Image:
```bash
docker build -t toshokan-backend .
```

### Menjalankan Docker Container:
```bash
docker run -p 3000:3000 --env-file .env toshokan-backend
```
