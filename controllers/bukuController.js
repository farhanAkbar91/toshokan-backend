const pool = require('../config/db');

/**
 * Mendapatkan seluruh daftar koleksi buku.
 * @returns {Promise<Array>}
 */
const dapatkanSemuaBuku = async () => {
  const result = await pool.query('SELECT * FROM buku ORDER BY id_buku ASC');
  return result.rows;
};

/**
 * Mencari data buku berdasarkan keyword (judul, pengarang, penerbit, atau kategori).
 * @param {string} keyword 
 * @returns {Promise<Array>}
 */
const prosesPencarianBuku = async (keyword) => {
  const searchQuery = `
    SELECT b.*, k.nama_kategori 
    FROM buku b
    LEFT JOIN kategori k ON b.id_kategori = k.id_kategori
    WHERE b.judul_buku ILIKE $1 
       OR b.pengarang ILIKE $1 
       OR b.penerbit ILIKE $1 
       OR k.nama_kategori ILIKE $1
    ORDER BY b.id_buku ASC
  `;
  const result = await pool.query(searchQuery, [`%${keyword}%`]);
  return result.rows;
};

/**
 * Memvalidasi format input buku.
 * @param {object} data 
 * @returns {boolean} True jika valid, False jika tidak valid.
 */
const validasiInputBuku = (data) => {
  const { id_kategori, judul_buku, pengarang, penerbit, tahun_terbit, stok } = data;

  if (
    id_kategori === undefined || id_kategori === null || id_kategori === '' ||
    !judul_buku || !judul_buku.toString().trim() ||
    !pengarang || !pengarang.toString().trim() ||
    !penerbit || !penerbit.toString().trim() ||
    tahun_terbit === undefined || tahun_terbit === null || tahun_terbit === '' ||
    stok === undefined || stok === null || stok === ''
  ) {
    return false;
  }

  const numTahun = Number(tahun_terbit);
  const numStok = Number(stok);

  if (!Number.isInteger(numTahun) || isNaN(numTahun)) {
    return false;
  }

  if (!Number.isInteger(numStok) || isNaN(numStok) || numStok < 0) {
    return false;
  }

  return true;
};

/**
 * Menyimpan data buku baru ke database.
 * @param {object} data 
 * @returns {Promise<object>}
 */
const prosesTambahBuku = async (data) => {
  const { id_kategori, judul_buku, pengarang, penerbit, tahun_terbit, stok } = data;
  const insertQuery = `
    INSERT INTO buku (id_kategori, judul_buku, pengarang, penerbit, tahun_terbit, stok)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
  const result = await pool.query(insertQuery, [
    id_kategori,
    judul_buku,
    pengarang,
    penerbit,
    Number(tahun_terbit),
    Number(stok)
  ]);
  return result.rows[0];
};

// === Express Route Handlers ===

// 1. Tampilkan / Cari Buku
const tampilkanBuku = async (req, res) => {
  const { keyword } = req.query;
  try {
    if (keyword) {
      const data = await prosesPencarianBuku(keyword);
      return res.status(200).json(data);
    } else {
      const data = await dapatkanSemuaBuku();
      return res.status(200).json(data);
    }
  } catch (error) {
    console.error('Error saat menampilkan/mencari data buku:', error);
    return res.status(500).json({
      message: 'Terjadi kesalahan saat menampilkan data buku',
      error: error.message
    });
  }
};

// 2. Tambah Buku
const tambahBuku = async (req, res) => {
  // Panggil validasiInputBuku
  const isValid = validasiInputBuku(req.body);
  if (!isValid) {
    // Cari pesan error yang tepat (tolak input kosong atau format tidak sesuai)
    const { id_kategori, judul_buku, pengarang, penerbit, tahun_terbit, stok } = req.body;
    if (
      id_kategori === undefined || id_kategori === null || id_kategori === '' ||
      !judul_buku || !judul_buku.toString().trim() ||
      !pengarang || !pengarang.toString().trim() ||
      !penerbit || !penerbit.toString().trim() ||
      tahun_terbit === undefined || tahun_terbit === null || tahun_terbit === '' ||
      stok === undefined || stok === null || stok === ''
    ) {
      return res.status(400).json({ message: 'Kolom isian wajib tidak boleh kosong' });
    }
    return res.status(400).json({ message: 'Format tahun terbit atau stok tidak sesuai' });
  }

  const { id_kategori } = req.body;

  try {
    // Pastikan kategori ada
    const checkKategori = await pool.query('SELECT * FROM kategori WHERE id_kategori = $1', [id_kategori]);
    if (checkKategori.rows.length === 0) {
      return res.status(400).json({ message: `Kategori dengan ID ${id_kategori} tidak ditemukan` });
    }

    // Panggil prosesTambahBuku
    const newBook = await prosesTambahBuku(req.body);

    return res.status(201).json({
      message: 'Buku berhasil ditambahkan',
      data: newBook
    });
  } catch (error) {
    console.error('Error saat menambah data buku:', error);
    return res.status(500).json({
      message: 'Terjadi kesalahan saat menyimpan data buku',
      error: error.message
    });
  }
};

// 3. Edit Buku
const editBuku = async (req, res) => {
  const { id } = req.params;
  
  // Panggil validasiInputBuku
  const isValid = validasiInputBuku(req.body);
  if (!isValid) {
    const { id_kategori, judul_buku, pengarang, penerbit, tahun_terbit, stok } = req.body;
    if (
      id_kategori === undefined || id_kategori === null || id_kategori === '' ||
      !judul_buku || !judul_buku.toString().trim() ||
      !pengarang || !pengarang.toString().trim() ||
      !penerbit || !penerbit.toString().trim() ||
      tahun_terbit === undefined || tahun_terbit === null || tahun_terbit === '' ||
      stok === undefined || stok === null || stok === ''
    ) {
      return res.status(400).json({ message: 'Kolom isian wajib tidak boleh kosong' });
    }
    return res.status(400).json({ message: 'Format tahun terbit atau stok tidak sesuai' });
  }

  const { id_kategori, judul_buku, pengarang, penerbit, tahun_terbit, stok } = req.body;

  try {
    const checkKategori = await pool.query('SELECT * FROM kategori WHERE id_kategori = $1', [id_kategori]);
    if (checkKategori.rows.length === 0) {
      return res.status(400).json({ message: `Kategori dengan ID ${id_kategori} tidak ditemukan` });
    }

    const updateQuery = `
      UPDATE buku
      SET id_kategori = $1, judul_buku = $2, pengarang = $3, penerbit = $4, tahun_terbit = $5, stok = $6
      WHERE id_buku = $7
      RETURNING *
    `;
    const result = await pool.query(updateQuery, [
      id_kategori,
      judul_buku,
      pengarang,
      penerbit,
      Number(tahun_terbit),
      Number(stok),
      id
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Buku tidak ditemukan' });
    }

    return res.status(200).json({
      message: 'Buku berhasil diperbarui',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error saat memperbarui data buku:', error);
    return res.status(500).json({
      message: 'Terjadi kesalahan saat memperbarui data buku',
      error: error.message
    });
  }
};

// 4. Hapus Buku
const hapusBuku = async (req, res) => {
  const { id } = req.params;

  try {
    const deleteQuery = 'DELETE FROM buku WHERE id_buku = $1 RETURNING *';
    const result = await pool.query(deleteQuery, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Buku tidak ditemukan' });
    }

    return res.status(200).json({
      message: 'Buku berhasil dihapus',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error saat menghapus data buku:', error);
    return res.status(500).json({
      message: 'Terjadi kesalahan saat menghapus data buku',
      error: error.message
    });
  }
};

module.exports = {
  tampilkanBuku,
  tambahBuku,
  editBuku,
  hapusBuku,
  dapatkanSemuaBuku,
  prosesPencarianBuku,
  validasiInputBuku,
  prosesTambahBuku
};
