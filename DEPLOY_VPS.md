# Deploy Happy Group Invoice di VPS

Aplikasi menggunakan **React + Express + MySQL 8** dalam Docker. MySQL tidak diekspos ke internet; hanya aplikasi yang bisa mengaksesnya.

## 1. Persiapan VPS Ubuntu

```bash
sudo apt update
sudo apt install -y git docker.io docker-compose-plugin nginx certbot python3-certbot-nginx
sudo usermod -aG docker $USER
# Keluar/login kembali agar grup docker aktif.
```

Buka firewall hanya untuk web:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## 2. Clone dan buat konfigurasi rahasia

```bash
git clone https://github.com/kaizeenn/happy-group-invoice.git
cd happy-group-invoice
cp .env.example .env
chmod 600 .env
nano .env
```

Wajib ganti seluruh nilai `replace-with-...`, gunakan password unik. Buat JWT secret:

```bash
openssl rand -base64 48
```

Isi `CORS_ORIGIN` dengan domain HTTPS final, contohnya `https://invoice.domainanda.com`.

## 3. Jalankan MySQL dan aplikasi

```bash
docker compose up -d --build
docker compose exec app npm run db:migrate
docker compose logs -f app
```

Migration membuat alamat kantor awal dan satu akun administrator sesuai `ADMIN_EMAIL` dan `ADMIN_PASSWORD` dalam `.env`. Setelah login pertama, jangan bagikan password itu dan ganti jika perlu.

Cek layanan:

```bash
curl http://127.0.0.1:4000/api/health
```

## 4. Domain dan HTTPS

Arahkan DNS A record `invoice.domainanda.com` menuju IP VPS, lalu:

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/happy-invoice
sudo nano /etc/nginx/sites-available/happy-invoice  # ganti invoice.example.com
sudo ln -s /etc/nginx/sites-available/happy-invoice /etc/nginx/sites-enabled/happy-invoice
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d invoice.domainanda.com
```

## 5. Update aplikasi

```bash
cd ~/happy-group-invoice
git pull
docker compose up -d --build
docker compose exec app npm run db:migrate
```

## Roles

- **admin**: mengelola akun, alamat kantor, semua invoice, dan dapat menghapus invoice.
- **user**: membuat/memperbarui invoice dan mencatat pembayaran; tidak dapat mengelola akun, alamat kantor, maupun menghapus invoice.

## Backup MySQL

Jalankan dari folder proyek dan simpan hasilnya di lokasi aman di luar VPS juga:

```bash
mkdir -p backups
docker compose exec -T mysql mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" "$DB_NAME" > backups/happy-invoice-$(date +%F).sql
```

Untuk restore, gunakan `docker compose exec -T mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" "$DB_NAME" < backup.sql`.
