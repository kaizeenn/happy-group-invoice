import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Plus, ReceiptText, Building2, MapPin, Pencil, Trash2, X, Download, CheckCircle2, WalletCards, ChevronRight, FileText, Eye, Share2, ArrowRight, ClipboardList, Search, Bell, AlertTriangle, Loader2, Combine } from 'lucide-react';
import './styles.css';

// Production is served by Express/Caddy on the same origin. Vite development keeps
// its API on port 4000 unless an explicit VITE_API_URL is supplied.
const API = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? `${window.location.protocol}//${window.location.hostname}:4000/api` : `${window.location.origin}/api`);
const IDR = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const dateId = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' });
const today = () => new Date().toISOString().slice(0, 10);
// Some mobile / embedded browsers do not expose crypto.randomUUID(). A fallback
// keeps the invoice form usable while still generating collision-resistant IDs.
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
const serviceGroups = [
  { label: 'MPV', options: ['Avanza', 'Innova Reborn', 'Innova Zenix'] },
  { label: 'Hiace', options: ['Hiace Commuter 14 Seat', 'Hiace Premio 14 Seat', 'Hiace Luxury 8 Seat'] },
  { label: 'Elf', options: ['Elf Long 19 Seat', 'Elf Jumbo 18 Seat'] },
  { label: 'Medium Bus', options: ['Medium Bus', 'Medium Bus 29 Seat', 'Medium Bus 31 Seat', 'Medium Bus 33 Seat', 'Medium Bus 35 Seat'] },
  { label: 'Medium Long', options: ['Medium Long', 'Medium Long 39 Seat', 'Medium Long 41 Seat'] },
  { label: 'Bigbus', options: ['Bigbus', 'Bigbus 45 Seat', 'Bigbus 50 Seat', 'Bigbus 59 Seat', 'Bigbus 30 Seat Legrest'] },
  { label: 'CDE', options: ['CDE', 'CDE Bak', 'CDE Box'] },
  { label: 'CDD', options: ['CDD', 'CDD Bak', 'CDD Box'] },
  { label: 'CDD Long', options: ['CDD Long', 'CDD Long Bak', 'CDD Long Box'] },
  { label: 'Fuso', options: ['Fuso', 'Fuso Bak', 'Fuso Box'] },
  { label: 'Tronton', options: ['Tronton', 'Tronton Bak', 'Tronton Box'] },
  { label: 'Wingbox', options: ['Wingbox Threeway'] }
];
const serviceTypes = serviceGroups.flatMap(group => group.options);
// Satuan bebas: pilih dari daftar saran atau ketik sendiri ("custom unit").
const unitOptions = ['Unit', 'Hari', 'Trip', 'Rit', 'Orang', 'Seat', 'Paket', 'Bulan', 'Jam', 'Ton'];
const unitOf = item => String(item?.unit || 'Unit').trim() || 'Unit';
const invoiceNumber = (invoices = [], issueDate = today()) => {
  const stamp = issueDate.replaceAll('-', '');
  const used = new Set(invoices.map(invoice => {
    const match = String(invoice.number || '').match(new RegExp(`^INV-${stamp}-(\\d{3})$`));
    return match ? Number(match[1]) : null;
  }).filter(Boolean));
  for (let sequence = 1; sequence <= 999; sequence += 1) {
    if (!used.has(sequence)) return `INV-${stamp}-${String(sequence).padStart(3, '0')}`;
  }
  throw new Error('Nomor invoice untuk tanggal ini sudah mencapai batas 999.');
};
const emptyInvoice = (addresses, invoices) => ({ id: uid(), number: invoiceNumber(invoices), issueDate: today(), companyAddress: addresses[0]?.fullAddress || '', customer: '', customerCompany: '', customerPhone: '', paymentStatus: 'auto', items: [], payments: [], terms: 'DP 50%\nPelunasan H-3 sebelum tanggal keberangkatan\nInclude Unit, BBM, dan Driver.\nExclude Pajak, Parkir, Tol, Makan dan Tip Crew.', notes: '' });
const totalOf = invoice => invoice.items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
const recordedPaid = invoice => invoice.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
const paidOf = invoice => invoice.paymentStatus === 'lunas' ? totalOf(invoice) : recordedPaid(invoice);
const dueOf = invoice => Math.max(0, totalOf(invoice) - paidOf(invoice));
const statusOf = invoice => dueOf(invoice) < 1 && totalOf(invoice) > 0 ? 'LUNAS' : paidOf(invoice) > 0 || invoice.paymentStatus === 'dp' ? 'DP / SEBAGIAN' : 'BELUM LUNAS';
const getOverdueDays = (invoice, baseDate = new Date()) => {
  if (!invoice || statusOf(invoice) === 'LUNAS') return 0;
  if (!invoice.issueDate) return 0;
  const issue = new Date(`${invoice.issueDate}T00:00:00`);
  if (Number.isNaN(issue.getTime())) return 0;
  const diffTime = baseDate.getTime() - issue.getTime();
  const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
};
const isOverdue = invoice => getOverdueDays(invoice) > 30;
// PNG dengan transparansi di-embed jsPDF tanpa kompresi efektif (bisa >10 MB).
// Matte putih + JPEG membuat jsPDF menyimpannya sebagai DCTDecode sehingga file kecil.
const jpegFromPng = (src, maxWidth = 800, quality = .85) => new Promise(resolve => { const img = new Image(); img.onload = () => { const scale = Math.min(1, maxWidth / img.naturalWidth); const canvas = document.createElement('canvas'); canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale); const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL('image/jpeg', quality)); }; img.src = src; });

class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('Happy Group app error:', error); }
  reset = () => { localStorage.removeItem('happy-session'); window.location.href = '/'; };
  render() { return this.state.failed ? <main className="recovery-page"><section><img src="/assets/images/happy_group_logo.png"/><h1>Halaman perlu dimuat ulang</h1><p>Data sesi lama atau cache browser membuat halaman tidak dapat ditampilkan. Reset akan menghapus sesi login di browser ini, bukan data invoice di server.</p><button className="primary" onClick={this.reset}>Reset & buka aplikasi</button></section></main> : this.props.children; }
}

function App() {
  const [data, setData] = useState({ addresses: [], invoices: [], settings: { bankAccounts: 'BCA 846-598-6111\nMANDIRI 137.004747.1111\nA/N ARI HARYADI' } });
  const [session, setSession] = useState(() => { try { return JSON.parse(localStorage.getItem('happy-session')); } catch { return null; } });
  const [tab, setTab] = useState('dashboard'); const [editor, setEditor] = useState(null); const [addressModal, setAddressModal] = useState(false); const [bankModal, setBankModal] = useState(false); const [preview, setPreview] = useState(null); const [paymentInvoice, setPaymentInvoice] = useState(null); const [loading, setLoading] = useState(Boolean(session));
  const [invoiceFilter, setInvoiceFilter] = useState('all');
  const [showNotif, setShowNotif] = useState(false);
  const notifRef = useRef(null);

  const request = async (path, options = {}) => { const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}), ...(options.headers || {}) } }); const body = response.status === 204 ? null : await response.json(); if (!response.ok) throw new Error(body?.message || 'Permintaan gagal.'); return body; };
  const load = async () => { setLoading(true); try { setData(await request('/data')); } catch (error) { if (error.message.includes('Sesi')) { localStorage.removeItem('happy-session'); setSession(null); } } finally { setLoading(false); } };
  // Load data whenever a user logs in. Previously this ran only on the first
  // page mount, so a fresh login incorrectly displayed an empty history.
  useEffect(() => { if (session) load(); }, [session]);
  const login = async (username, password) => { const result = await fetch(`${API}/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username,password}) }).then(async r => { const body=await r.json(); if(!r.ok) throw new Error(body.message); return body; }); localStorage.setItem('happy-session', JSON.stringify(result)); setSession(result); };
  const logout = () => { localStorage.removeItem('happy-session'); setSession(null); setData({addresses:[], invoices:[], settings: { bankAccounts: 'BCA 846-598-6111\nMANDIRI 137.004747.1111\nA/N ARI HARYADI' }}); };
  const saveInvoice = async invoice => { try { const saved = await request('/invoices', { method:'POST', body:JSON.stringify(invoice) }); setData(prev => ({...prev, invoices:[saved, ...prev.invoices.filter(item => item.id !== saved.id)]})); setEditor(null); setPreview(saved); } catch(error) { alert(error.message); } };
  const removeInvoice = async id => { if (!confirm('Hapus invoice ini?')) return; try { await request(`/invoices/${id}`, {method:'DELETE'}); setData(prev => ({...prev,invoices:prev.invoices.filter(item=>item.id!==id)})); } catch(error) { alert(error.message); } };
  const saveAddresses = async addresses => { try { await request('/data', {method:'PUT',body:JSON.stringify({...data,addresses})}); setData(prev=>({...prev,addresses})); setAddressModal(false); } catch(error) { alert(error.message); } };
  const saveBankAccounts = async bankAccounts => { try { const saved = await request('/settings', { method:'PUT', body:JSON.stringify({ bankAccounts }) }); setData(prev => ({ ...prev, settings: saved })); setBankModal(false); } catch(error) { alert(error.message); } };
  const createUser = async user => { const created = await request('/users', { method:'POST', body:JSON.stringify(user) }); return created; };
  const totals = useMemo(() => ({ total: data.invoices.reduce((a, i) => a + totalOf(i), 0), paid: data.invoices.reduce((a, i) => a + paidOf(i), 0), due: data.invoices.reduce((a, i) => a + dueOf(i), 0) }), [data]);
  const overdueInvoices = useMemo(() => data.invoices.filter(isOverdue).sort((a, b) => getOverdueDays(b) - getOverdueDays(a)), [data.invoices]);

  useEffect(() => {
    const handleClickOutside = event => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotif(false);
      }
    };
    if (showNotif) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showNotif]);

  if (!session) return <Login onLogin={login}/>; if (loading) return <div className="loading">Memuat Happy Group Invoice…</div>;
  const admin = ['admin', 'super_admin'].includes(session.user.role); const superAdmin = session.user.role === 'super_admin';
  return <main className="shell"><aside><img src="/assets/images/happy_group_logo.png" className="side-logo"/><p className="tagline">INVOICE MANAGEMENT</p><nav>{[['dashboard', ReceiptText, 'Beranda'], ['invoices', ReceiptText, 'Invoice'], ...(admin ? [['company', Building2, 'Perusahaan'], ['users', WalletCards, 'Pengguna']] : [])].map(([id, Icon, label]) => <button className={tab === id ? 'active' : ''} onClick={() => setTab(id)} key={id}><Icon size={19}/>{label}</button>)}</nav><div className="user-panel"><b>{session.user.name}</b><span>{superAdmin ? 'Super Admin' : admin ? 'Administrator' : 'User'}</span><button onClick={logout}>Keluar</button></div></aside><section className="content"><header><div><p className="eyebrow">PT. HAPPY TRANS HARYADI</p><h1>{tab === 'dashboard' ? 'Ringkasan bisnis' : tab === 'invoices' ? 'Semua invoice' : tab === 'users' ? 'Pengaturan pengguna' : 'Profil perusahaan'}</h1></div><div className="header-actions"><div className="notif-wrapper" ref={notifRef}><button type="button" className={`notif-btn ${overdueInvoices.length ? 'has-badge' : ''}`} onClick={() => setShowNotif(prev => !prev)} title={overdueInvoices.length ? `${overdueInvoices.length} invoice melewati batas 30 hari` : 'Notifikasi pengingat'} aria-label="Pengingat penagihan"><Bell size={19}/>{overdueInvoices.length > 0 && <span className="notif-badge">{overdueInvoices.length}</span>}</button>{showNotif && <div className="notif-popover"><div className="notif-header"><div className="notif-title"><AlertTriangle size={16}/><b>Pengingat Penagihan (&gt;30 Hari)</b></div><button type="button" className="notif-close" onClick={() => setShowNotif(false)} aria-label="Tutup"><X size={15}/></button></div>{overdueInvoices.length === 0 ? <div className="notif-empty"><CheckCircle2 size={30} color="#168246"/><p>Tidak ada invoice yang melewati 30 hari.</p></div> : <><div className="notif-summary-bar"><span><b>{overdueInvoices.length}</b> invoice perlu ditagih</span><button type="button" onClick={() => { setInvoiceFilter('overdue'); setTab('invoices'); setShowNotif(false); }}>Lihat semua <ArrowRight size={13}/></button></div><div className="notif-list">{overdueInvoices.slice(0, 6).map(inv => { const days = getOverdueDays(inv); return <div key={inv.id} className="notif-item" onClick={() => { setPreview(inv); setShowNotif(false); }}><div className="notif-item-top"><b>{inv.customer || 'Pelanggan'}</b><span className="notif-tag">Lewat {days} hr</span></div><div className="notif-item-sub"><span>{inv.number}</span><b className="notif-due">{IDR.format(dueOf(inv))}</b></div></div>; })}</div></>}</div>}</div><button className="header-create" onClick={() => setEditor(emptyInvoice(data.addresses, data.invoices))}><Plus size={18}/> Buat Invoice</button></div></header>{tab === 'dashboard' && <Dashboard totals={totals} invoices={data.invoices} open={setEditor} preview={setPreview} showAll={() => { setInvoiceFilter('all'); setTab('invoices'); }} onFilterOverdue={() => { setInvoiceFilter('overdue'); setTab('invoices'); }}/>} {tab === 'invoices' && <Invoices invoices={data.invoices} preview={setPreview} remove={removeInvoice} filter={invoiceFilter} onFilterChange={setInvoiceFilter}/>} {tab === 'company' && admin && <Company addresses={data.addresses} openAddresses={() => setAddressModal(true)} bankAccounts={data.settings?.bankAccounts} openBankAccounts={() => setBankModal(true)}/>} {tab === 'users' && admin && <Users request={request} createUser={createUser} actorRole={session.user.role}/>}</section>{editor && <InvoiceEditor initial={editor} addresses={data.addresses} onClose={() => setEditor(null)} onSave={saveInvoice}/>} {preview && <PdfPreview invoice={preview} bankAccounts={data.settings?.bankAccounts} onClose={() => setPreview(null)} onEdit={() => { setEditor(preview); setPreview(null); }} onAddPayment={() => { setPaymentInvoice(preview); setPreview(null); }}/>} {paymentInvoice && <PaymentModal invoice={paymentInvoice} onClose={() => setPaymentInvoice(null)} onSave={payment => { saveInvoice({ ...paymentInvoice, payments: [...paymentInvoice.payments, payment] }); setPaymentInvoice(null); }}/>} {addressModal && <AddressSettings addresses={data.addresses} onClose={() => setAddressModal(false)} onSave={saveAddresses}/>} {bankModal && <BankSettingsModal initial={data.settings?.bankAccounts} onClose={() => setBankModal(false)} onSave={saveBankAccounts}/>}</main>;
}

function Login({ onLogin }) { const [username,setUsername]=useState(''); const [password,setPassword]=useState(''); const [error,setError]=useState(''); const [busy,setBusy]=useState(false); const submit=async e=>{e.preventDefault();setBusy(true);setError('');try{await onLogin(username,password);}catch(err){setError(err.message);}finally{setBusy(false);}}; return <main className="login-page"><form className="login-card" onSubmit={submit}><img src="/assets/images/happy_group_logo.png"/><p className="eyebrow">HAPPY GROUP INVOICE</p><h1>Masuk ke akun Anda</h1><p className="login-copy">Gunakan username dan password yang diberikan administrator.</p><label>Username<input value={username} onChange={e=>setUsername(e.target.value)} required autoFocus placeholder="Username"/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="Password"/></label>{error&&<p className="login-error">{error}</p>}<button className="primary" disabled={busy}>{busy?'Memeriksa akun…':'Masuk'}</button></form></main> }
function Dashboard({ totals, invoices, open, preview, showAll, onFilterOverdue }) {
  const overdueInvoices = useMemo(() => invoices.filter(isOverdue), [invoices]);
  const overdueDue = useMemo(() => overdueInvoices.reduce((sum, inv) => sum + dueOf(inv), 0), [overdueInvoices]);
  return <>
    {overdueInvoices.length > 0 && (
      <div className="overdue-banner" onClick={onFilterOverdue} role="button" tabIndex={0}>
        <div className="overdue-banner-icon"><AlertTriangle size={22}/></div>
        <div className="overdue-banner-info">
          <b>Peringatan: {overdueInvoices.length} Invoice Melewati Batas 30 Hari!</b>
          <p>Total tagihan tertunggak: <strong>{IDR.format(overdueDue)}</strong>. Klik di sini untuk melihat daftar tagihan.</p>
        </div>
        <div className="overdue-banner-action">Lihat tagihan <ArrowRight size={16}/></div>
      </div>
    )}
    <div className="hero"><div><p>RINGKASAN TAGIHAN AKTIF</p><strong>{IDR.format(totals.total)}</strong><div className="hero-values"><span>Sudah diterima <b>{IDR.format(totals.paid)}</b></span><span>Perlu ditagih <b>{IDR.format(totals.due)}</b></span></div></div><div className="hero-guide"><ClipboardList size={30}/><b>Mulai dari invoice baru</b><span>Isi pelanggan, layanan, lalu simpan.</span></div></div>
    <div className="stats"><Stat label="Invoice lunas" value={invoices.filter(i => statusOf(i) === 'LUNAS').length} tone="green"/><Stat label="Perlu ditindaklanjuti" value={invoices.filter(i => statusOf(i) !== 'LUNAS').length} tone="red"/></div>
    <div className="section-title"><div><p className="eyebrow">AKTIVITAS TERBARU</p><h2>Invoice terbaru</h2></div><button onClick={showAll}>Buka riwayat <ArrowRight size={16}/></button></div>
    <InvoiceTable invoices={invoices.slice(0, 5)} open={open} preview={preview}/>
  </>;
}
function Stat({ label, value, tone }) { return <div className={`stat ${tone}`}><span>{label}</span><b>{value}</b></div> }
function Invoices({ invoices, preview, remove, filter = 'all', onFilterChange }) {
  const [search, setSearch] = useState('');
  const keyword = search.trim().toLocaleLowerCase('id-ID');

  const overdueCount = useMemo(() => invoices.filter(isOverdue).length, [invoices]);
  const unpaidCount = useMemo(() => invoices.filter(i => statusOf(i) !== 'LUNAS').length, [invoices]);
  const paidCount = useMemo(() => invoices.filter(i => statusOf(i) === 'LUNAS').length, [invoices]);

  const filtered = useMemo(() => {
    return invoices.filter(invoice => {
      if (filter === 'overdue') return isOverdue(invoice);
      if (filter === 'unpaid') return statusOf(invoice) !== 'LUNAS';
      if (filter === 'paid') return statusOf(invoice) === 'LUNAS';
      return true;
    });
  }, [invoices, filter]);

  const visibleInvoices = keyword ? filtered.filter(invoice => `${invoice.customer || ''} ${invoice.number || ''}`.toLocaleLowerCase('id-ID').includes(keyword)) : filtered;

  return <>
    <div className="history-intro">
      <div>
        <p className="eyebrow">RIWAYAT INVOICE</p>
        <h2>Kelola tagihan Anda</h2>
        <p>{invoices.length ? 'Cari berdasarkan nama pelanggan atau nomor invoice, gunakan filter status, lalu klik invoice untuk melihat detail.' : 'Buat invoice pertama untuk mulai mencatat tagihan.'}</p>
      </div>
    </div>
    <div className="invoice-toolbar">
      <div className="invoice-filters">
        <button type="button" className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => onFilterChange('all')}>Semua ({invoices.length})</button>
        <button type="button" className={`filter-btn ${filter === 'unpaid' ? 'active' : ''}`} onClick={() => onFilterChange('unpaid')}>Belum Lunas ({unpaidCount})</button>
        <button type="button" className={`filter-btn ${filter === 'paid' ? 'active' : ''}`} onClick={() => onFilterChange('paid')}>Lunas ({paidCount})</button>
        <button type="button" className={`filter-btn overdue ${filter === 'overdue' ? 'active' : ''}`} onClick={() => onFilterChange('overdue')}>
          <AlertTriangle size={14}/> &gt; 30 Hari ({overdueCount})
        </button>
      </div>
      <div className="invoice-search">
        <Search size={19}/>
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari nama pelanggan atau nomor invoice…" aria-label="Cari invoice"/>
        {search && <button type="button" onClick={() => setSearch('')} aria-label="Hapus pencarian"><X size={16}/></button>}
        <span>{keyword ? `${visibleInvoices.length} ditemukan` : `${filtered.length} invoice`}</span>
      </div>
    </div>
    {keyword && !visibleInvoices.length ? (
      <div className="empty search-empty">
        <Search size={38}/>
        <h3>Invoice tidak ditemukan</h3>
        <p>Tidak ada invoice yang cocok dengan “{search}” pada filter ini.</p>
        <button onClick={() => setSearch('')}>Hapus pencarian</button>
      </div>
    ) : filter === 'overdue' && !visibleInvoices.length ? (
      <div className="empty">
        <CheckCircle2 size={38} color="#168246"/>
        <h3>Tidak ada invoice &gt; 30 hari</h3>
        <p>Semua tagihan tertagih tepat waktu atau sudah lunas.</p>
        <button onClick={() => onFilterChange('all')}>Tampilkan semua invoice</button>
      </div>
    ) : (
      <InvoiceTable invoices={visibleInvoices} preview={preview} remove={remove}/>
    )}
  </>;
}
function InvoiceTable({ invoices, open, preview, remove }) {
  if (!invoices.length) return <div className="empty"><ReceiptText size={38}/><h3>Belum ada invoice</h3><p>Buat invoice pertama Anda untuk mulai mencatat tagihan.</p></div>;
  return <div className="invoice-list">{invoices.map(invoice => {
    const isPaid = statusOf(invoice) === 'LUNAS';
    const overdueDays = getOverdueDays(invoice);
    const overdue = overdueDays > 30;
    return <article className={`invoice-card ${overdue ? 'is-overdue' : ''}`} key={invoice.id} onClick={() => preview(invoice)}>
      <div className={`history-mark ${isPaid ? 'done' : overdue ? 'overdue' : ''}`}>{isPaid ? <CheckCircle2 size={21}/> : overdue ? <AlertTriangle size={20}/> : <ReceiptText size={20}/>}</div>
      <div className="invoice-info"><h3>{invoice.customer || 'Pelanggan belum diisi'}</h3><p>{invoice.number} · {dateId.format(new Date(invoice.issueDate))}</p><b className="history-total">{IDR.format(totalOf(invoice))}</b></div>
      <div className="history-actions">{overdue && <span className="pill overdue">🔴 Lewat {overdueDays} hr</span>}<span className={`pill ${isPaid ? 'paid' : ''}`}>{statusOf(invoice)}</span><span className="open-invoice">Buka <ArrowRight size={16}/></span>{remove && <button className="icon-danger" title="Hapus invoice" onClick={e => { e.stopPropagation(); remove(invoice.id); }}><Trash2 size={17}/></button>}</div>
    </article>;
  })}</div>
}
function Company({ addresses, openAddresses, bankAccounts, openBankAccounts }) {
  const currentBankAccounts = bankAccounts || 'BCA 846-598-6111\nMANDIRI 137.004747.1111\nA/N ARI HARYADI';
  return <><div className="company-brand"><img src="/assets/images/happy_group_logo.png"/><div><h2>PT. Happy Trans Haryadi</h2><p>Invoice dan pencatatan pembayaran transportasi dalam satu tempat.</p></div></div><div className="company-grid"><div className="company-card"><MapPin color="#e52322"/><h3>Data alamat kantor</h3><p>{addresses.length} alamat tersimpan. Gunakan alamat lengkap di setiap invoice.</p><button onClick={openAddresses}>Kelola alamat <ChevronRight size={16}/></button></div><div className="company-card"><WalletCards color="#e52322"/><h3>Rekening pembayaran</h3><p>{currentBankAccounts.split('\n').map((line, i) => <React.Fragment key={i}>{line}<br/></React.Fragment>)}</p><button onClick={openBankAccounts}>Kelola rekening <ChevronRight size={16}/></button></div></div></>;
}
 function Users({ request, createUser, actorRole }) { const isSuperAdmin = actorRole === 'super_admin'; const [users, setUsers] = useState([]); const [name, setName] = useState(''); const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [role, setRole] = useState('user'); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [resetUser, setResetUser] = useState(null); const load = async () => { try { setUsers(await request('/users')); } catch (error) { setMessage(error.message); } }; useEffect(() => { load(); }, []); const submit = async event => { event.preventDefault(); setBusy(true); setMessage(''); try { const created = await createUser({ name, username, password, role }); setUsers(previous => [...previous, created]); setName(''); setUsername(''); setPassword(''); setRole('user'); setMessage(`Akun @${created.username} berhasil dibuat.`); } catch (error) { setMessage(error.message); } finally { setBusy(false); } }; const remove = async user => { if (!confirm(`Hapus akun @${user.username}? Akun ini tidak dapat dipulihkan.`)) return; try { await request(`/users/${user.id}`, { method:'DELETE' }); setUsers(previous => previous.filter(item => item.id !== user.id)); setMessage(`Akun @${user.username} telah dihapus.`); } catch (error) { setMessage(error.message); } }; return <div className="user-settings"><div className="users-intro"><p className="eyebrow">ADMINISTRASI AKUN</p><h2>Pengguna & hak akses</h2><p>{isSuperAdmin ? 'Super Admin dapat membuat, mengubah password, atau menghapus akun Admin dan User. Akun yang masih memiliki invoice atau pembayaran perlu dibersihkan terlebih dahulu agar riwayat tetap konsisten.' : 'Admin dapat membuat, mengubah password, atau menghapus akun User biasa. Akun Admin dan Super Admin dilindungi dari penghapusan.'}</p></div><div className="user-tips"><span><b>Admin</b> akses penuh & pengaturan sistem</span><span><b>User</b> membuat dan mengelola invoice</span></div><div className="users-grid"><section className="user-create"><h3>Tambah pengguna</h3><form onSubmit={submit}><label>Nama<input value={name} onChange={event => setName(event.target.value)} required placeholder="Contoh: Admin Operasional"/></label><label>Username<input value={username} onChange={event => setUsername(event.target.value)} required placeholder="Contoh: operasional"/></label><label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} required minLength="8" placeholder="Minimal 8 karakter"/></label><label>Peran<select value={role} onChange={event => setRole(event.target.value)}><option value="user">User — kelola invoice</option>{isSuperAdmin && <option value="admin">Admin — akses penuh</option>}</select></label>{message && <p className="user-message">{message}</p>}<button className="primary" disabled={busy}><Plus size={17}/>{busy ? 'Membuat akun…' : 'Buat pengguna'}</button></form></section><section className="user-list"><div><h3>Akun terdaftar</h3><span>{users.length} pengguna</span></div>{users.map(user => <article key={user.id}><div className="user-avatar">{user.name.slice(0, 1).toUpperCase()}</div><div><b>{user.name}</b><p>@{user.username}</p></div><span className={`role-badge ${user.role}`}>{user.role === 'super_admin' ? 'Super Admin' : user.role === 'admin' ? 'Admin' : 'User'}</span>{(user.role === 'user' || (isSuperAdmin && user.role === 'admin')) && <div className="user-row-actions"><button title="Ubah password" onClick={() => setResetUser(user)}><Pencil size={15}/><span>Password</span></button><button className="delete-user" title="Hapus akun" onClick={() => remove(user)}><Trash2 size={15}/></button></div>}</article>)}</section></div>{resetUser && <PasswordModal user={resetUser} onClose={() => setResetUser(null)} onSave={async newPassword => { await request(`/users/${resetUser.id}/password`, { method:'PUT', body:JSON.stringify({password:newPassword}) }); setResetUser(null); setMessage(`Password @${resetUser.username} berhasil diubah.`); }}/>}</div> }
function PasswordModal({ user, onClose, onSave }) { const [password, setPassword] = useState(''); const [confirmPassword, setConfirmPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const submit = async event => { event.preventDefault(); if (password.length < 8) return setError('Password minimal 8 karakter.'); if (password !== confirmPassword) return setError('Konfirmasi password tidak sama.'); setBusy(true); try { await onSave(password); } catch (err) { setError(err.message); } finally { setBusy(false); } }; return <Modal><form onSubmit={submit}><div className="modal-header"><div><p className="eyebrow">UBAH PASSWORD</p><h2>@{user.username}</h2><p className="modal-subtitle">Masukkan password baru untuk akun {user.name}.</p></div><button type="button" className="close" onClick={onClose}><X/></button></div><label>Password baru<input type="password" autoFocus value={password} onChange={event => setPassword(event.target.value)} minLength="8" required placeholder="Minimal 8 karakter"/></label><label>Konfirmasi password<input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} minLength="8" required placeholder="Ketik ulang password"/></label>{error && <p className="login-error">{error}</p>}<div className="modal-footer"><span>Perubahan berlaku saat User login kembali.</span><button className="primary" disabled={busy}><CheckCircle2 size={17}/>{busy ? 'Menyimpan…' : 'Simpan password'}</button></div></form></Modal> }
function Modal({ children, wide = false, className = '' }) { return <div className="backdrop"><div className={`modal ${wide ? 'wide' : ''} ${className}`}>{children}</div></div> }
function InvoiceEditor({ initial, addresses, onClose, onSave }) { const [invoice, setInvoice] = useState(structuredClone(initial)); const [mergeBackup, setMergeBackup] = useState(null); const set = (key, value) => setInvoice(prev => ({ ...prev, [key]: value })); const editItem = (index, key, value) => setInvoice(prev => ({ ...prev, items: prev.items.map((item, i) => i === index ? { ...item, [key]: value } : item) })); const addItem = () => set('items', [...invoice.items, { id: uid(), description: 'Avanza', detail: '', note: '', price: '', quantity: 1, unit: 'Unit' }]);
  // Gabungkan beberapa item layanan menjadi satu baris dengan satu harga. Total awal
  // diisi dari jumlah tiap item, sehingga operator cukup mengubahnya bila ingin
  // menetapkan satu harga paket (mis. 3 item layanan menjadi Rp1.000.000).
  const mergeItems = () => { if (invoice.items.length < 2) return; const descriptions = [...new Set(invoice.items.map(item => String(item.description || '').trim()).filter(Boolean))]; const details = [...new Set(invoice.items.map(item => String(item.detail || '').trim()).filter(Boolean))]; const notes = [...new Set(invoice.items.map(item => String(item.note || '').trim()).filter(Boolean))]; const total = invoice.items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0); setMergeBackup(invoice.items); set('items', [{ id: uid(), description: descriptions.join(', '), detail: details.join(' \u2022 '), note: notes.join(' \u2022 '), price: String(total), quantity: 1, unit: unitOf(invoice.items[0]) }]); }; const restoreItems = () => { if (!mergeBackup) return; set('items', mergeBackup); setMergeBackup(null); }; const chooseDescription = (index, value) => { if (value !== '__custom__') return editItem(index, 'description', value); const current = invoice.items[index]?.description || ''; const custom = window.prompt('Nama custom item layanan', current); if (custom?.trim()) editItem(index, 'description', custom.trim()); }; const dpPayment = invoice.payments.find(payment => payment.note === 'DP'); const setDpAmount = value => { const amount = Number(String(value).replaceAll(/\D/g, '')); set('payments', dpPayment ? invoice.payments.map(payment => payment.id === dpPayment.id ? { ...payment, amount } : payment) : [...invoice.payments, { id: uid(), amount, date: today(), method: 'Transfer Bank', account: '', reference: '', note: 'DP' }]); }; const addPayment = () => set('payments', [...invoice.payments, { id: uid(), amount: dueOf(invoice), date: today(), method: 'Transfer Bank', account: '', reference: '', note: '' }]); const submit = e => { e.preventDefault(); if (!invoice.customer.trim() || !invoice.items.length || invoice.items.some(i => !Number(i.price))) return alert('Isi nama pelanggan dan minimal satu item dengan harga yang valid.'); if (invoice.paymentStatus === 'dp' && (!dpPayment || !Number(dpPayment.amount))) return alert('Masukkan nominal DP terlebih dahulu.'); onSave(invoice); };
 return <Modal wide className="invoice-editor-modal"><form onSubmit={submit}><div className="modal-header"><div><p className="eyebrow">{initial.updatedAt ? 'EDIT INVOICE' : 'INVOICE BARU'}</p><h2>{initial.updatedAt ? `Perbarui ${invoice.number}` : 'Buat invoice baru'}</h2><p className="modal-subtitle">Lengkapi 3 langkah berikut. Preview akan terbuka setelah disimpan.</p></div><button type="button" className="close" onClick={onClose} title="Batalkan"><X/></button></div><div className="workflow-steps"><span className="active"><b>1</b> Data pelanggan</span><span><b>2</b> Layanan</span><span><b>3</b> Pembayaran</span></div><div className="editor-grid"><FormGroup title="Informasi invoice"><label>Nomor invoice<input value={invoice.number} onChange={e => set('number', e.target.value)}/></label><label>Tanggal invoice<input type="date" value={invoice.issueDate} onChange={e => set('issueDate', e.target.value)}/></label><label>Alamat kantor<select value={invoice.companyAddress} onChange={e => set('companyAddress', e.target.value)}>{addresses.map(a => <option key={a.id} value={a.fullAddress}>{a.name}</option>)}</select></label></FormGroup><FormGroup title="Tagihkan kepada" className="customer-group"><label>Nama perusahaan pelanggan (opsional)<input value={invoice.customerCompany} onChange={e => set('customerCompany', e.target.value)} placeholder="Nama perusahaan (opsional)"/></label><label>Nama pelanggan<input autoFocus value={invoice.customer} onChange={e => set('customer', e.target.value)} placeholder="Nama pelanggan"/></label><label>WhatsApp / telepon<input value={invoice.customerPhone} onChange={e => set('customerPhone', e.target.value)}/></label></FormGroup></div><FormGroup title="2. Item layanan"><datalist id="unit-options">{unitOptions.map(unit => <option key={unit} value={unit}/>)}</datalist><div className="items">{invoice.items.map((item, index) => <div className="item-row" key={item.id}><select value={item.description} onChange={e => chooseDescription(index, e.target.value)}>{!serviceTypes.includes(item.description) && <option value={item.description}>{item.description}</option>}<option value="__custom__">+ Custom / unit lain…</option>{serviceGroups.map(group => <optgroup key={group.label} label={group.label}>{group.options.map(type => <option key={type}>{type}</option>)}</optgroup>)}</select><div className="route-fields"><input placeholder="Rute / detail" value={item.detail} onChange={e => editItem(index, "detail", e.target.value)}/></div><input className="money" placeholder="Harga (Rp)" value={item.price ? Number(item.price).toLocaleString('id-ID') : ''} onChange={e => editItem(index, 'price', e.target.value.replaceAll(/\D/g, ''))}/><input type="number" min="1" value={item.quantity} onChange={e => editItem(index, 'quantity', e.target.value)}/><input className="unit-field" list="unit-options" placeholder="Satuan" title="Satuan / unit bebas, mis. Hari, Trip, Rit" value={item.unit ?? ''} onChange={e => editItem(index, 'unit', e.target.value)}/><button type="button" className="icon-danger" onClick={() => set('items', invoice.items.filter((_, i) => i !== index))}><Trash2 size={17}/></button><textarea className="item-note" rows={3} placeholder="Catatan item (tampil di bawah item pada invoice)" value={item.note} onChange={e => editItem(index, 'note', e.target.value)}/></div>)}</div><button type="button" className="add-line" onClick={addItem}><Plus size={16}/> Tambah item layanan</button>{invoice.items.length > 1 && <button type="button" className="add-line merge-line" onClick={mergeItems}><Combine size={16}/> Gabung {invoice.items.length} item jadi 1 harga</button>}{mergeBackup && <button type="button" className="add-line undo-merge" onClick={restoreItems}><X size={15}/> Batalkan gabung</button>}<div className="total-line"><span>Total layanan</span><b>{IDR.format(totalOf(invoice))}</b></div></FormGroup><div className="editor-grid"><FormGroup title="3. Pembayaran"><label>Status pembayaran<select value={invoice.paymentStatus} onChange={e => set('paymentStatus', e.target.value)}><option value="auto">Otomatis dari pembayaran</option><option value="dp">DP / sebagian</option><option value="lunas">Lunas — tampilkan PAID</option></select></label>{invoice.paymentStatus === 'dp' && <label className="dp-amount">Nominal DP<input className="money" autoFocus value={dpPayment?.amount ? Number(dpPayment.amount).toLocaleString('id-ID') : ''} onChange={event => setDpAmount(event.target.value)} placeholder="Masukkan nominal DP (Rp)"/></label>}{invoice.payments.map((payment, index) => <div className="payment-row" key={payment.id}><span>{payment.note === 'DP' ? 'DP · ' : ''}{IDR.format(payment.amount)} · {payment.method}</span><button type="button" className="icon-danger" onClick={() => set('payments', invoice.payments.filter((_, i) => i !== index))}><X size={15}/></button></div>)}<button type="button" className="add-line" onClick={addPayment}><Plus size={16}/>{dpPayment ? 'Tambah pembayaran berikutnya' : `Catat pembayaran ${dueOf(invoice) > 0 ? IDR.format(dueOf(invoice)) : ''}`}</button></FormGroup><FormGroup title="Ketentuan & catatan (opsional)"><label>Terms / ketentuan<textarea value={invoice.terms} onChange={e => set('terms', e.target.value)}/></label><label>Catatan tambahan<textarea value={invoice.notes} onChange={e => set('notes', e.target.value)}/></label></FormGroup></div><div className="modal-footer"><div><span>Sisa tagihan</span><b>{IDR.format(dueOf(invoice))}</b></div><button type="submit" className="primary"><CheckCircle2 size={18}/> Simpan & lihat preview</button></div></form></Modal> }
function PaymentModal({ invoice, onClose, onSave }) {
  const [amount, setAmount] = useState(String(dueOf(invoice)));
  // Payment timestamp is recorded automatically so staff only enter the amount.
  const submit = event => { event.preventDefault(); const value = Number(String(amount).replaceAll(/\D/g, '')); if (value <= 0) return alert('Nominal pembayaran harus lebih dari Rp 0.'); onSave({ id: uid(), amount: value, date: today(), method: '', account: '', reference: '', note: '' }); };
  return <Modal><form onSubmit={submit}><div className="modal-header"><div><p className="eyebrow">CATAT PEMBAYARAN</p><h2>{invoice.number}</h2></div><button type="button" className="close" onClick={onClose}><X/></button></div><p className="payment-help">Sisa tagihan saat ini: <b>{IDR.format(dueOf(invoice))}</b></p><label>Nominal pembayaran<input className="money" autoFocus value={amount ? Number(String(amount).replaceAll(/\D/g, '')).toLocaleString('id-ID') : ''} onChange={event => setAmount(event.target.value.replaceAll(/\D/g, ''))} placeholder="0"/></label><div className="modal-footer"><span>Pembayaran akan langsung tercatat pada invoice ini.</span><button className="primary" type="submit"><WalletCards size={18}/> Simpan pembayaran</button></div></form></Modal>;
}

const previewWrapCount = (value, maxChars) => String(value || '-').split('\n').reduce((total, line) => total + Math.max(1, Math.ceil(line.length / maxChars)), 0);
const previewPdfItemHeight = item => {
  const titleLines = previewWrapCount(item.description, 52);
  const detailLines = item.detail ? previewWrapCount(item.detail, 62) : 0;
  const noteLines = item.note ? previewWrapCount(item.note, 62) : 0;
  return Math.max(14, 5 + (titleLines + detailLines + noteLines) * 4);
};
// Keep the visual preview paginated with the same row budget used by exportPdf.
// This makes long invoices read as A4 sheets instead of one stretched canvas and
// keeps the closing/signature block on the final sheet only.
const buildPreviewPages = (invoice, bankAccounts) => {
  const addressLines = previewWrapCount(`Kantor: ${invoice.companyAddress || '-'}`, 48);
  const headerRuleY = 20 + addressLines * 3.4 + 2 + 6;
  const pages = [];
  let pageItems = [];
  let y = headerRuleY + 48;
  for (const item of invoice.items) {
    const rowHeight = previewPdfItemHeight(item);
    if (pageItems.length && y + rowHeight > 197) {
      pages.push({ items: pageItems, continuation: pages.length > 0 });
      pageItems = [];
      y = 48;
    }
    pageItems.push(item);
    y += rowHeight;
  }
  if (pageItems.length || !pages.length) pages.push({ items: pageItems, continuation: pages.length > 0 });
  // The export moves the closing block to a fresh continuation page when the
  // final table page cannot fit it. Keep the same extra blank-data sheet here.
  const termsLines = previewWrapCount(invoice.terms || '-', 52);
  const bankLines = String(bankAccounts || 'BCA 846-598-6111\nMANDIRI 137.004747.1111\nA/N ARI HARYADI').split('\n').map(line => line.trim()).filter(Boolean);
  const termsEndRel = 12 + termsLines * 3.6;
  const contactsEndRel = termsEndRel + 8 + 8 + bankLines.length * 3.4;
  // Keep the reserved signature area compact while leaving enough room for
  // the digital mark or a hardfile signature.
  const signatureOffset = Math.max(28 + termsLines * 3.6, statusOf(invoice) === 'LUNAS' ? 54 : 32);
  const paidReserve = statusOf(invoice) === 'LUNAS' ? 88 : 0;
  const lowerHeight = 8 + Math.max(contactsEndRel, signatureOffset + 52, paidReserve);
  if (y + lowerHeight > 284) pages.push({ items: [], continuation: true, closing: true });
  else pages[pages.length - 1].closing = true;
  return pages;
};

function InvoicePreviewPage({ invoice, bankAccounts, items, continuation, closing, showSignature }) {
  return <div className={`pdf-paper mobile-invoice ${continuation ? 'preview-continuation' : ''}`}>
    {continuation ? <div className="preview-continuation-top"><img src="/assets/images/happy_group_logo.png"/><div><b>INVOICE</b><span>{invoice.number}</span></div></div> : <><div className="pdf-top"><img src="/assets/images/happy_group_logo.png"/><div className="pdf-company"><b>PT. HAPPY TRANS HARYADI</b><p>Kantor: {invoice.companyAddress}</p><p>0811 2867 917</p></div></div><div className="pdf-rule"/><div className="mobile-bill"><div><span>BILL TO</span><b>{invoice.customer || '-'}</b>{invoice.customerCompany && <p>{invoice.customerCompany}</p>}{invoice.customerPhone && <p>{invoice.customerPhone}</p>}</div><div className="invoice-meta"><h1>INVOICE</h1><p>Invoice #: <b>{invoice.number}</b></p><p>Tanggal: <b>{dateId.format(new Date(`${invoice.issueDate}T00:00:00`))}</b></p></div></div></>}
    {items.length > 0 && <div className="pdf-table"><div className="pdf-table-head"><span style={{textAlign: 'center'}}>ITEMS / DESKRIPSI</span><span>HARGA</span><span>QTY</span><span>TOTAL</span></div>{items.map(item => <div className="pdf-table-row" key={item.id}><div><b>{item.description}</b>{item.detail && <p>{item.detail}</p>}{item.note && <p>{item.note}</p>}</div><span>{IDR.format(Number(item.price || 0))}</span><span>{item.quantity} {unitOf(item)}</span><b>{IDR.format(Number(item.price || 0) * Number(item.quantity || 0))}</b></div>)}</div>}
    {closing && <div className="pdf-bottom"><div className="pdf-left-column"><div className="pdf-terms"><span>TERMS</span><p>{invoice.terms}</p></div><div className="pdf-bank"><span>BANK ACCOUNT</span><p>{(bankAccounts || 'BCA 8465-986-111 PT HAPPY TRANS HARYADI\nMANDIRI 137-00-4747-1111 PT HAPPY TRANS HARYADI\nBCA 8465-688-111 ARI HARYADI').split('\n').map((line, i) => <React.Fragment key={i}>{line}<br/></React.Fragment>)}</p></div></div><div className="pdf-payment-column"><div className="pdf-summary"><div><span>Total</span><b>{IDR.format(totalOf(invoice))}</b></div><div><span>Paid</span><b>{IDR.format(paidOf(invoice))}</b></div><div className="due"><span>Amount Due (IDR)</span><b>{IDR.format(dueOf(invoice))}</b></div></div><div className={`paid-slot ${statusOf(invoice) === 'LUNAS' ? 'is-paid' : 'is-unpaid'}`}>{statusOf(invoice) === 'LUNAS' && <img className="paid-stamp" src="/assets/images/paid_stamp.png"/>}</div><div className="pdf-sign"><div><span>Hormat kami,</span><b>PT. HAPPY TRANS HARYADI</b><img className={showSignature ? '' : 'signature-hidden'} src="/assets/images/signature_kiki_stamp.png"/><b>Kiki Saputri</b><small>Finance</small></div></div></div></div>}
  </div>;
}

function PdfPreview({ invoice, bankAccounts, onClose, onEdit, onAddPayment }) {
  const [busy, setBusy] = useState(false);
  const [showSignature, setShowSignature] = useState(true);
  const previewPaperRef = useRef(null);
  const previewPages = useMemo(() => buildPreviewPages(invoice, bankAccounts), [invoice, bankAccounts]);
  const canAddPayment = dueOf(invoice) > 0;
  useEffect(() => { const closeOnEscape = event => event.key === 'Escape' && onClose(); window.addEventListener('keydown', closeOnEscape); return () => window.removeEventListener('keydown', closeOnEscape); }, [onClose]);
  // Export through the exact DOM/CSS used by the preview. The browser print
  // engine creates selectable text and keeps every spacing decision identical.
  const exportPdf = async () => {
    setBusy(true);
    const cleanup = () => {
      document.body.classList.remove('invoice-printing');
      window.removeEventListener('afterprint', cleanup);
      setBusy(false);
    };
    try {
      await document.fonts?.ready;
      await Promise.all([...previewPaperRef.current?.querySelectorAll('img') || []].map(image => image.decode().catch(() => {})));
      document.body.classList.add('invoice-printing');
      // Print only the invoice sheet, not the dashboard behind the modal.
      const printFrame = document.createElement('iframe');
      printFrame.className = 'invoice-print-frame';
      printFrame.setAttribute('title', 'Invoice PDF');
      document.body.appendChild(printFrame);
      const frameDocument = printFrame.contentDocument;
      const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')]
        .map(node => node.outerHTML).join('');
      const printTitle = String(invoice.number || 'invoice').replace(/[^a-zA-Z0-9._-]+/g, '-');
      frameDocument.open();
      frameDocument.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=1200"><title>${printTitle}</title>${styles}<style>
        @page{size:A4;margin:0}
        html,body{margin:0!important;padding:0!important;background:#fff!important}
        .invoice-print-document,.invoice-print-document *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
        .invoice-print-document{display:block!important;width:210mm!important;margin:0 auto!important;background:#fff!important}
        .invoice-print-document .preview-sheet-frame{display:block!important;width:210mm!important;padding:0!important;border:0!important;background:#fff!important}
        .invoice-print-document .pdf-paper{width:210mm!important;height:297mm!important;min-height:297mm!important;margin:0!important;padding:11.5mm 12.5mm 13mm!important;border-radius:0!important;box-shadow:none!important;break-after:page;page-break-after:always;overflow:hidden!important}
        .invoice-print-document .mobile-invoice{display:flex!important;flex-direction:column!important;font-size:10px!important;padding:11.5mm 12.5mm 13mm!important}
        .invoice-print-document .mobile-invoice .pdf-top img{width:185px!important}
        .invoice-print-document .mobile-invoice .pdf-company{width:300px!important}
        .invoice-print-document .mobile-invoice .pdf-company b{font-size:15px!important}
        .invoice-print-document .mobile-invoice .pdf-company p{font-size:10px!important}
        .invoice-print-document .mobile-invoice .pdf-rule{height:4px!important;margin:25px 0 28px!important;background:#ef2624!important}
        .invoice-print-document .mobile-invoice .mobile-bill{min-height:98px!important}
        .invoice-print-document .mobile-invoice .mobile-bill>div>span,.invoice-print-document .mobile-invoice .pdf-bank>span,.invoice-print-document .mobile-invoice .pdf-terms>span{font-size:12px!important}
        .invoice-print-document .mobile-invoice .mobile-bill>div>b{font-size:19px!important}
        .invoice-print-document .mobile-invoice .mobile-bill p,.invoice-print-document .mobile-invoice .invoice-meta p{font-size:11px!important}
        .invoice-print-document .mobile-invoice .invoice-meta h1{font-size:34px!important;color:#ef2624!important}
        .invoice-print-document .mobile-invoice .pdf-table-head,.invoice-print-document .mobile-invoice .pdf-table-row{grid-template-columns:minmax(0,1fr) 100px 90px 110px!important}
        .invoice-print-document .mobile-invoice .pdf-table-head{font-size:12px!important;padding:13px 11px!important;background:#e8e8e8!important}
        .invoice-print-document .mobile-invoice .pdf-table-row{font-size:12px!important;min-height:70px!important;padding:14px 11px!important}
        .invoice-print-document .mobile-invoice .pdf-table-row>div b{font-size:15px!important}
        .invoice-print-document .mobile-invoice .pdf-table-row p{font-size:12px!important}
        .invoice-print-document .mobile-invoice .pdf-bottom{grid-template-columns:1fr 265px!important;gap:30px!important;margin-top:22px!important}
        .invoice-print-document .mobile-invoice .pdf-terms p{font-size:12px!important}
        .invoice-print-document .mobile-invoice .pdf-summary{padding:18px!important}
        .invoice-print-document .mobile-invoice .pdf-summary>div{font-size:12px!important;margin:6px 0!important}
        .invoice-print-document .mobile-invoice .pdf-summary .due{font-size:15px!important;margin-top:15px!important;padding-top:15px!important}
        .invoice-print-document .mobile-invoice .paid-slot{height:84px!important;padding-top:8px!important;visibility:hidden!important}
        .invoice-print-document .mobile-invoice .paid-slot.is-paid{visibility:visible!important}
        .invoice-print-document .mobile-invoice .paid-stamp{position:static!important;width:160px!important;height:auto!important;transform:none!important}
        .invoice-print-document .mobile-invoice .pdf-left-column .pdf-bank{margin-top:24px!important}
        .invoice-print-document .mobile-invoice .pdf-bank p{font-size:13px!important;line-height:1.4!important}
        .invoice-print-document .mobile-invoice .pdf-sign{margin:0!important;justify-content:flex-end!important;padding-right:4px!important;transform:translateX(28px)!important}
        .invoice-print-document .mobile-invoice .pdf-sign>div{width:240px!important}
        .invoice-print-document .mobile-invoice .pdf-sign img:not(.paid-stamp){width:210px!important;height:92px!important}
        .invoice-print-document .mobile-invoice .pdf-sign b{font-size:13px!important}
        .invoice-print-document .mobile-invoice .pdf-sign small{font-size:12px!important}
        .invoice-print-document .pdf-rule{background:#ef2624!important}
        .invoice-print-document .pdf-table-head{background:#e8e8e8!important}
        .invoice-print-document .mobile-bill>div>span,.invoice-print-document .pdf-bank>span,.invoice-print-document .pdf-terms>span,.invoice-print-document .invoice-meta h1{color:#ef2624!important}
        .invoice-print-document .pdf-paper:last-child{break-after:auto;page-break-after:auto}
      </style></head><body><div class="invoice-print-document"><div class="preview-sheet-frame">${previewPaperRef.current.innerHTML}</div></div></body></html>`);
      frameDocument.close();
      const printWindow = printFrame.contentWindow;
      const removeFrame = () => { printFrame.remove(); cleanup(); };
      printWindow.addEventListener('afterprint', removeFrame, { once: true });
      printFrame.onload = () => {
        Promise.all([...frameDocument.images].map(image => image.decode?.().catch(() => {}) || Promise.resolve()))
          .then(() => printWindow.print());
      };
      window.setTimeout(removeFrame, 5000);
    } catch (error) {
      cleanup();
      throw error;
    }
  };

  // Kept as an internal fallback while old sessions finish using the legacy
  // vector path. It is not wired to the download button anymore.
  const exportPdfLegacyVector = async () => {
    setBusy(true);
    try {
      const [logo, signature, paid] = await Promise.all([
        jpegFromPng('/assets/images/happy_group_logo.png', 700), jpegFromPng('/assets/images/signature_kiki_stamp.png', 700), jpegFromPng('/assets/images/paid_stamp.png', 800)
      ]);
      // Layout faithfully mirrors the invoice produced by the mobile application.
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const W = 210, margin = 16, red = [239, 38, 36], ink = [29, 29, 28];
      const money = value => IDR.format(Number(value || 0)).replace(/\u00a0/g, ' ');
      const invoiceDate = dateId.format(new Date(`${invoice.issueDate}T00:00:00`));
      const companyLines = pdf.splitTextToSize(`Kantor: ${invoice.companyAddress || '-'}`, 72);
      // Header positions are calculated from the real address length. This prevents
      // a multi-line office address from colliding with the telephone or invoice data.
      const companyTextY = 20, companyLineHeight = 3.4, phoneY = companyTextY + companyLines.length * companyLineHeight + 2, headerRuleY = phoneY + 6;

      pdf.addImage(logo, 'JPEG', margin, 13, 54, 20);
      pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...ink); pdf.setFontSize(11); pdf.text('PT. HAPPY TRANS HARYADI', 194, 15, { align: 'right' });
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.text(companyLines, 194, companyTextY, { align: 'right', lineHeightFactor: 1.12 });
      pdf.setFontSize(7.5); pdf.text('0811 2867 917', 194, phoneY, { align: 'right' });
      pdf.setDrawColor(...red); pdf.setLineWidth(1); pdf.line(margin, headerRuleY, 194, headerRuleY);

      pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...red); pdf.setFontSize(9); pdf.text('BILL TO', margin, headerRuleY + 11);
      pdf.setTextColor(...ink); pdf.setFontSize(12); pdf.text(invoice.customer || '-', margin, headerRuleY + 19);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); const customerCompany = invoice.customerCompany ? pdf.splitTextToSize(invoice.customerCompany, 75) : [];
      if (customerCompany.length) pdf.text(customerCompany, margin, headerRuleY + 24);
      if (invoice.customerPhone) pdf.text(invoice.customerPhone, margin, headerRuleY + 24 + customerCompany.length * 4);
      pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...red); pdf.setFontSize(22); pdf.text('INVOICE', 194, headerRuleY + 18, { align: 'right' });
      pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...ink); pdf.setFontSize(7); pdf.text('Invoice #:', 142, headerRuleY + 25); pdf.setFont('helvetica', 'bold'); pdf.text(invoice.number, 194, headerRuleY + 25, { align: 'right' });
      pdf.setFont('helvetica', 'normal'); pdf.text('Tanggal:', 142, headerRuleY + 30); pdf.setFont('helvetica', 'bold'); pdf.text(invoiceDate, 194, headerRuleY + 30, { align: 'right' });

      const itemX = margin, priceX = 109, qtyX = 144, totalX = 161, tableRight = 194;
      const drawTableHeader = y => {
        pdf.setFillColor(235, 235, 235); pdf.rect(itemX, y, tableRight-itemX, 9, 'F');
        pdf.setTextColor(45, 45, 45); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
        const colWidth = priceX - itemX;
        pdf.text('ITEMS / DESKRIPSI', itemX + colWidth / 2, y + 5.6, { align: 'center' });
        pdf.text('HARGA', priceX + 30, y + 5.6, { align: 'right' }); pdf.text('QTY', qtyX + 13, y + 5.6, { align: 'right' }); pdf.text('TOTAL', tableRight - 3, y + 5.6, { align: 'right' });
        return y + 9;
      };
      const addContinuationPage = () => {
        pdf.addPage();
        pdf.addImage(logo, 'JPEG', margin, 13, 44, 16);
        pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...ink); pdf.setFontSize(14); pdf.text('INVOICE', 194, 18, { align: 'right' });
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.text(invoice.number, 194, 23, { align: 'right' });
        pdf.setDrawColor(...red); pdf.setLineWidth(1); pdf.line(margin, 31, 194, 31);
        return drawTableHeader(39);
      };
      let y = drawTableHeader(headerRuleY + 39);
      pdf.setDrawColor(185, 185, 185); pdf.setLineWidth(.2);
      for (const item of invoice.items) {
        const title = pdf.splitTextToSize(item.description || '-', 85);
        const route = item.detail ? pdf.splitTextToSize(item.detail, 85) : [];
        
        const note = item.note ? pdf.splitTextToSize(item.note, 85) : [];
        const rowHeight = Math.max(14, 5 + (title.length + route.length + note.length) * 4);
        // Reserve the bottom of each page for the totals, terms, bank account and signature.
        // The whole row moves to the next page, so table borders/text never collide.
        if (y + rowHeight > 197) y = addContinuationPage();
        pdf.rect(itemX, y, tableRight-itemX, rowHeight);
        pdf.line(priceX, y, priceX, y+rowHeight); pdf.line(qtyX, y, qtyX, y+rowHeight); pdf.line(totalX, y, totalX, y+rowHeight);
        pdf.setTextColor(...ink); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.text(title, itemX+3, y+6);
        let itemTextY = y + 6 + title.length * 4;
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
        if(route.length){ pdf.text(route, itemX+3, itemTextY); itemTextY += route.length * 4; }
        
        if(note.length){
          pdf.setTextColor(...ink); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
          pdf.text(note, itemX+3, itemTextY);
        }
        pdf.setTextColor(...ink); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
        pdf.text(money(item.price), qtyX-3, y+6, {align:'right'}); pdf.text(String(item.quantity || 1) + ' ' + unitOf(item), totalX-3, y+6, {align:'right'}); pdf.text(money(Number(item.price || 0)*Number(item.quantity || 0)), tableRight-3, y+6, {align:'right'});
        y += rowHeight;
      }
      const total = totalOf(invoice), paidTotal = paidOf(invoice), due = dueOf(invoice);
      const terms = pdf.splitTextToSize(invoice.terms || '-', 86);
      const hasStamp = statusOf(invoice) === 'LUNAS';
      const rawBank = (bankAccounts || 'BCA 846-598-6111\nMANDIRI 137.004747.1111\nA/N ARI HARYADI').split('\n').map(s => s.trim()).filter(Boolean);
      const bankLines = rawBank.length ? rawBank : ['BCA 846-598-6111', 'MANDIRI 137.004747.1111', 'A/N ARI HARYADI'];
      // Tinggi blok penutup (terms, ringkasan, rekening, tanda tangan) dihitung
      // dari isi aslinya — bukan cadangan tetap 174 mm — supaya invoice yang sebenarnya
      // muat di satu halaman tidak lagi terdorong ke halaman kedua.
      const termsEndRel = 12 + terms.length * 3.6;
      const bankStartRel = termsEndRel + 8;
      const contactsEndRel = bankStartRel + 8 + bankLines.length * 3.4;
      // Tanda tangan cukup mulai 60 mm di bawah ringkasan agar bebas dari stempel PAID
      // (stempel berakhir di 65 mm, gambar ttd mulai +7) — bukan 38+65 yang menumpuk ruang kosong.
      const signatureOffset = Math.max(28 + terms.length * 3.6, hasStamp ? 50 : 30);
      const signatureEndRel = signatureOffset + 52;
      const lowerHeight = 8 + Math.max(contactsEndRel, signatureEndRel);
      // Move the closing section as a unit if the remaining space cannot fit it.
      if (y + lowerHeight > 284) {
        pdf.addPage();
        pdf.addImage(logo, 'PNG', margin, 13, 44, 16);
        pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...ink); pdf.setFontSize(14); pdf.text('INVOICE', 194, 18, { align: 'right' });
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.text(invoice.number, 194, 23, { align: 'right' });
        pdf.setDrawColor(...red); pdf.setLineWidth(1); pdf.line(margin, 31, 194, 31);
        y = 42;
      }
      // Keep TERMS and the payment summary immediately below the table.
      // Only the page itself is A4; the text must not be pushed down merely
      // to fill the unused white space on short invoices.
      const lowerY = y + 8;
      const termsY = lowerY + 2, summaryY = lowerY;
      pdf.setTextColor(...red); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.text('TERMS', margin, termsY + 3);
      pdf.setTextColor(...ink); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.text(terms, margin, termsY + 10, { lineHeightFactor: 1.25 });
      pdf.setDrawColor(165,165,165); pdf.setLineWidth(.35); pdf.rect(119, summaryY, 75, 30);
      pdf.setTextColor(...ink); pdf.setFontSize(8); pdf.text('Total',123,summaryY+8); pdf.text('Paid',123,summaryY+14);
      pdf.setFont('helvetica','bold'); pdf.text(money(total),190,summaryY+8,{align:'right'}); pdf.text(money(paidTotal),190,summaryY+14,{align:'right'});
      pdf.line(123,summaryY+19,190,summaryY+19); pdf.setFontSize(10); pdf.text('Amount Due (IDR)',123,summaryY+27);
      pdf.setTextColor(...red); pdf.text(money(due),190,summaryY+27,{align:'right'});
      // Center the compact PAID mark in the payment column so it stays
      // symmetrical without creating a large gap before the closing row.
      if (hasStamp) pdf.addImage(paid, 'JPEG', 134, summaryY + 31, 45, 17);
      const termsEndY = termsY + 10 + terms.length * 3.6;
      // The preview pushes BANK ACCOUNT and the signature block to the bottom
      // on a short one-page invoice. TERMS and the payment summary stay directly
      // below the table; only this lower row uses the remaining white space.
      // Keep the closing row compact. PAID is a small mark below the summary;
      // BANK ACCOUNT and the signature follow it with only a short gap.
      // Leave a real safety gap after PAID before BANK ACCOUNT/TTD. Without
      // this, the closing row starts exactly where the stamp ends.
      const lowerRowY = Math.max(termsEndY + 8, summaryY + (hasStamp ? 58 : 24));
      // BANK ACCOUNT follows TERMS on the left. Keep it independent from the
      // PAID/signature column so the payment stamp cannot push it downward.
      const bankY = termsEndY + 8;
      pdf.setTextColor(...red); pdf.setFont('helvetica','bold'); pdf.setFontSize(9.5); pdf.text('BANK ACCOUNT', margin, bankY);
      pdf.setTextColor(...ink); pdf.setFont('helvetica','normal'); pdf.setFontSize(9.5); pdf.text(bankLines, margin, bankY+8, { lineHeightFactor: 1.2 });
      // The bank account stays on the left while the signature stays on the right.
      // When the image is disabled, the same 40x28 mm area remains blank for a
      // future hard-file signature; the surrounding text stays in place.
      const signatureY = Math.max(bankY, summaryY + (hasStamp ? 58 : 24));
      pdf.setTextColor(...ink); pdf.setFontSize(9.5); pdf.text('Hormat kami,', 181, signatureY, {align:'center'});
      pdf.setFont('helvetica','bold'); pdf.text('PT. HAPPY TRANS HARYADI',181,signatureY+5,{align:'center'});
      if (showSignature) pdf.addImage(signature, 'JPEG', 161, signatureY+7, 40, 22);
      pdf.setFont('helvetica','bold'); pdf.setFontSize(9.5); pdf.text('Kiki Saputri',181,signatureY+40,{align:'center'});
      pdf.setFont('helvetica','bold'); pdf.setFontSize(9.5); pdf.setTextColor(...ink); pdf.text('Finance',181,signatureY+45,{align:'center'});
      pdf.save(`${invoice.number}.pdf`);
    } finally { setBusy(false); }
  };
  const exportPdfRasterLegacy = async () => {
    if (!previewPaperRef.current) return;
    setBusy(true);
    try {
      await document.fonts?.ready;
      await Promise.all([...previewPaperRef.current.querySelectorAll('img')].map(image => image.decode().catch(() => {})));
      const element = previewPaperRef.current;
      const renderScale = 2;
      const canvas = await html2canvas(element, {
        scale: renderScale,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: element.clientWidth,
        height: element.scrollHeight,
        onclone: clonedDocument => {
          const clonedPaper = clonedDocument.querySelector('.mobile-invoice');
          if (clonedPaper) {
            clonedPaper.style.setProperty('box-shadow', 'none', 'important');
            clonedPaper.style.setProperty('border-radius', '0', 'important');
            // A short invoice still occupies the complete printable A4 height.
            // Keep this true even when PDF export is triggered from a narrow viewport.
            const a4ContentHeight = clonedPaper.clientWidth * (273 / 186);
            clonedPaper.style.setProperty('min-height', `${a4ContentHeight}px`, 'important');
          }
        }
      });
      // Keep the preview's visual design, but paginate it onto standard A4
      // sheets. Prefer breaks between item rows so long invoices continue
      // naturally rather than being compressed onto one oversized page.
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pageWidth = 210, pageHeight = 297, margin = 12;
      const printableWidth = pageWidth - margin * 2, printableHeight = pageHeight - margin * 2;
      const mmPerPixel = printableWidth / canvas.width;
      const pagePixels = printableHeight / mmPerPixel;
      // Exclude the paper's bottom edge/shadow; it is presentation chrome,
      // not invoice content, and otherwise appears as a stray rule in the PDF.
      const captureHeight = Math.max(1, canvas.height - 2);
      const canvasScaleY = canvas.height / element.scrollHeight;
      const elementTop = element.getBoundingClientRect().top;
      const safeBreaks = [...element.querySelectorAll('.pdf-table-head, .pdf-table-row')]
        .map(node => (node.getBoundingClientRect().bottom - elementTop) * canvasScaleY)
        .filter(y => y > 0 && y < captureHeight)
        .sort((a, b) => a - b);
      let startY = 0;
      let pageNumber = 0;
      while (startY < captureHeight) {
        const limitY = Math.min(captureHeight, startY + pagePixels);
        const earliestBreakY = startY + pagePixels * 0.55;
        const safeBreakY = safeBreaks.filter(y => y >= earliestBreakY && y <= limitY).pop();
        const endY = safeBreakY || limitY;
        // The row/table border can land on the first raster row after a page
        // break because of antialiasing. Trim only that tiny seam on continuations.
        const cropTop = pageNumber > 0 ? 2 : 0;
        const sliceHeight = Math.max(1, Math.ceil(endY - startY - cropTop));
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;
        pageCanvas.getContext('2d').drawImage(canvas, 0, startY + cropTop, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
        if (pageNumber > 0) pdf.addPage();
        pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.94), 'JPEG', margin, margin, printableWidth, sliceHeight * mmPerPixel, undefined, 'FAST');
        startY = endY;
        pageNumber += 1;
      }
      pdf.save(`${invoice.number}.pdf`);
    } catch (error) {
      console.error('Gagal membuat PDF dari preview:', error);
      alert('PDF belum berhasil dibuat. Silakan coba lagi.');
    } finally {
      setBusy(false);
    }
  };
  return <Modal wide className="invoice-preview-modal"><div className="modal-header preview-header"><div><p className="eyebrow">PRATINJAU INVOICE</p><h2>{invoice.number}</h2><p className="modal-subtitle">{previewPages.length} lembar A4 · {invoice.items.length} item</p></div><div className="preview-actions"><button className="secondary" onClick={onEdit}><Pencil size={16}/> Edit invoice</button><button className={`secondary signature-toggle ${showSignature ? 'is-on' : 'is-off'}`} onClick={() => setShowSignature(value => !value)} title={showSignature ? 'Matikan tanda tangan digital; ruang tetap disediakan' : 'Tampilkan tanda tangan digital'}><Pencil size={16}/>{showSignature ? 'TTD aktif' : 'TTD dimatikan'}</button><button className="primary compact" onClick={onAddPayment} disabled={!canAddPayment} title={canAddPayment ? 'Catat pembayaran baru' : 'Invoice sudah lunas'}><WalletCards size={16}/>{canAddPayment ? 'Tambah pembayaran' : 'Sudah lunas'}</button><button className="close" onClick={onClose} title="Tutup pratinjau"><X/></button></div></div><div ref={previewPaperRef} className="preview-sheet-frame">{previewPages.map((page, index) => <InvoicePreviewPage key={index} invoice={invoice} bankAccounts={bankAccounts} items={page.items} continuation={page.continuation} closing={page.closing} showSignature={showSignature}/>)}</div><div className="modal-footer"><span>{showSignature ? 'Tanda tangan digital aktif.' : 'Tanda tangan dimatikan; ruang hardfile tetap disediakan.'}</span><button className="primary" onClick={exportPdf} disabled={busy}><Download size={18}/>{busy ? 'Menyiapkan PDF…' : 'Unduh PDF'}</button></div></Modal>;
}
function FormGroup({ title, children, className = '' }) { return <section className={`form-group ${className}`}><h3>{title}</h3>{children}</section> }
function AddressSettings({ addresses, onClose, onSave }) { const [list, setList] = useState(structuredClone(addresses)); const add = () => setList([...list, { id: uid(), name: '', fullAddress: '' }]); const edit = (i, key, value) => setList(list.map((x, n) => n === i ? { ...x, [key]: value } : x)); return <Modal><div className="modal-header"><div><p className="eyebrow">PERUSAHAAN</p><h2>Data alamat kantor</h2></div><button className="close" onClick={onClose}><X/></button></div>{list.map((address, index) => <div className="address-edit" key={address.id}><input placeholder="Nama kantor" value={address.name} onChange={e => edit(index, 'name', e.target.value)}/><textarea placeholder="Alamat lengkap" value={address.fullAddress} onChange={e => edit(index, 'fullAddress', e.target.value)}/><button className="icon-danger" onClick={() => setList(list.filter((_, i) => i !== index))}><Trash2 size={17}/></button></div>)}<button className="add-line" onClick={add}><Plus size={16}/> Tambah alamat</button><div className="modal-footer"><span>{list.length} alamat tersimpan</span><button className="primary" onClick={() => onSave(list.filter(x => x.name.trim() && x.fullAddress.trim()).map(x => ({ ...x, name: x.name.trim(), fullAddress: x.fullAddress.trim() }))) }><CheckCircle2 size={18}/> Simpan alamat</button></div></Modal> }
function BankSettingsModal({ initial, onClose, onSave }) {
  const [bankAccounts, setBankAccounts] = useState(initial || 'BCA 846-598-6111\nMANDIRI 137.004747.1111\nA/N ARI HARYADI');
  const [busy, setBusy] = useState(false);
  const submit = async event => {
    event.preventDefault();
    if (!bankAccounts.trim()) return alert('Daftar rekening bank tidak boleh kosong.');
    setBusy(true);
    try {
      await onSave(bankAccounts.trim());
    } finally {
      setBusy(false);
    }
  };
  return <Modal><form onSubmit={submit}><div className="modal-header"><div><p className="eyebrow">PERUSAHAAN</p><h2>Rekening pembayaran</h2><p className="modal-subtitle">Informasi rekening ini akan tampil pada bagian BANK ACCOUNT di setiap invoice dan PDF.</p></div><button type="button" className="close" onClick={onClose}><X/></button></div><label>Daftar rekening bank<textarea rows={6} style={{ minHeight: '130px', fontFamily: 'monospace', fontSize: '0.95rem', lineHeight: '1.5' }} value={bankAccounts} onChange={e => setBankAccounts(e.target.value)} placeholder="Contoh:&#10;BCA 846-598-6111&#10;MANDIRI 137.004747.1111&#10;A/N ARI HARYADI" required/></label><div className="modal-footer"><span>Perubahan langsung tersimpan dan diterapkan pada invoice serta PDF.</span><button className="primary" type="submit" disabled={busy}><CheckCircle2 size={18}/>{busy ? 'Menyimpan…' : 'Simpan rekening'}</button></div></form></Modal>;
}
createRoot(document.getElementById('root')).render(<AppErrorBoundary><App/></AppErrorBoundary>);
