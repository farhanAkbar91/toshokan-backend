const pool = require('../config/db');

/**
 * Memproses login pengguna (Admin atau Anggota)
 */
const login = async (req, res) => {
  const { usernameOrEmail, password } = req.body;

  if (!usernameOrEmail || !password) {
    return res.status(400).json({
      message: 'Username/Email dan Password wajib diisi.'
    });
  }

  try {
    // 1. Cek di tabel admin
    const checkAdminQuery = `
      SELECT id_admin, username, nama_lengkap, email 
      FROM admin 
      WHERE (username = $1 OR email = $1) AND password = $2
    `;
    const adminResult = await pool.query(checkAdminQuery, [usernameOrEmail, password]);

    if (adminResult.rows.length > 0) {
      const adminData = adminResult.rows[0];
      return res.status(200).json({
        message: 'Login berhasil sebagai Admin',
        role: 'admin',
        user: {
          id: adminData.id_admin,
          username: adminData.username,
          nama: adminData.nama_lengkap,
          email: adminData.email
        }
      });
    }

    // 2. Cek di tabel anggota
    const checkAnggotaQuery = `
      SELECT id_anggota, nomor_identitas, nama_lengkap, email, status_akun, alamat, nomor_telepon
      FROM anggota 
      WHERE (email = $1 OR nomor_identitas = $1) AND password = $2
    `;
    const anggotaResult = await pool.query(checkAnggotaQuery, [usernameOrEmail, password]);

    if (anggotaResult.rows.length > 0) {
      const anggotaData = anggotaResult.rows[0];

      // Verifikasi status keaktifan akun (Use Case 6 - 2b)
      if (anggotaData.status_akun !== 'Aktif') {
        return res.status(403).json({
          message: 'Akun Anda sedang ditangguhkan atau tidak aktif. Silakan hubungi pustakawan untuk verifikasi berkas.'
        });
      }

      return res.status(200).json({
        message: 'Login berhasil sebagai Anggota',
        role: 'anggota',
        user: {
          id: anggotaData.id_anggota,
          nomor_identitas: anggotaData.nomor_identitas,
          nama: anggotaData.nama_lengkap,
          email: anggotaData.email,
          alamat: anggotaData.alamat,
          nomor_telepon: anggotaData.nomor_telepon
        }
      });
    }

    // 3. Jika tidak ditemukan di manapun (Use Case 6 - 2a)
    return res.status(401).json({
      message: 'Kombinasi nama pengguna/email atau kata sandi tidak cocok dengan pangkalan data.'
    });

  } catch (error) {
    console.error('Error saat proses login:', error);
    return res.status(500).json({
      message: 'Terjadi kesalahan server saat memproses login',
      error: error.message
    });
  }
};

/**
 * Memproses registrasi mandiri oleh calon anggota (Aktor: Anggota)
 */
const register = async (req, res) => {
  const { nomor_identitas, nama_lengkap, email, password, alamat, nomor_telepon } = req.body;

  // Validasi input awal (Use Case 7 - 2a)
  if (!nomor_identitas || !nama_lengkap || !email || !password || !alamat || !nomor_telepon) {
    return res.status(400).json({
      message: 'Semua kolom formulir registrasi mandiri wajib diisi.'
    });
  }

  try {
    // Pengujian otomatis keunikan nomor identitas di basis data (Use Case 7 - 2b)
    const checkIdentitasQuery = 'SELECT id_anggota FROM anggota WHERE nomor_identitas = $1 OR email = $2';
    const checkResult = await pool.query(checkIdentitasQuery, [nomor_identitas, email]);

    if (checkResult.rows.length > 0) {
      return res.status(400).json({
        message: 'Nomor identitas atau email tersebut sudah digunakan oleh akun lain.'
      });
    }

    // Simpan entri baru dengan status 'Tidak Aktif' (Pending)
    const insertQuery = `
      INSERT INTO anggota (nomor_identitas, nama_lengkap, email, password, alamat, nomor_telepon, status_akun)
      VALUES ($1, $2, $3, $4, $5, $6, 'Tidak Aktif')
      RETURNING id_anggota, nomor_identitas, nama_lengkap, email, status_akun
    `;
    const insertResult = await pool.query(insertQuery, [
      nomor_identitas,
      nama_lengkap,
      email,
      password,
      alamat,
      nomor_telepon
    ]);

    return res.status(201).json({
      message: 'Registrasi berhasil dikirim. Berkas pendaftaran telah dikirim ke pustakawan untuk verifikasi.',
      data: insertResult.rows[0]
    });

  } catch (error) {
    console.error('Error saat proses registrasi mandiri:', error);
    return res.status(500).json({
      message: 'Terjadi kesalahan server saat memproses registrasi',
      error: error.message
    });
  }
};

module.exports = {
  login,
  register
};
