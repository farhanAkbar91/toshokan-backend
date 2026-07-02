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
 * Memproses registrasi anggota baru oleh admin.
 * @param {object} req 
 * @param {object} res 
 */
const prosesRegistrasi = async (req, res) => {
  const { nomor_identitas, nama_lengkap, alamat, nomor_telepon, email, password } = req.body;

  // Validasi input awal
  if (!nomor_identitas || !nama_lengkap || !alamat || !nomor_telepon) {
    return res.status(400).json({
      message: 'Kolom nomor identitas, nama lengkap, alamat, dan nomor telepon wajib diisi.'
    });
  }

  try {
    // 1. Validasi Keunikan nomor_identitas
    const isUnique = await verifikasiKeunikanIdentitas(nomor_identitas);
    if (!isUnique) {
      return res.status(400).json({
        message: 'Nomor identitas tersebut sudah digunakan oleh anggota lain'
      });
    }

    if (email) {
      const checkEmail = await pool.query('SELECT id_anggota FROM anggota WHERE email = $1', [email]);
      if (checkEmail.rows.length > 0) {
        return res.status(400).json({ message: 'Email tersebut sudah digunakan oleh anggota lain' });
      }
    }

    // 2. Simpan Data Anggota Baru dengan status awal 'Tidak Aktif'
    const insertQuery = `
      INSERT INTO anggota (nomor_identitas, nama_lengkap, alamat, nomor_telepon, email, password, status_akun)
      VALUES ($1, $2, $3, $4, $5, $6, 'Tidak Aktif')
      RETURNING *
    `;
    const insertResult = await pool.query(insertQuery, [
      nomor_identitas,
      nama_lengkap,
      alamat,
      nomor_telepon,
      email || null,
      password || null
    ]);

    const newAnggota = insertResult.rows[0];

    // 3. Aktivasi akun otomatis (karena diinput langsung oleh Admin di konter)
    await aktivasiAkunOtomatis(newAnggota.id_anggota);

    // Ambil data terbaru anggota setelah aktivasi
    const finalResult = await pool.query('SELECT * FROM anggota WHERE id_anggota = $1', [newAnggota.id_anggota]);

    return res.status(201).json({
      message: 'Registrasi anggota berhasil & akun diaktifkan otomatis',
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

/**
 * Memperbarui status keaktifan akun anggota (Verifikasi / Suspensi)
 */
const updateStatusAkun = async (req, res) => {
  const { id } = req.params;
  const { status_akun } = req.body;

  if (!status_akun || (status_akun !== 'Aktif' && status_akun !== 'Tidak Aktif')) {
    return res.status(400).json({
      message: "Status akun tidak valid. Harus 'Aktif' atau 'Tidak Aktif'."
    });
  }

  try {
    const query = `
      UPDATE anggota
      SET status_akun = $1
      WHERE id_anggota = $2
      RETURNING *
    `;
    const result = await pool.query(query, [status_akun, id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Anggota tidak ditemukan' });
    }

    return res.status(200).json({
      message: `Status akun anggota berhasil diperbarui menjadi ${status_akun}`,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error saat memperbarui status anggota:', error);
    return res.status(500).json({
      message: 'Terjadi kesalahan saat memperbarui status anggota',
      error: error.message
    });
  }
};

module.exports = {
  prosesRegistrasi,
  verifikasiKeunikanIdentitas,
  aktivasiAkunOtomatis,
  tampilkanAnggota,
  updateStatusAkun
};

