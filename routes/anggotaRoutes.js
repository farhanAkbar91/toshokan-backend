const express = require('express');
const router = express.Router();
const anggotaController = require('../controllers/anggotaController');

// Mapping POST /register ke controller prosesRegistrasi
router.post('/register', anggotaController.prosesRegistrasi);

// Mapping GET / ke controller tampilkanAnggota
router.get('/', anggotaController.tampilkanAnggota);

module.exports = router;
