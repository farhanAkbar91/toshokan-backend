const pool = require('../config/db');

/**
 * Mendapatkan seluruh daftar kategori buku.
 */
const tampilkanKategori = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM kategori ORDER BY nama_kategori ASC');
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error saat menampilkan data kategori:', error);
    return res.status(500).json({
      message: 'Terjadi kesalahan saat menampilkan data kategori',
      error: error.message
    });
  }
};

module.exports = {
  tampilkanKategori
};
