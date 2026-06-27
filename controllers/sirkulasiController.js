const pool = require('../config/db');

/**
 * Memvalidasi apakah status akun anggota aktif.
 * @param {number} idAnggota 
 * @returns {Promise<boolean>} True jika aktif, False jika tidak aktif.
 */
const validasiStatusAkun = async (idAnggota) => {
  const checkAnggotaQuery = 'SELECT status_akun FROM anggota WHERE id_anggota = $1';
  const result = await pool.query(checkAnggotaQuery, [idAnggota]);
  if (result.rows.length === 0) return false;
  return result.rows[0].status_akun === 'Aktif';
};

/**
 * Memeriksa ketersediaan stok buku.
 * @param {number} idBuku 
 * @returns {Promise<boolean>} True jika stok > 0, False jika kosong.
 */
const periksaKetersediaanStok = async (idBuku) => {
  const checkBukuQuery = 'SELECT stok FROM buku WHERE id_buku = $1';
  const result = await pool.query(checkBukuQuery, [idBuku]);
  if (result.rows.length === 0) return false;
  return result.rows[0].stok > 0;
};

/**
 * Melakukan validasi ganda untuk pengajuan peminjaman (status akun dan ketersediaan stok).
 * @param {number} idAnggota 
 * @param {number} idBuku 
 * @returns {Promise<object>} Object { isValid: boolean, message?: string }
 */
const validasiPengajuanPeminjaman = async (idAnggota, idBuku) => {
  // Cek eksistensi anggota
  const checkAnggotaExist = await pool.query('SELECT * FROM anggota WHERE id_anggota = $1', [idAnggota]);
  if (checkAnggotaExist.rows.length === 0) {
    return { isValid: false, message: 'Anggota tidak ditemukan' };
  }

  const isAkunAktif = await validasiStatusAkun(idAnggota);
  if (!isAkunAktif) {
    return { isValid: false, message: 'Akun anggota tidak aktif' };
  }

  // Cek eksistensi buku
  const checkBukuExist = await pool.query('SELECT * FROM buku WHERE id_buku = $1', [idBuku]);
  if (checkBukuExist.rows.length === 0) {
    return { isValid: false, message: 'Buku tidak ditemukan' };
  }

  const isStokTersedia = await periksaKetersediaanStok(idBuku);
  if (!isStokTersedia) {
    return { isValid: false, message: 'Stok buku habis' };
  }

  return { isValid: true };
};

/**
 * Memproses pencatatan transaksi peminjaman baru ke database secara transaksional.
 * @param {object} client Client database dari transaction pool
 * @param {number} idAnggota 
 * @param {number} idBuku 
 * @returns {Promise<object>} Data hasil penyimpanan
 */
const prosesPencatatanPeminjaman = async (client, idAnggota, idBuku) => {
  const tanggalPinjam = new Date();
  const batasKembali = new Date();
  batasKembali.setDate(tanggalPinjam.getDate() + 7);

  const insertPeminjamanQuery = `
    INSERT INTO transaksi_peminjaman (id_anggota, tanggal_pinjam, batas_kembali, status_transaksi)
    VALUES ($1, $2, $3, 'Berjalan')
    RETURNING id_transaksi, tanggal_pinjam, batas_kembali, status_transaksi
  `;
  const peminjamanResult = await client.query(insertPeminjamanQuery, [
    idAnggota,
    tanggalPinjam,
    batasKembali
  ]);

  const idTransaksi = peminjamanResult.rows[0].id_transaksi;

  const insertDetailQuery = `
    INSERT INTO detail_transaksi (id_transaksi, id_buku, status_buku)
    VALUES ($1, $2, 'Dipinjam')
    RETURNING id_detail, status_buku
  `;
  const detailResult = await client.query(insertDetailQuery, [idTransaksi, idBuku]);

  const updateStokQuery = 'UPDATE buku SET stok = stok - 1 WHERE id_buku = $1';
  await client.query(updateStokQuery, [idBuku]);

  return {
    id_transaksi: idTransaksi,
    id_anggota: idAnggota,
    id_buku: idBuku,
    tanggal_pinjam: peminjamanResult.rows[0].tanggal_pinjam,
    batas_kembali: peminjamanResult.rows[0].batas_kembali,
    status_transaksi: peminjamanResult.rows[0].status_transaksi,
    status_buku: detailResult.rows[0].status_buku
  };
};

/**
 * Memverifikasi kelayakan transaksi pengembalian buku.
 * @param {object} client Client database dari transaction pool
 * @param {number} idTransaksi 
 * @param {number} idBuku 
 * @returns {Promise<object>} Data detail transaksi
 */
const prosesVerifikasiPengembalian = async (client, idTransaksi, idBuku) => {
  const checkDetailQuery = 'SELECT * FROM detail_transaksi WHERE id_transaksi = $1 AND id_buku = $2 FOR UPDATE';
  const checkDetailResult = await client.query(checkDetailQuery, [idTransaksi, idBuku]);

  if (checkDetailResult.rows.length === 0) {
    throw new Error('Detail transaksi peminjaman buku tidak ditemukan');
  }

  const detail = checkDetailResult.rows[0];
  if (detail.status_buku === 'Dikembalikan') {
    throw new Error('Buku sudah dikembalikan sebelumnya');
  }

  return detail;
};

/**
 * Menghitung denda keterlambatan secara otomatis.
 * @param {Date|string} tanggalBatas 
 * @param {Date|string} tanggalKembali 
 * @returns {number} Jumlah denda
 */
const hitungDendaOtomatis = (tanggalBatas, tanggalKembali) => {
  const tKembali = new Date(tanggalKembali);
  tKembali.setHours(0, 0, 0, 0);

  const tBatas = new Date(tanggalBatas);
  tBatas.setHours(0, 0, 0, 0);

  const timeDiff = tKembali.getTime() - tBatas.getTime();
  const lateDays = Math.ceil(timeDiff / (1000 * 3600 * 24));

  if (lateDays > 0) {
    return lateDays * 2000;
  }
  return 0;
};

// === Express Route Handlers ===

// 1. Memproses Transaksi Peminjaman (POST)
const prosesPeminjaman = async (req, res) => {
  const { id_anggota, id_buku } = req.body;

  if (!id_anggota || !id_buku) {
    return res.status(400).json({ message: 'id_anggota dan id_buku wajib diisi' });
  }

  try {
    // A. Validasi Ganda (Pengajuan Peminjaman)
    const validation = await validasiPengajuanPeminjaman(id_anggota, id_buku);
    if (!validation.isValid) {
      return res.status(400).json({ message: validation.message });
    }

    // B. Jalankan Transaksi Database
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock buku untuk menghindari race condition
      await client.query('SELECT stok FROM buku WHERE id_buku = $1 FOR UPDATE', [id_buku]);

      // Catat peminjaman
      const record = await prosesPencatatanPeminjaman(client, id_anggota, id_buku);

      await client.query('COMMIT');
      return res.status(201).json({
        message: 'Transaksi peminjaman berhasil diproses',
        data: record
      });
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error saat memproses transaksi peminjaman:', error);
    return res.status(500).json({
      message: 'Terjadi kesalahan internal server saat memproses transaksi peminjaman',
      error: error.message
    });
  }
};

// 2. Memproses Transaksi Pengembalian (POST)
const prosesPengembalian = async (req, res) => {
  const { id_transaksi, id_buku } = req.body;

  if (!id_transaksi || !id_buku) {
    return res.status(400).json({ message: 'id_transaksi dan id_buku wajib diisi' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // A. Ambil data transaksi peminjaman (header) untuk batas_kembali
    const checkTxQuery = 'SELECT * FROM transaksi_peminjaman WHERE id_transaksi = $1 FOR UPDATE';
    const checkTxResult = await client.query(checkTxQuery, [id_transaksi]);

    if (checkTxResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Transaksi peminjaman tidak ditemukan' });
    }

    const tx = checkTxResult.rows[0];

    // B. Verifikasi kelayakan pengembalian (prosesVerifikasiPengembalian)
    let detail;
    try {
      detail = await prosesVerifikasiPengembalian(client, id_transaksi, id_buku);
    } catch (validationErr) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: validationErr.message });
    }

    // C. Hitung Denda Otomatis
    const tanggalKembali = new Date();
    const denda = hitungDendaOtomatis(tx.batas_kembali, tanggalKembali);

    // D. Update detail_transaksi
    const updateDetailQuery = `
      UPDATE detail_transaksi
      SET tanggal_kembali = $1, jumlah_denda = $2, status_buku = 'Dikembalikan'
      WHERE id_transaksi = $3 AND id_buku = $4
      RETURNING *
    `;
    const updateDetailResult = await client.query(updateDetailQuery, [
      tanggalKembali,
      denda,
      id_transaksi,
      id_buku
    ]);

    // E. Update transaksi_peminjaman status
    const updateTxQuery = `
      UPDATE transaksi_peminjaman
      SET status_transaksi = 'Selesai'
      WHERE id_transaksi = $1
      RETURNING *
    `;
    const updateTxResult = await client.query(updateTxQuery, [id_transaksi]);

    // F. Pulihkan stok buku
    const updateStokQuery = 'UPDATE buku SET stok = stok + 1 WHERE id_buku = $1';
    await client.query(updateStokQuery, [id_buku]);

    await client.query('COMMIT');

    return res.status(200).json({
      message: 'Transaksi pengembalian berhasil diproses',
      data: {
        id_transaksi: id_transaksi,
        id_buku: id_buku,
        tanggal_kembali: updateDetailResult.rows[0].tanggal_kembali,
        jumlah_denda: updateDetailResult.rows[0].jumlah_denda,
        status_buku: updateDetailResult.rows[0].status_buku,
        status_transaksi: updateTxResult.rows[0].status_transaksi
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saat memproses pengembalian:', error);
    return res.status(500).json({
      message: 'Terjadi kesalahan internal server saat memproses transaksi pengembalian',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Mendapatkan seluruh daftar transaksi peminjaman (sirkulasi).
 */
const tampilkanPeminjaman = async (req, res) => {
  try {
    const query = `
      SELECT 
        tp.id_transaksi,
        tp.tanggal_pinjam,
        tp.batas_kembali,
        tp.status_transaksi,
        a.id_anggota,
        a.nama_lengkap,
        a.nomor_identitas,
        b.id_buku,
        b.judul_buku,
        dt.id_detail,
        dt.tanggal_kembali,
        dt.jumlah_denda,
        dt.status_buku
      FROM transaksi_peminjaman tp
      JOIN anggota a ON tp.id_anggota = a.id_anggota
      JOIN detail_transaksi dt ON tp.id_transaksi = dt.id_transaksi
      JOIN buku b ON dt.id_buku = b.id_buku
      ORDER BY tp.id_transaksi DESC
    `;
    const result = await pool.query(query);
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error saat menampilkan data peminjaman:', error);
    return res.status(500).json({
      message: 'Terjadi kesalahan saat menampilkan data peminjaman',
      error: error.message
    });
  }
};

module.exports = {
  prosesPeminjaman,
  prosesPengembalian,
  validasiStatusAkun,
  periksaKetersediaanStok,
  validasiPengajuanPeminjaman,
  prosesPencatatanPeminjaman,
  prosesVerifikasiPengembalian,
  hitungDendaOtomatis,
  tampilkanPeminjaman
};

