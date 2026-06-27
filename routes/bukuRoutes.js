const express = require('express');
const router = express.Router();
const bukuController = require('../controllers/bukuController');

// Mapping endpoint CRUD ke controller buku
router.get('/', bukuController.tampilkanBuku);
router.post('/', bukuController.tambahBuku);
router.put('/:id', bukuController.editBuku);
router.delete('/:id', bukuController.hapusBuku);

module.exports = router;
