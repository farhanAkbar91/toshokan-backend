const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const anggotaRoutes = require('./routes/anggotaRoutes');
const bukuRoutes = require('./routes/bukuRoutes');
const sirkulasiRoutes = require('./routes/sirkulasiRoutes');
const kategoriRoutes = require('./routes/kategoriRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json()); // Memungkinkan Express membaca body request berformat JSON

// Pasang routing
app.use('/api/auth', authRoutes);
app.use('/api/anggota', anggotaRoutes);
app.use('/api/buku', bukuRoutes);
app.use('/api/sirkulasi', sirkulasiRoutes);
app.use('/api/kategori', kategoriRoutes);

// Nyalakan server di port dinamis (Render/Heroku kompatibel) atau fallback ke 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});