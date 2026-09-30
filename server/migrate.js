import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool, query } from './db.js';

const sql = await fs.readFile(new URL('./schema.sql', import.meta.url), 'utf8');
for (const statement of sql.split(/;\s*(?:\r?\n|$)/).map(s => s.trim()).filter(Boolean)) await query(statement);

// Existing production databases need an explicit ALTER; CREATE TABLE IF NOT EXISTS
// does not modify an already-created ENUM definition.
const roleDefinition = await query("SELECT COLUMN_TYPE AS columnType FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'role'");
if (roleDefinition[0] && !roleDefinition[0].columnType.includes('super_admin')) await query("ALTER TABLE users MODIFY role ENUM('super_admin','admin','user') NOT NULL DEFAULT 'user'");

const addresses = [
  ['jakarta', 'Kantor Jakarta', 'Kawasan CBD Rasuna Epicentrum, Epiwalk Office Suite Level 5 Unit A501, Jl. H. R. Rasuna Said, RT 02 / RW 05, Karet, Kuningan, Kec. Setia Budi, Jakarta Selatan, Jakarta 12940'],
  ['bandung', 'Kantor Bandung', 'Jl. A.H. Nasution No. 952, Antapani Wetan, Kec. Antapani, Kota Bandung, Jawa Barat 40291'],
  ['cirebon', 'Kantor Cirebon', 'Jl. Cisaat - Kramat, Cisaat, Kec. Dukupuntang, Kab. Cirebon, Jawa Barat 45652'],
  ['purwokerto', 'Kantor Purwokerto', 'Jl. Mayjend Sutoyo, Sawangan, Kedungwuluh, Purwokerto, Jawa Tengah 53137'],
  ['semarang', 'Kantor Semarang', 'Jl. Genting Baru, Meteseh, Kec. Tembalang, Kota Semarang, Jawa Tengah 50271'],
  ['solo', 'Kantor Solo', 'Jl. Pesanggrahan Langenharjo, Kec. Grogol, Kabupaten Sukoharjo, Jawa Tengah 57552'],
  ['yogyakarta', 'Kantor Yogyakarta', 'Jl. Imogiri Barat Km 7, Bangunharjo, Kec. Sewon, Kab. Bantul, Yogyakarta 55188'],
  ['surabaya', 'Kantor Surabaya', 'Jl. Laksda M. Natsir No. 1, Perak Barat, Kec. Krembangan, Surabaya, Jawa Timur 60177'],
  ['malang', 'Kantor Malang', 'Jl. Sekar Putih (Selatan TPU Tawangargo), Kec. Karang Ploso, Malang, Jawa Timur 65152'],
  ['banyuwangi', 'Kantor Banyuwangi', 'Jl. Ry Sraten, Dusun Krajan, Krajan, Kec. Cluring, Kabupaten Banyuwangi, Jawa Timur 68482'],
  ['bali', 'Kantor Bali', 'BTN Bumi Dalung Permai Blok V V No 72, Br, Jl. Tegal Sari Raya, Kerobokan Kaja, Kec. Kuta Utara, Kab Badung, Bali 80361'],
  ['padang', 'Kantor Padang', 'Jln. By Pass KM 15, Aie Pacah, Kecamatan Koto Tangah, Padang, Sumatera Barat 25586'],
  ['palembang', 'Kantor Palembang', 'Jl HM Noerdin Pandji, Sukajaya, Kec. Sukarami, Kota Palembang, Sumatera Selatan 30961'],
  ['lampung', 'Kantor Lampung', 'Jl. Zainal Abidin Pagar Alam No. 99 B, Labuhan Ratu, Kec. Kedaton, Kota Bandar Lampung, Lampung 35132']
];
for (const [id, name, fullAddress] of addresses) await query('INSERT IGNORE INTO office_addresses (id, name, full_address) VALUES (?, ?, ?)', [id, name, fullAddress]);

const defaultBankAccounts = 'BCA 846-598-6111\nMANDIRI 137.004747.1111\nA/N ARI HARYADI';
await query('INSERT IGNORE INTO company_settings (id, bank_accounts) VALUES (1, ?)', [defaultBankAccounts]);

const superAdminUsername = process.env.SUPER_ADMIN_USERNAME || process.env.ADMIN_USERNAME || 'admin';
const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'GantiPasswordSuperAdmin123!';
const existingSuperAdmin = await query("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1");
if (!existingSuperAdmin.length) {
  const existingPrimary = await query('SELECT id FROM users WHERE username = ?', [superAdminUsername]);
  if (existingPrimary.length) {
    await query("UPDATE users SET role = 'super_admin' WHERE id = ?", [existingPrimary[0].id]);
    console.log(`Super admin promoted: ${superAdminUsername}.`);
  } else {
    await query('INSERT INTO users (id, name, username, password_hash, role) VALUES (?, ?, ?, ?, ?)', [crypto.randomUUID(), 'Super Administrator', superAdminUsername, await bcrypt.hash(superAdminPassword, 12), 'super_admin']);
    console.log(`Super admin created: ${superAdminUsername}. Change the supplied SUPER_ADMIN_PASSWORD immediately.`);
  }
}

const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'GantiPasswordAdmin123!';
const existing = await query('SELECT id FROM users WHERE username = ?', [adminUsername]);
if (!existing.length) {
  await query('INSERT INTO users (id, name, username, password_hash, role) VALUES (?, ?, ?, ?, ?)', [crypto.randomUUID(), 'Administrator', adminUsername, await bcrypt.hash(adminPassword, 12), 'admin']);
  console.log(`Admin created: ${adminUsername}. Change the supplied ADMIN_PASSWORD immediately.`);
} else console.log(`Admin exists: ${adminUsername}`);

const userUsername = process.env.USER_USERNAME || 'user';
const userPassword = process.env.USER_PASSWORD || 'GantiPasswordUser123!';
const regularUser = await query('SELECT id FROM users WHERE username = ?', [userUsername]);
if (!regularUser.length) {
  await query('INSERT INTO users (id, name, username, password_hash, role) VALUES (?, ?, ?, ?, ?)', [crypto.randomUUID(), 'Staff Invoice', userUsername, await bcrypt.hash(userPassword, 12), 'user']);
  console.log(`Regular user created: ${userUsername}. Change the supplied USER_PASSWORD immediately.`);
} else console.log(`Regular user exists: ${userUsername}`);
await pool.end();
console.log('Database migration complete.');
