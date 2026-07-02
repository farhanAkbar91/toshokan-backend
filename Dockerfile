# Gunakan runtime Node.js resmi berbasis Alpine Linux untuk ukuran image yang kecil
FROM node:24-alpine

# Tentukan direktori kerja di dalam kontainer
WORKDIR /usr/src/app

# Salin package.json dan package-lock.json terlebih dahulu untuk memanfaatkan caching layer Docker
COPY package*.json ./

# Instal dependensi produksi saja untuk optimalisasi image
RUN npm ci --only=production

# Salin seluruh berkas proyek backend
COPY . .

# Ekspos port 3000 (sesuai port server Express di index.js)
EXPOSE 3000

# Jalankan server
CMD [ "node", "index.js" ]
