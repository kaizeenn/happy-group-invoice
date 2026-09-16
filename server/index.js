import express from 'express';
import cors from 'cors';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { pool, query } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const app = express();
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) throw new Error('JWT_SECRET must be configured and be at least 32 characters.');
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true }));
app.use(express.json({ limit: '2mb' }));

const publicUser = user => ({ id: user.id, name: user.name, username: user.username, role: user.role });
const sign = user => jwt.sign({ sub: user.id, role: user.role, name: user.name }, jwtSecret, { expiresIn: '8h' });
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Silakan masuk terlebih dahulu.' });
  try { req.user = jwt.verify(token, jwtSecret); next(); } catch { return res.status(401).json({ message: 'Sesi tidak valid atau sudah berakhir.' }); }
}
const allow = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ message: 'Akses khusus administrator.' });
const sqlDate = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const toInvoice = invoice => ({ ...invoice, issueDate: sqlDate(invoice.issue_date), companyAddress: invoice.company_address, customerAddress: invoice.customer_address || '', customerPhone: invoice.customer_phone || '', paymentStatus: invoice.payment_status, items: [], payments: [] });

async function fetchInvoices() {
  const invoices = (await query(`SELECT i.*, u.name AS created_by_name FROM invoices i JOIN users u ON u.id=i.created_by ORDER BY i.issue_date DESC, i.created_at DESC`)).map(toInvoice);
  if (!invoices.length) return invoices;
  const ids = invoices.map(i => i.id); const placeholders = ids.map(() => '?').join(',');
  const [items, payments] = await Promise.all([
    query(`SELECT id, invoice_id, description, detail, note, price, quantity, sort_order FROM invoice_items WHERE invoice_id IN (${placeholders}) ORDER BY sort_order`, ids),
    query(`SELECT id, invoice_id, amount, payment_date, method, account, reference_no, note FROM payments WHERE invoice_id IN (${placeholders}) ORDER BY payment_date`, ids)
  ]);
  const index = new Map(invoices.map(i => [i.id, i]));
  items.forEach(item => index.get(item.invoice_id).items.push({ id: item.id, description: item.description, detail: item.detail || '', note: item.note || '', price: Number(item.price), quantity: item.quantity }));
  payments.forEach(payment => index.get(payment.invoice_id).payments.push({ id: payment.id, amount: Number(payment.amount), date: String(payment.payment_date).slice(0,10), method: payment.method || '', account: payment.account || '', reference: payment.reference_no || '', note: payment.note || '' }));
  return invoices;
}
async function writeInvoice(conn, incoming, userId) {
  const invoice = { ...incoming, id: incoming.id || crypto.randomUUID() };
  const fields = [invoice.number, invoice.issueDate, invoice.companyAddress || '', invoice.customer, invoice.customerAddress || '', invoice.customerPhone || '', invoice.paymentStatus || 'auto', invoice.terms || '', invoice.notes || '', userId];
  // A duplicate invoice number may belong to a previous client-generated UUID.
  // Resolve that row first, so children always use the actual parent id.
  const existing = await conn.execute('SELECT id FROM invoices WHERE id = ? OR number = ? LIMIT 1', [invoice.id, invoice.number]);
  if (existing[0].length) invoice.id = existing[0][0].id;
  await conn.execute(`INSERT INTO invoices (id, number, issue_date, company_address, customer, customer_address, customer_phone, payment_status, terms, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE number=VALUES(number), issue_date=VALUES(issue_date), company_address=VALUES(company_address), customer=VALUES(customer), customer_address=VALUES(customer_address), customer_phone=VALUES(customer_phone), payment_status=VALUES(payment_status), terms=VALUES(terms), notes=VALUES(notes)`, [invoice.id, ...fields]);
  await conn.execute('DELETE FROM invoice_items WHERE invoice_id = ?', [invoice.id]);
  await conn.execute('DELETE FROM payments WHERE invoice_id = ?', [invoice.id]);
  for (const [sort, item] of (invoice.items || []).entries()) await conn.execute('INSERT INTO invoice_items (id, invoice_id, description, detail, note, price, quantity, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [item.id || crypto.randomUUID(), invoice.id, item.description || '', item.detail || '', item.note || '', Number(item.price || 0), Number(item.quantity || 1), sort]);
  for (const payment of invoice.payments || []) await conn.execute('INSERT INTO payments (id, invoice_id, amount, payment_date, method, account, reference_no, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [payment.id || crypto.randomUUID(), invoice.id, Number(payment.amount || 0), payment.date, payment.method || '', payment.account || '', payment.reference || '', payment.note || '', userId]);
  return invoice;
}

app.get('/api/health', async (_, res) => { try { await query('SELECT 1'); res.json({ ok: true, database: 'mysql' }); } catch { res.status(503).json({ ok: false, database: 'unavailable' }); } });
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {}; if (!username || !password) return res.status(400).json({ message: 'Username dan password wajib diisi.' });
  const users = await query('SELECT * FROM users WHERE username = ? AND is_active = TRUE', [String(username).trim()]);
  if (!users.length || !(await bcrypt.compare(password, users[0].password_hash))) return res.status(401).json({ message: 'Username atau password salah.' });
  res.json({ token: sign(users[0]), user: publicUser(users[0]) });
});
app.get('/api/auth/me', requireAuth, async (req, res) => { const users = await query('SELECT * FROM users WHERE id = ?', [req.user.sub]); if (!users.length) return res.status(401).json({ message: 'Pengguna tidak ditemukan.' }); res.json(publicUser(users[0])); });
app.get('/api/data', requireAuth, async (_, res) => res.json({ addresses: (await query('SELECT id, name, full_address AS fullAddress FROM office_addresses ORDER BY name')), invoices: await fetchInvoices() }));
app.put('/api/data', requireAuth, allow('admin'), async (req, res) => {
  const conn = await pool.getConnection(); try { await conn.beginTransaction(); await conn.execute('DELETE FROM office_addresses'); for (const address of req.body.addresses || []) await conn.execute('INSERT INTO office_addresses (id, name, full_address) VALUES (?, ?, ?)', [address.id || crypto.randomUUID(), address.name, address.fullAddress]); for (const invoice of req.body.invoices || []) await writeInvoice(conn, invoice, req.user.sub); await conn.commit(); res.json({ ok: true }); } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
});
app.get('/api/invoices', requireAuth, async (_, res) => res.json(await fetchInvoices()));
app.post('/api/invoices', requireAuth, async (req, res) => { const conn = await pool.getConnection(); try { await conn.beginTransaction(); const invoice = await writeInvoice(conn, req.body, req.user.sub); await conn.commit(); res.status(201).json(invoice); } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); } });
app.delete('/api/invoices/:id', requireAuth, allow('admin'), async (req, res) => { await query('DELETE FROM invoices WHERE id = ?', [req.params.id]); res.status(204).end(); });
app.get('/api/users', requireAuth, allow('admin'), async (_, res) => res.json((await query('SELECT id, name, username, role, is_active, created_at AS createdAt FROM users ORDER BY created_at')).map(publicUser)));
app.post('/api/users', requireAuth, allow('admin'), async (req, res) => { const { name, username, password, role = 'user' } = req.body || {}; if (!name || !username || !password || !['admin','user'].includes(role)) return res.status(400).json({ message: 'Nama, username, password dan peran yang valid wajib diisi.' }); const user = { id: crypto.randomUUID(), name: String(name).trim(), username: String(username).trim(), role }; try { await query('INSERT INTO users (id, name, username, password_hash, role) VALUES (?, ?, ?, ?, ?)', [user.id, user.name, user.username, await bcrypt.hash(password, 12), user.role]); res.status(201).json(publicUser(user)); } catch (error) { if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Username sudah digunakan.' }); throw error; } });
app.use((error, _, res, __) => { console.error(error); res.status(500).json({ message: 'Terjadi kesalahan pada server.' }); });
if (process.env.NODE_ENV === 'production') { app.use(express.static(path.join(root, 'dist'))); app.use((_, res) => res.sendFile(path.join(root, 'dist', 'index.html'))); }
const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Happy Group API running on port ${port}`));
