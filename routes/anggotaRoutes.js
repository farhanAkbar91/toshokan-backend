const express = require('express');
const router = express.Router();
const anggotaController = require('../controllers/anggotaController');

// Mapping POST /register ke controller prosesRegistrasi
router.post('/register', anggotaController.prosesRegistrasi);

// Mapping GET / ke controller tampilkanAnggota
router.get('/', anggotaController.tampilkanAnggota);

// Mapping PUT /:id/status ke controller updateStatusAkun (Aktivasi/Verifikasi Admin)
router.put('/:id/status', anggotaController.updateStatusAkun);

module.exports = router;
