import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool, query } from './db.js';

const sql = await fs.readFile(new URL('./schema.sql', import.meta.url), 'utf8');
for (const statement of sql.split(/;\s*(?:\r?\n|$)/).map(s => s.trim()).filter(Boolean)) await query(statement);

const addresses = [
  ['yogyakarta', 'Kantor Yogyakarta', 'Jl. Imogiri Barat Km 7, Bangunharjo, Kec. Sewon, Kab. Bantul, Yogyakarta 55188'],
  ['jakarta', 'Kantor Jakarta', 'Kawasan CBD Rasuna Epicentrum, Epiwalk Office Suite Level 5 Unit A501, Jl. H. R. Rasuna Said, Karet, Kuningan, Jakarta Selatan 12940'],
  ['bandung', 'Kantor Bandung', 'Jl. A.H. Nasution No. 952, Antapani Wetan, Kec. Antapani, Kota Bandung, Jawa Barat 40291']
];
for (const [id, name, fullAddress] of addresses) await query('INSERT IGNORE INTO office_addresses (id, name, full_address) VALUES (?, ?, ?)', [id, name, fullAddress]);

const adminEmail = process.env.ADMIN_EMAIL || 'admin@happygroup.local';
const adminPassword = process.env.ADMIN_PASSWORD || 'GantiPasswordAdmin123!';
const existing = await query('SELECT id FROM users WHERE email = ?', [adminEmail]);
if (!existing.length) {
  await query('INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)', [crypto.randomUUID(), 'Administrator', adminEmail, await bcrypt.hash(adminPassword, 12), 'admin']);
  console.log(`Admin created: ${adminEmail}. Change the supplied ADMIN_PASSWORD immediately.`);
} else console.log(`Admin exists: ${adminEmail}`);

const userEmail = process.env.USER_EMAIL || 'user@happygroup.local';
const userPassword = process.env.USER_PASSWORD || 'GantiPasswordUser123!';
const regularUser = await query('SELECT id FROM users WHERE email = ?', [userEmail]);
if (!regularUser.length) {
  await query('INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)', [crypto.randomUUID(), 'Staff Invoice', userEmail, await bcrypt.hash(userPassword, 12), 'user']);
  console.log(`Regular user created: ${userEmail}. Change the supplied USER_PASSWORD immediately.`);
} else console.log(`Regular user exists: ${userEmail}`);
await pool.end();
console.log('Database migration complete.');
