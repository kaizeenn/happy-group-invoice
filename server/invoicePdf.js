import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const defaultBankAccounts = 'BCA 846-598-6111\nMANDIRI 137.004747.1111\nA/N ARI HARYADI';

let browserPromise;
let renderQueue = Promise.resolve();

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const linesHtml = value => escapeHtml(value || '-').replaceAll('\n', '<br>');
const money = value => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0)).replaceAll('\u00a0', ' ');
const dateId = value => {
  const date = new Date(`${String(value || '').slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(date);
};
const statusOf = invoice => {
  const total = invoice.items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
  const paid = invoice.paymentStatus === 'lunas' ? total : invoice.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  return total > 0 && total - paid < 1 ? 'LUNAS' : 'BELUM LUNAS';
};
const wrapCount = (value, maxChars) => String(value || '-').split('\n').reduce((total, line) => total + Math.max(1, Math.ceil(line.length / maxChars)), 0);
const itemHeight = item => Math.max(14, 5 + (wrapCount(item.description, 52) + (item.detail ? wrapCount(item.detail, 62) : 0) + (item.note ? wrapCount(item.note, 62) : 0)) * 4);

function splitItems(invoice, bankAccounts) {
  const addressLines = wrapCount(`Kantor: ${invoice.companyAddress || '-'}`, 48);
  const headerRuleY = 20 + addressLines * 3.4 + 2 + 6;
  const pages = [];
  let items = [];
  let y = headerRuleY + 48;
  for (const item of invoice.items || []) {
    const height = itemHeight(item);
    if (items.length && y + height > 197) {
      pages.push({ items, continuation: pages.length > 0 });
      items = [];
      y = 48;
    }
    items.push(item);
    y += height;
  }
  if (items.length || !pages.length) pages.push({ items, continuation: pages.length > 0 });

  const termsLines = wrapCount(invoice.terms || '-', 52);
  const bankLines = String(bankAccounts || defaultBankAccounts).split('\n').map(line => line.trim()).filter(Boolean);
  const contactsEnd = 12 + termsLines * 3.6 + 8 + 8 + bankLines.length * 3.4;
  const signatureOffset = Math.max(28 + termsLines * 3.6, 54);
  const closingHeight = 8 + Math.max(contactsEnd, signatureOffset + 52);
  const lastPage = pages.at(-1);
  const usedY = y;
  if (usedY + closingHeight > 284) pages.push({ items: [], continuation: true, closing: true });
  else lastPage.closing = true;
  return pages;
}

const imageData = async filePath => {
  const buffer = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const type = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${type};base64,${buffer.toString('base64')}`;
};

function itemMarkup(item) {
  const quantity = Number(item.quantity || 0);
  return `<div class="table-row">
    <div><b>${escapeHtml(item.description || '-')}</b>${item.detail ? `<p>${linesHtml(item.detail)}</p>` : ''}${item.note ? `<p>${linesHtml(item.note)}</p>` : ''}</div>
    <span>${money(item.price)}</span>
    <span>${escapeHtml(quantity)} ${escapeHtml(item.unit || 'Unit')}</span>
    <b>${money(Number(item.price || 0) * quantity)}</b>
  </div>`;
}

function closingMarkup(invoice, bankAccounts, signatureData, paidData, showSignature) {
  const total = invoice.items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
  const paid = invoice.paymentStatus === 'lunas' ? total : invoice.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const due = Math.max(0, total - paid);
  const isPaid = statusOf(invoice) === 'LUNAS';
  const banks = String(bankAccounts || defaultBankAccounts).split('\n').map(line => line.trim()).filter(Boolean);
  return `<div class="closing">
    <div class="left-column">
      <section class="terms"><span>TERMS</span><p>${linesHtml(invoice.terms || '-')}</p></section>
      <section class="bank"><span>BANK ACCOUNT</span><p>${banks.map(line => escapeHtml(line)).join('<br>')}</p></section>
    </div>
    <div class="payment-column">
      <div class="summary">
        <div><span>Total</span><b>${money(total)}</b></div>
        <div><span>Paid</span><b>${money(paid)}</b></div>
        <div class="due"><span>Amount Due (IDR)</span><b>${money(due)}</b></div>
      </div>
      <div class="paid-slot">${isPaid ? `<img src="${paidData}" alt="PAID">` : ''}</div>
      <div class="signature">
        <span>Hormat kami,</span>
        <b>PT. HAPPY TRANS HARYADI</b>
        ${showSignature ? `<img src="${signatureData}" alt="Tanda tangan">` : '<div class="signature-placeholder"></div>'}
        <b>Kiki Saputri</b>
        <small>Finance</small>
      </div>
    </div>
  </div>`;
}

export async function renderInvoiceHtml(invoice, bankAccounts, assets, options = {}) {
  const pages = splitItems(invoice, bankAccounts);
  const showSignature = options.showSignature === true;
  const pageMarkup = pages.map((page, index) => {
    const header = page.continuation
      ? `<div class="continuation-header"><img src="${assets.logo}" alt="Happy Group"><div><b>INVOICE</b><span>${escapeHtml(invoice.number)}</span></div></div>`
      : `<div class="top"><img src="${assets.logo}" alt="Happy Group"><div class="company"><b>PT. HAPPY TRANS HARYADI</b><p>Kantor: ${linesHtml(invoice.companyAddress || '-')}</p><p>0811 2867 917</p></div></div>
         <div class="rule"></div>
         <div class="bill"><div><span>BILL TO</span><b>${escapeHtml(invoice.customer || '-')}</b>${invoice.customerCompany ? `<p>${linesHtml(invoice.customerCompany)}</p>` : ''}${invoice.customerPhone ? `<p>${escapeHtml(invoice.customerPhone)}</p>` : ''}</div><div class="meta"><h1>INVOICE</h1><p>Invoice #: <b>${escapeHtml(invoice.number)}</b></p><p>Tanggal: <b>${dateId(invoice.issueDate)}</b></p></div></div>`;
    return `<section class="invoice-page ${page.continuation ? 'continuation' : ''}">${header}${page.items.length ? `<div class="table"><div class="table-head"><span>ITEMS / DESKRIPSI</span><span>HARGA</span><span>QTY</span><span>TOTAL</span></div>${page.items.map(itemMarkup).join('')}</div>` : ''}${page.closing ? closingMarkup(invoice, bankAccounts, assets.signature, assets.paid, showSignature) : ''}</section>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(invoice.number)}</title><style>
    @page{size:A4;margin:0}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff;color:#2e2a28;font-family:Arial,Helvetica,sans-serif}
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .invoice-page{position:relative;width:${A4_WIDTH_MM}mm;height:${A4_HEIGHT_MM}mm;overflow:hidden;padding:11.5mm 12.5mm 13mm;page-break-after:always;break-after:page;font-size:10px}
    .invoice-page:last-child{page-break-after:auto;break-after:auto}
    img{display:block}
    .top,.continuation-header{display:flex;align-items:flex-start;justify-content:space-between}
    .top>img{width:185px;height:auto}.company{text-align:right;width:300px}.company b{font-size:15px}.company p{margin:3px 0;font-size:10px;line-height:1.22}
    .rule{height:4px;background:#ef2624;margin:25px 0 28px}.bill{display:grid;grid-template-columns:1fr auto;min-height:98px}.bill span,.terms>span,.bank>span{display:block;color:#ef2624;font-weight:700;font-size:12px;letter-spacing:1.2px;margin-bottom:12px}.bill>b{display:block;font-size:19px}.bill>div>b{display:block;font-size:19px}.bill p{margin:2px 0;font-size:11px}.meta{text-align:right}.meta h1{color:#ef2624;font-size:34px;margin:0 0 11px}.meta p{font-size:11px;margin:3px 0}
    .table{border:1px solid #d7d3d1}.table-head,.table-row{display:grid;grid-template-columns:minmax(0,1fr) 100px 90px 110px;gap:0;padding:13px 11px;align-items:start}.table-head{background:#e8e8e8;color:#292624;font-weight:700;font-size:12px}.table-head span:not(:first-child),.table-row>span,.table-row>b{text-align:right}.table-head span:first-child{text-align:center}.table-row{min-height:70px;border-top:1px solid #bdbdbd;font-size:12px}.table-row>div b{display:block;font-size:15px}.table-row p{font-size:12px;margin:3px 0;white-space:pre-line;overflow-wrap:anywhere}
    .closing{display:grid;grid-template-columns:minmax(0,1fr) 265px;gap:30px;margin-top:22px}.terms p{font-size:12px;line-height:1.5;margin:0;white-space:pre-line}.bank{margin-top:24px}.bank p{font-size:13px;line-height:1.4;margin:0;white-space:pre-line}.summary{border:1px solid #a9a9a9;padding:18px}.summary>div{display:flex;justify-content:space-between;font-size:12px;margin:6px 0}.summary .due{font-size:15px;margin-top:15px;padding-top:15px;border-top:1px solid #999;color:#ef2624;font-weight:700}.summary .due b{color:#ef2624}.paid-slot{height:84px;display:flex;align-items:flex-start;justify-content:center;padding-top:8px}.paid-slot img{width:160px;height:auto}.signature{text-align:center;margin:0;padding-right:4px}.signature>span,.signature>b,.signature>small{display:block}.signature>span{font-size:15px}.signature>b{font-size:14px}.signature>small{font-size:13px}.signature img{width:210px;height:92px;object-fit:contain;margin:7px auto -2px}.signature-placeholder{height:92px;width:210px;margin:7px auto -2px}
    .continuation{padding-top:13mm}.continuation-header{border-bottom:4px solid #ef2624;padding-bottom:8px;margin-bottom:28px}.continuation-header img{width:145px}.continuation-header>div{text-align:right;display:grid;gap:3px}.continuation-header b{font-size:24px;color:#ef2624}.continuation-header span{font-size:10px}
  </style></head><body>${pageMarkup}</body></html>`;
}

export async function createInvoicePdf(html) {
  renderQueue = renderQueue.catch(() => {}).then(async () => {
    if (!browserPromise) {
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || [
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
        '/usr/bin/google-chrome'
      ].find(candidate => existsSync(candidate));
      browserPromise = puppeteer.launch({
        ...(executablePath ? { executablePath } : {}),
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none']
      });
    }
    const browser = await browserPromise;
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map(image => image.decode?.().catch(() => {}) || Promise.resolve()));
      });
      return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
    } finally {
      await page.close();
    }
  });
  return renderQueue;
}

export async function loadInvoicePdfAssets(root) {
  const imageRoot = path.join(root, 'public', 'assets', 'images');
  const [logo, signature, paid] = await Promise.all([
    imageData(path.join(imageRoot, 'happy_group_logo.png')),
    imageData(path.join(imageRoot, 'signature_kiki_stamp.png')),
    imageData(path.join(imageRoot, 'paid_stamp.png'))
  ]);
  return { logo, signature, paid };
}

export async function closeInvoicePdfBrowser() {
  if (!browserPromise) return;
  const browser = await browserPromise.catch(() => null);
  browserPromise = undefined;
  if (browser) await browser.close();
}
