const express = require('express');
const router = express.Router();
const sirkulasiController = require('../controllers/sirkulasiController');

// Mapping POST /pinjam ke controller prosesPeminjaman
router.post('/pinjam', sirkulasiController.prosesPeminjaman);
router.post('/kembali', sirkulasiController.prosesPengembalian);

// Mapping PUT /:id/setujui ke controller setujuiPeminjaman (Persetujuan Admin)
router.put('/:id/setujui', sirkulasiController.setujuiPeminjaman);

// Mapping PUT /denda/:id/bayar ke controller bayarDenda (Pelunasan Denda)
router.put('/denda/:id/bayar', sirkulasiController.bayarDenda);

// Mapping GET /peminjaman ke controller tampilkanPeminjaman
router.get('/peminjaman', sirkulasiController.tampilkanPeminjaman);

module.exports = router;
