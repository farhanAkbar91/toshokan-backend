const pool = require('../config/db');

/**
 * Memverifikasi keunikan nomor identitas anggota di database.
 * @param {string} nomorIdentitas 
 * @returns {Promise<boolean>} True jika unik, False jika duplikat.
 */
const verifikasiKeunikanIdentitas = async (nomorIdentitas) => {
  const checkIdentitasQuery = 'SELECT * FROM anggota WHERE nomor_identitas = $1';
  const checkResult = await pool.query(checkIdentitasQuery, [nomorIdentitas]);
  return checkResult.rows.length === 0;
};

/**
 * Mengaktifkan akun anggota secara otomatis.
 * @param {number} idAnggota 
 * @returns {Promise<void>}
 */
const aktivasiAkunOtomatis = async (idAnggota) => {
  const updateStatusQuery = "UPDATE anggota SET status_akun = 'Aktif' WHERE id_anggota = $1";
  await pool.query(updateStatusQuery, [idAnggota]);
};

/**
 * Memproses registrasi anggota baru.
 * @param {object} req 
 * @param {object} res 
 */
const prosesRegistrasi = async (req, res) => {
  const { nomor_identitas, nama_lengkap, alamat, nomor_telepon } = req.body;

  // Validasi input awal
  if (!nomor_identitas || !nama_lengkap || !alamat || !nomor_telepon) {
    return res.status(400).json({
      message: 'Semua kolom (nomor_identitas, nama_lengkap, alamat, nomor_telepon) wajib diisi.'
    });
  }

  try {
    // 1. Validasi Keunikan nomor_identitas (verifikasiKeunikanIdentitas)
    const isUnique = await verifikasiKeunikanIdentitas(nomor_identitas);
    if (!isUnique) {
      return res.status(400).json({
        message: 'Nomor identitas tersebut sudah digunakan'
      });
    }

    // 2. Simpan Data Anggota Baru dengan status awal 'Tidak Aktif'
    const insertQuery = `
      INSERT INTO anggota (nomor_identitas, nama_lengkap, alamat, nomor_telepon, status_akun)
      VALUES ($1, $2, $3, $4, 'Tidak Aktif')
      RETURNING *
    `;
    const insertResult = await pool.query(insertQuery, [
      nomor_identitas,
      nama_lengkap,
      alamat,
      nomor_telepon
    ]);

    const newAnggota = insertResult.rows[0];

    // 3. Aktivasi akun otomatis sesuai class diagram
    await aktivasiAkunOtomatis(newAnggota.id_anggota);

    // Ambil data terbaru anggota setelah aktivasi
    const finalResult = await pool.query('SELECT * FROM anggota WHERE id_anggota = $1', [newAnggota.id_anggota]);

    // 4. Kembalikan respons sukses 201 Created
    return res.status(201).json({
      message: 'Registrasi berhasil',
      data: finalResult.rows[0]
    });

  } catch (error) {
    console.error('Error saat proses registrasi anggota:', error);
    return res.status(500).json({
      message: 'Terjadi kesalahan internal server saat memproses registrasi',
      error: error.message
    });
  }
};

/**
 * Mendapatkan seluruh daftar anggota.
 */
const tampilkanAnggota = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM anggota ORDER BY id_anggota DESC');
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error saat menampilkan data anggota:', error);
    return res.status(500).json({
      message: 'Terjadi kesalahan saat menampilkan data anggota',
      error: error.message
    });
  }
};

module.exports = {
  prosesRegistrasi,
  verifikasiKeunikanIdentitas,
  aktivasiAkunOtomatis,
  tampilkanAnggota
};

