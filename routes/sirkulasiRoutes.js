const express = require('express');
const router = express.Router();
const sirkulasiController = require('../controllers/sirkulasiController');

// Mapping POST /pinjam ke controller prosesPeminjaman
router.post('/pinjam', sirkulasiController.prosesPeminjaman);
router.post('/kembali', sirkulasiController.prosesPengembalian);

// Mapping GET /peminjaman ke controller tampilkanPeminjaman
router.get('/peminjaman', sirkulasiController.tampilkanPeminjaman);

module.exports = router;
