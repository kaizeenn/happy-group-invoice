import express from 'express';
import cors from 'cors';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'server', 'data');
const dataFile = path.join(dataDir, 'db.json');
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const defaults = {
  addresses: [
    { id: 'yogyakarta', name: 'Kantor Yogyakarta', fullAddress: 'Jl. Imogiri Barat Km 7, Bangunharjo, Kec. Sewon, Kab. Bantul, Yogyakarta 55188' },
    { id: 'jakarta', name: 'Kantor Jakarta', fullAddress: 'Kawasan CBD Rasuna Epicentrum, Epiwalk Office Suite Level 5 Unit A501, Jl. H. R. Rasuna Said, Karet, Kuningan, Jakarta Selatan 12940' },
    { id: 'bandung', name: 'Kantor Bandung', fullAddress: 'Jl. A.H. Nasution No. 952, Antapani Wetan, Kec. Antapani, Kota Bandung, Jawa Barat 40291' }
  ],
  invoices: []
};

async function db() {
  await fs.mkdir(dataDir, { recursive: true });
  try { return JSON.parse(await fs.readFile(dataFile, 'utf8')); }
  catch { await fs.writeFile(dataFile, JSON.stringify(defaults, null, 2)); return structuredClone(defaults); }
}
async function save(data) { await fs.mkdir(dataDir, { recursive: true }); await fs.writeFile(dataFile, JSON.stringify(data, null, 2)); }

app.get('/api/health', (_, res) => res.json({ ok: true }));
app.get('/api/data', async (_, res) => res.json(await db()));
app.put('/api/data', async (req, res) => {
  const payload = { addresses: Array.isArray(req.body.addresses) ? req.body.addresses : [], invoices: Array.isArray(req.body.invoices) ? req.body.invoices : [] };
  await save(payload); res.json(payload);
});
app.get('/api/invoices', async (_, res) => res.json((await db()).invoices));
app.post('/api/invoices', async (req, res) => {
  const data = await db(); const invoice = { ...req.body, id: req.body.id || crypto.randomUUID(), updatedAt: new Date().toISOString() };
  const i = data.invoices.findIndex(item => item.id === invoice.id);
  i >= 0 ? data.invoices[i] = invoice : data.invoices.unshift(invoice);
  await save(data); res.status(201).json(invoice);
});
app.delete('/api/invoices/:id', async (req, res) => { const data = await db(); data.invoices = data.invoices.filter(item => item.id !== req.params.id); await save(data); res.status(204).end(); });

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(root, 'dist')));
  app.use((_, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
}
const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Happy Group API running on http://localhost:${port}`));
