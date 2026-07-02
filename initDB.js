require('dotenv').config();
const { Client } = require('pg');

// Pastikan kamu menaruh URL koneksi Supabase di file .env dengan nama DATABASE_URL
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Wajib untuk Supabase
});

const createTablesQuery = `
  -- 0. Tabel Admin
  CREATE TABLE IF NOT EXISTS admin (
    id_admin SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    nama_lengkap VARCHAR(150) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL
  );

  -- 1. Tabel Kategori (Induk)
  CREATE TABLE IF NOT EXISTS kategori (
    id_kategori SERIAL PRIMARY KEY,
    nama_kategori VARCHAR(100) NOT NULL
  );

  -- 2. Tabel Buku
  CREATE TABLE IF NOT EXISTS buku (
    id_buku SERIAL PRIMARY KEY,
    id_kategori INT NOT NULL,
    judul_buku VARCHAR(200) NOT NULL,
    pengarang VARCHAR(150) NOT NULL,
    penerbit VARCHAR(150) NOT NULL,
    tahun_terbit INT NOT NULL,
    stok INT NOT NULL,
    CONSTRAINT fk_buku_kategori FOREIGN KEY (id_kategori) REFERENCES kategori(id_kategori) ON DELETE CASCADE
  );

  -- 3. Tabel Anggota
  CREATE TABLE IF NOT EXISTS anggota (
    id_anggota SERIAL PRIMARY KEY,
    nomor_identitas VARCHAR(50) UNIQUE NOT NULL,
    nama_lengkap VARCHAR(150) NOT NULL,
    email VARCHAR(100) UNIQUE,
    password VARCHAR(255),
    alamat TEXT NOT NULL,
    nomor_telepon VARCHAR(20) NOT NULL,
    status_akun VARCHAR(20) DEFAULT 'Tidak Aktif'
  );

  -- 4. Tabel Transaksi Peminjaman (Header)
  CREATE TABLE IF NOT EXISTS transaksi_peminjaman (
    id_transaksi SERIAL PRIMARY KEY,
    id_anggota INT NOT NULL,
    tanggal_pinjam DATE NOT NULL,
    batas_kembali DATE NOT NULL,
    status_transaksi VARCHAR(30) DEFAULT 'Berjalan',
    CONSTRAINT fk_transaksi_anggota FOREIGN KEY (id_anggota) REFERENCES anggota(id_anggota) ON DELETE CASCADE
  );

  -- 5. Tabel Detail Transaksi (Asosiatif)
  CREATE TABLE IF NOT EXISTS detail_transaksi (
    id_detail SERIAL PRIMARY KEY,
    id_transaksi INT NOT NULL,
    id_buku INT NOT NULL,
    tanggal_kembali DATE,
    jumlah_denda DECIMAL(10,2) DEFAULT 0.00,
    status_buku VARCHAR(30) DEFAULT 'Dipinjam',
    status_denda VARCHAR(20) DEFAULT 'Lunas',
    CONSTRAINT fk_detail_transaksi FOREIGN KEY (id_transaksi) REFERENCES transaksi_peminjaman(id_transaksi) ON DELETE CASCADE,
    CONSTRAINT fk_detail_buku FOREIGN KEY (id_buku) REFERENCES buku(id_buku) ON DELETE CASCADE
  );
`;

async function initDatabase() {
  try {
    console.log('Menghubungkan ke pangkalan data Supabase...');
    await client.connect();
    
    console.log('Mengeksekusi pembuatan tabel berdasarkan PDM...');
    await client.query(createTablesQuery);
    
    console.log('BOOM! Semua tabel berhasil dibuat. Backend siap digas!');
  } catch (err) {
    console.error('Waduh, ada error cuy:', err);
  } finally {
    await client.end();
  }
}

initDatabase();