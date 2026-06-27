const express = require('express');
const router = express.Router();
const kategoriController = require('../controllers/kategoriController');

// Mapping GET / ke controller tampilkanKategori
router.get('/', kategoriController.tampilkanKategori);

module.exports = router;
