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
    return { isValid: false, message: 'Akun anggota tidak aktif atau belum diverifikasi oleh pustakawan.' };
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
 */
const prosesPencatatanPeminjaman = async (client, idAnggota, idBuku, status = 'Berjalan') => {
  const tanggalPinjam = new Date();
  const batasKembali = new Date();
  batasKembali.setDate(tanggalPinjam.getDate() + 7);

  const insertPeminjamanQuery = `
    INSERT INTO transaksi_peminjaman (id_anggota, tanggal_pinjam, batas_kembali, status_transaksi)
    VALUES ($1, $2, $3, $4)
    RETURNING id_transaksi, tanggal_pinjam, batas_kembali, status_transaksi
  `;
  const peminjamanResult = await client.query(insertPeminjamanQuery, [
    idAnggota,
    tanggalPinjam,
    batasKembali,
    status
  ]);

  const idTransaksi = peminjamanResult.rows[0].id_transaksi;
  const statusBuku = status === 'Pengajuan' ? 'Pengajuan' : 'Dipinjam';

  const insertDetailQuery = `
    INSERT INTO detail_transaksi (id_transaksi, id_buku, status_buku, status_denda)
    VALUES ($1, $2, $3, 'Lunas')
    RETURNING id_detail, status_buku
  `;
  const detailResult = await client.query(insertDetailQuery, [idTransaksi, idBuku, statusBuku]);

  if (status === 'Berjalan') {
    const updateStokQuery = 'UPDATE buku SET stok = stok - 1 WHERE id_buku = $1';
    await client.query(updateStokQuery, [idBuku]);
  }

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
 */
const hitungDendaOtomatis = (tanggalBatas, tanggalKembali) => {
  const tKembali = new Date(tanggalKembali);
  tKembali.setHours(0, 0, 0, 0);

  const tBatas = new Date(tanggalBatas);
  tBatas.setHours(0, 0, 0, 0);

  const timeDiff = tKembali.getTime() - tBatas.getTime();
  const lateDays = Math.ceil(timeDiff / (1000 * 3600 * 24));

  if (lateDays > 0) {
    return lateDays * 2000; // Denda Rp2.000 per hari
  }
  return 0;
};

// === Express Route Handlers ===

// 1. Memproses Transaksi Peminjaman (POST)
const prosesPeminjaman = async (req, res) => {
  const { id_anggota, id_buku, status } = req.body; // status can be 'Pengajuan' or 'Berjalan'

  if (!id_anggota || !id_buku) {
    return res.status(400).json({ message: 'id_anggota dan id_buku wajib diisi' });
  }

  const statusTransaksi = status || 'Berjalan'; // Default to counter checkouts

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

      // Catat peminjaman (status_transaksi = 'Pengajuan' / 'Berjalan')
      const record = await prosesPencatatanPeminjaman(client, id_anggota, id_buku, statusTransaksi);

      await client.query('COMMIT');
      return res.status(201).json({
        message: statusTransaksi === 'Pengajuan' 
          ? 'Pengajuan peminjaman berhasil dikirim. Silakan hubungi pustakawan untuk persetujuan.' 
          : 'Transaksi peminjaman berhasil diproses.',
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

    // B. Verifikasi kelayakan pengembalian
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
    const statusDenda = denda > 0 ? 'Belum Lunas' : 'Lunas';

    // D. Update detail_transaksi
    const updateDetailQuery = `
      UPDATE detail_transaksi
      SET tanggal_kembali = $1, jumlah_denda = $2, status_buku = 'Dikembalikan', status_denda = $3
      WHERE id_transaksi = $4 AND id_buku = $5
      RETURNING *
    `;
    const updateDetailResult = await client.query(updateDetailQuery, [
      tanggalKembali,
      denda,
      statusDenda,
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
        status_denda: updateDetailResult.rows[0].status_denda,
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

// 3. Menyetujui Pengajuan Peminjaman Anggota (PUT)
const setujuiPeminjaman = async (req, res) => {
  const { id } = req.params; // id_transaksi

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // A. Dapatkan data transaksi peminjaman
    const checkTxQuery = 'SELECT * FROM transaksi_peminjaman WHERE id_transaksi = $1 FOR UPDATE';
    const checkTxResult = await client.query(checkTxQuery, [id]);

    if (checkTxResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Transaksi peminjaman tidak ditemukan' });
    }

    const tx = checkTxResult.rows[0];
    if (tx.status_transaksi !== 'Pengajuan') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Transaksi ini sudah disetujui atau sudah selesai' });
    }

    // B. Dapatkan detail transaksi
    const checkDetailQuery = 'SELECT id_buku FROM detail_transaksi WHERE id_transaksi = $1 FOR UPDATE';
    const checkDetailResult = await client.query(checkDetailQuery, [id]);

    if (checkDetailResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Detail transaksi tidak ditemukan' });
    }

    const idBuku = checkDetailResult.rows[0].id_buku;

    // C. Validasi stok buku kembali (Lock)
    const checkBukuQuery = 'SELECT stok FROM buku WHERE id_buku = $1 FOR UPDATE';
    const checkBukuResult = await client.query(checkBukuQuery, [idBuku]);

    if (checkBukuResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Buku tidak ditemukan' });
    }

    const stok = checkBukuResult.rows[0].stok;
    if (stok <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Stok buku habis. Peminjaman tidak dapat disetujui.' });
    }

    // D. Update status transaksi dan detail transaksi
    const tanggalPinjam = new Date();
    const batasKembali = new Date();
    batasKembali.setDate(tanggalPinjam.getDate() + 7);

    const updateTxQuery = `
      UPDATE transaksi_peminjaman 
      SET status_transaksi = 'Berjalan', tanggal_pinjam = $1, batas_kembali = $2
      WHERE id_transaksi = $3
    `;
    await client.query(updateTxQuery, [tanggalPinjam, batasKembali, id]);

    const updateDetailQuery = `
      UPDATE detail_transaksi
      SET status_buku = 'Dipinjam'
      WHERE id_transaksi = $1
    `;
    await client.query(updateDetailQuery, [id]);

    // E. Potong stok buku
    const updateStokQuery = 'UPDATE buku SET stok = stok - 1 WHERE id_buku = $1';
    await client.query(updateStokQuery, [idBuku]);

    await client.query('COMMIT');
    return res.status(200).json({
      message: 'Peminjaman berhasil disetujui, status berubah menjadi berjalan.'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saat menyetujui peminjaman:', error);
    return res.status(500).json({
      message: 'Terjadi kesalahan server saat memproses persetujuan peminjaman',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// 4. Memproses Pembayaran Denda (PUT)
const bayarDenda = async (req, res) => {
  const { id } = req.params; // id_detail transaksi

  try {
    const checkDetail = await pool.query('SELECT * FROM detail_transaksi WHERE id_detail = $1', [id]);
    if (checkDetail.rows.length === 0) {
      return res.status(404).json({ message: 'Detail transaksi tidak ditemukan' });
    }

    const detail = checkDetail.rows[0];
    if (detail.status_denda === 'Lunas') {
      return res.status(400).json({ message: 'Denda transaksi ini sudah lunas sebelumnya.' });
    }

    const query = `
      UPDATE detail_transaksi
      SET status_denda = 'Lunas'
      WHERE id_detail = $1
      RETURNING *
    `;
    const result = await pool.query(query, [id]);

    return res.status(200).json({
      message: 'Pembayaran denda berhasil dikonfirmasi dan status denda diubah menjadi Lunas.',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error saat konfirmasi bayar denda:', error);
    return res.status(500).json({
      message: 'Terjadi kesalahan server saat memproses pembayaran denda',
      error: error.message
    });
  }
};

// 5. Mendapatkan seluruh daftar transaksi peminjaman (sirkulasi) beserta filter laporan
const tampilkanPeminjaman = async (req, res) => {
  const { id_anggota, startDate, endDate } = req.query;

  try {
    let query = `
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
        dt.status_buku,
        dt.status_denda
      FROM transaksi_peminjaman tp
      JOIN anggota a ON tp.id_anggota = a.id_anggota
      JOIN detail_transaksi dt ON tp.id_transaksi = dt.id_transaksi
      JOIN buku b ON dt.id_buku = b.id_buku
    `;

    const conditions = [];
    const params = [];

    if (id_anggota) {
      params.push(id_anggota);
      conditions.push(`tp.id_anggota = $${params.length}`);
    }

    if (startDate) {
      params.push(startDate);
      conditions.push(`tp.tanggal_pinjam >= $${params.length}`);
    }

    if (endDate) {
      params.push(endDate);
      conditions.push(`tp.tanggal_pinjam <= $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY tp.id_transaksi DESC`;

    const result = await pool.query(query, params);
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
  tampilkanPeminjaman,
  setujuiPeminjaman,
  bayarDenda
};
