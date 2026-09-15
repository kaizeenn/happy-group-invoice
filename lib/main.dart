import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter/services.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _brandRed = Color(0xFFE52322);
const _brandInk = Color(0xFF1D1D1B);
const _brandCream = Color(0xFFFFF8F5);
const _yogyakartaAddress =
    'Jl. Imogiri Barat Km 7, Bangunharjo, Kec. Sewon, Kab. Bantul, Yogyakarta 55188';
const _jakartaAddress =
    'Kawasan CBD Rasuna Epicentrum, Epiwalk Office Suite Level 5 Unit A501, Jl. H. R. Rasuna Said, RT 02 / RW 05, Karet, Kuningan, Kec. Setia Budi, Jakarta Selatan 12940';
const _bandungAddress =
    'Jl. A.H. Nasution No.952, Antapani Wetan, Kec. Antapani, Kota Bandung, Jawa Barat 40291';
const _paymentAccounts = <String>[
  'Cash',
  'BCA 846-598-6111',
  'Mandiri 137.004747.1111',
];
const _paymentMethods = <String>[
  'Transfer Bank',
  'Tunai',
  'QRIS',
  'E-Wallet',
  'Lainnya',
];
const _vehicleTypes = <String>[
  'Big Bus',
  'Medium Long',
  'Medium Bus',
  'Elf Long',
  'Hiace',
  'Inova',
  'Avanza',
  'Truck Fuso',
  'Truck Tronton',
  'Truck CDD',
  'Truck CDE',
  'Truck CDE BOX',
];
final _rupiah = NumberFormat.currency(
  locale: 'id_ID',
  symbol: 'Rp',
  decimalDigits: 0,
);
final _dateFormat = DateFormat('dd MMMM yyyy', 'id_ID');

double _parseRupiah(String value) =>
    double.tryParse(value.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;

class RupiahInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final digits = newValue.text.replaceAll(RegExp(r'[^0-9]'), '');
    if (digits.isEmpty) return const TextEditingValue();
    final formatted = NumberFormat.decimalPattern(
      'id_ID',
    ).format(int.parse(digits));
    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: formatted.length),
    );
  }
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('id_ID');
  runApp(const HappyInvoiceApp());
}

class HappyInvoiceApp extends StatelessWidget {
  const HappyInvoiceApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Happy Group Invoice',
    debugShowCheckedModeBanner: false,
    localizationsDelegates: const [
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    supportedLocales: const [Locale('id', 'ID'), Locale('en', 'US')],
    theme: ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: _brandRed,
        brightness: Brightness.light,
      ),
      scaffoldBackgroundColor: const Color(0xFFFAFAFA),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.white,
        foregroundColor: _brandInk,
        elevation: 0,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFE5E5E5)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFE5E5E5)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _brandRed, width: 1.6),
        ),
      ),
    ),
    home: const HomeScreen(),
  );
}

class InvoiceItem {
  InvoiceItem({
    required this.description,
    required this.price,
    required this.quantity,
    this.detail = '',
    this.note = '',
  });
  String description;
  double price;
  double quantity;
  String detail;
  String note;
  double get total => price * quantity;
  Map<String, dynamic> toJson() => {
    'description': description,
    'price': price,
    'quantity': quantity,
    'detail': detail,
    'note': note,
  };
  factory InvoiceItem.fromJson(Map<String, dynamic> json) => InvoiceItem(
    description: json['description'] as String? ?? '',
    price: (json['price'] as num?)?.toDouble() ?? 0,
    quantity: (json['quantity'] as num?)?.toDouble() ?? 1,
    detail: json['detail'] as String? ?? '',
    note: json['note'] as String? ?? '',
  );
}

class Payment {
  Payment({
    required this.amount,
    required this.date,
    this.note = '',
    this.account = 'Cash',
    this.method = 'Transfer Bank',
    this.reference = '',
  });
  double amount;
  DateTime date;
  String note;
  String account;
  String method;
  String reference;
  Map<String, dynamic> toJson() => {
    'amount': amount,
    'date': date.toIso8601String(),
    'note': note,
    'account': account,
    'method': method,
    'reference': reference,
  };
  factory Payment.fromJson(Map<String, dynamic> json) => Payment(
    amount: (json['amount'] as num?)?.toDouble() ?? 0,
    date: DateTime.tryParse(json['date'] as String? ?? '') ?? DateTime.now(),
    note: json['note'] as String? ?? '',
    account: json['account'] as String? ?? 'Cash',
    method: json['method'] as String? ?? 'Transfer Bank',
    reference: json['reference'] as String? ?? '',
  );
}

class Invoice {
  Invoice({
    required this.id,
    required this.number,
    required this.issueDate,
    required this.customer,
    this.customerAddress = '',
    this.customerPhone = '',
    this.companyAddress = _yogyakartaAddress,
    this.paymentStatus = 'auto',
    List<InvoiceItem>? items,
    List<Payment>? payments,
    this.terms =
        'DP 50%\nPelunasan H-3 sebelum tanggal keberangkatan\nInclude Unit, BBM, dan Driver.\nExclude Pajak, Parkir, Tol, Makan dan Tip Crew.',
    this.notes = '',
  }) : items = items ?? [],
       payments = payments ?? [];
  String id;
  String number;
  DateTime issueDate;
  String customer;
  String customerAddress;
  String customerPhone;
  String companyAddress;

  /// auto mengikuti nominal pembayaran; dp/lunas dapat dipilih manual.
  String paymentStatus;
  List<InvoiceItem> items;
  List<Payment> payments;
  String terms;
  String notes;
  double get total => items.fold(0, (sum, item) => sum + item.total);
  double get recordedPaid =>
      payments.fold(0, (sum, payment) => sum + payment.amount);
  double get paid => paymentStatus == 'lunas' ? total : recordedPaid;
  double get due => (total - paid).clamp(0, double.infinity);
  bool get isPaid => paymentStatus == 'lunas' || (total > 0 && due < 1);
  String get status => isPaid
      ? 'LUNAS'
      : paymentStatus == 'dp' || paid > 0
      ? 'DP / SEBAGIAN'
      : 'BELUM LUNAS';
  Map<String, dynamic> toJson() => {
    'id': id,
    'number': number,
    'issueDate': issueDate.toIso8601String(),
    'customer': customer,
    'customerAddress': customerAddress,
    'customerPhone': customerPhone,
    'companyAddress': companyAddress,
    'paymentStatus': paymentStatus,
    'items': items.map((e) => e.toJson()).toList(),
    'payments': payments.map((e) => e.toJson()).toList(),
    'terms': terms,
    'notes': notes,
  };
  factory Invoice.fromJson(Map<String, dynamic> json) => Invoice(
    id: json['id'] as String,
    number: json['number'] as String,
    issueDate:
        DateTime.tryParse(json['issueDate'] as String? ?? '') ?? DateTime.now(),
    customer: json['customer'] as String? ?? '',
    customerAddress: json['customerAddress'] as String? ?? '',
    customerPhone: json['customerPhone'] as String? ?? '',
    companyAddress: json['companyAddress'] as String? ?? _yogyakartaAddress,
    paymentStatus: json['paymentStatus'] as String? ?? 'auto',
    items: ((json['items'] as List?) ?? [])
        .map((e) => InvoiceItem.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList(),
    payments: ((json['payments'] as List?) ?? [])
        .map((e) => Payment.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList(),
    terms: json['terms'] as String? ?? '',
    notes: json['notes'] as String? ?? '',
  );
}

class OfficeAddress {
  const OfficeAddress({
    required this.id,
    required this.name,
    required this.fullAddress,
  });
  final String id;
  final String name;
  final String fullAddress;

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'fullAddress': fullAddress,
  };

  factory OfficeAddress.fromJson(Map<String, dynamic> json) => OfficeAddress(
    id:
        json['id'] as String? ??
        DateTime.now().microsecondsSinceEpoch.toString(),
    name: json['name'] as String? ?? 'Kantor',
    fullAddress: json['fullAddress'] as String? ?? '',
  );
}

const _defaultOfficeAddresses = <OfficeAddress>[
  OfficeAddress(
    id: 'yogyakarta',
    name: 'Kantor Yogyakarta',
    fullAddress: _yogyakartaAddress,
  ),
  OfficeAddress(
    id: 'jakarta',
    name: 'Kantor Jakarta',
    fullAddress: _jakartaAddress,
  ),
  OfficeAddress(
    id: 'bandung',
    name: 'Kantor Bandung',
    fullAddress: _bandungAddress,
  ),
];

class InvoiceStore {
  static const _key = 'happy_group_invoices_v1';
  static const _addressKey = 'happy_group_office_addresses_v1';
  Future<List<Invoice>> load() async {
    final data = (await SharedPreferences.getInstance()).getString(_key);
    if (data == null || data.isEmpty) return [];
    try {
      return (jsonDecode(data) as List)
          .map(
            (item) => Invoice.fromJson(Map<String, dynamic>.from(item as Map)),
          )
          .toList()
        ..sort((a, b) => b.issueDate.compareTo(a.issueDate));
    } catch (_) {
      return [];
    }
  }

  Future<void> save(List<Invoice> invoices) async =>
      (await SharedPreferences.getInstance()).setString(
        _key,
        jsonEncode(invoices.map((e) => e.toJson()).toList()),
      );

  Future<List<OfficeAddress>> loadAddresses() async {
    final data = (await SharedPreferences.getInstance()).getString(_addressKey);
    if (data == null || data.isEmpty) return List.of(_defaultOfficeAddresses);
    try {
      return (jsonDecode(data) as List)
          .map(
            (item) =>
                OfficeAddress.fromJson(Map<String, dynamic>.from(item as Map)),
          )
          .toList();
    } catch (_) {
      return List.of(_defaultOfficeAddresses);
    }
  }

  Future<void> saveAddresses(List<OfficeAddress> addresses) async =>
      (await SharedPreferences.getInstance()).setString(
        _addressKey,
        jsonEncode(addresses.map((e) => e.toJson()).toList()),
      );
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _store = InvoiceStore();
  List<Invoice> _invoices = [];
  List<OfficeAddress> _officeAddresses = List.of(_defaultOfficeAddresses);
  bool _loading = true;
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final results = await Future.wait([_store.load(), _store.loadAddresses()]);
    if (mounted) {
      setState(() {
        _invoices = results[0] as List<Invoice>;
        _officeAddresses = results[1] as List<OfficeAddress>;
        _loading = false;
      });
    }
  }

  Future<void> _openAddressSettings() async {
    final updated = await Navigator.push<List<OfficeAddress>>(
      context,
      MaterialPageRoute(
        builder: (_) => AddressSettingsScreen(addresses: _officeAddresses),
      ),
    );
    if (updated == null) return;
    setState(() => _officeAddresses = updated);
    await _store.saveAddresses(updated);
  }

  Future<void> _saveInvoice(Invoice invoice) async {
    final index = _invoices.indexWhere((item) => item.id == invoice.id);
    setState(() {
      if (index < 0) {
        _invoices.add(invoice);
      } else {
        _invoices[index] = invoice;
      }
      _invoices.sort((a, b) => b.issueDate.compareTo(a.issueDate));
    });
    await _store.save(_invoices);
  }

  String _nextNumber() =>
      'INV-${DateFormat('yyyyMMdd').format(DateTime.now())}-${(_invoices.length + 1).toString().padLeft(3, '0')}';

  Future<void> _openEditor([Invoice? invoice]) async {
    final saved = await Navigator.push<Invoice>(
      context,
      MaterialPageRoute(
        builder: (_) => InvoiceEditor(
          invoice: invoice,
          nextNumber: _nextNumber(),
          officeAddresses: _officeAddresses,
        ),
      ),
    );
    if (saved != null) {
      await _saveInvoice(saved);
      if (!mounted) return;
      final bytes = await InvoicePdf.create(saved);
      if (!mounted) return;
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => PdfPreviewScreen(invoice: saved, bytes: bytes),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final pages = [_dashboard(), _invoiceList(), _profile()];
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Image.asset('assets/images/happy_group_logo.png', height: 36),
            const SizedBox(width: 10),
            const Text(
              'Invoice',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
          ],
        ),
        actions: [
          IconButton(
            onPressed: _load,
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Muat ulang',
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _brandRed))
          : pages[_tab],
      floatingActionButton: _tab == 2
          ? null
          : FloatingActionButton.extended(
              onPressed: () => _openEditor(),
              backgroundColor: _brandRed,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add_rounded),
              label: const Text('Buat Invoice'),
            ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (value) => setState(() => _tab = value),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'Beranda',
          ),
          NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long),
            label: 'Invoice',
          ),
          NavigationDestination(
            icon: Icon(Icons.business_outlined),
            selectedIcon: Icon(Icons.business),
            label: 'Perusahaan',
          ),
        ],
      ),
    );
  }

  Widget _dashboard() {
    final total = _invoices.fold<double>(0, (s, e) => s + e.total);
    final received = _invoices.fold<double>(0, (s, e) => s + e.paid);
    final due = _invoices.fold<double>(0, (s, e) => s + e.due);
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 110),
        children: [
          const Text(
            'Ringkasan bisnis',
            style: TextStyle(
              fontSize: 25,
              fontWeight: FontWeight.w800,
              color: _brandInk,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            'Pantau tagihan Happy Group dari satu tempat.',
            style: TextStyle(color: Colors.grey.shade700),
          ),
          const SizedBox(height: 20),
          _heroCard(total, received, due),
          const SizedBox(height: 22),
          Row(
            children: [
              Expanded(
                child: _metric(
                  'Lunas',
                  _invoices.where((e) => e.isPaid).length.toString(),
                  Icons.verified_rounded,
                  Colors.green,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _metric(
                  'Belum lunas',
                  _invoices.where((e) => !e.isPaid).length.toString(),
                  Icons.pending_actions_rounded,
                  Colors.orange,
                ),
              ),
            ],
          ),
          const SizedBox(height: 26),
          const Text(
            'Invoice terbaru',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 10),
          if (_invoices.isEmpty)
            _emptyState()
          else
            ..._invoices.take(4).map(_invoiceTile),
        ],
      ),
    );
  }

  Widget _heroCard(double total, double received, double due) => Container(
    padding: const EdgeInsets.all(22),
    decoration: BoxDecoration(
      color: _brandInk,
      borderRadius: BorderRadius.circular(24),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'TOTAL TAGIHAN BERJALAN',
          style: TextStyle(
            color: Color(0xFFFFB0A9),
            fontSize: 11,
            fontWeight: FontWeight.bold,
            letterSpacing: 1.2,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          _rupiah.format(total),
          style: const TextStyle(
            color: Colors.white,
            fontSize: 29,
            fontWeight: FontWeight.w800,
          ),
        ),
        const Divider(color: Colors.white24, height: 28),
        Row(
          children: [
            Expanded(
              child: _moneyLabel('Diterima', received, const Color(0xFF8EE9B3)),
            ),
            Expanded(
              child: _moneyLabel('Sisa tagihan', due, const Color(0xFFFFB0A9)),
            ),
          ],
        ),
      ],
    ),
  );

  Widget _moneyLabel(String label, double value, Color color) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12)),
      const SizedBox(height: 3),
      Text(
        _rupiah.format(value),
        style: TextStyle(color: color, fontWeight: FontWeight.bold),
      ),
    ],
  );
  Widget _metric(String label, String value, IconData icon, Color color) =>
      Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(17),
          boxShadow: const [
            BoxShadow(
              color: Color(0x12000000),
              blurRadius: 12,
              offset: Offset(0, 5),
            ),
          ],
        ),
        child: Row(
          children: [
            Icon(icon, color: color),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  value,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 22,
                  ),
                ),
                Text(
                  label,
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
                ),
              ],
            ),
          ],
        ),
      );

  Widget _invoiceList() => ListView(
    padding: const EdgeInsets.fromLTRB(20, 14, 20, 110),
    children: [
      const Text(
        'Semua invoice',
        style: TextStyle(fontWeight: FontWeight.w800, fontSize: 25),
      ),
      const SizedBox(height: 14),
      if (_invoices.isEmpty) _emptyState() else ..._invoices.map(_invoiceTile),
    ],
  );

  Widget _invoiceTile(Invoice invoice) => Card(
    elevation: 0,
    margin: const EdgeInsets.only(bottom: 10),
    color: Colors.white,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(17),
      side: const BorderSide(color: Color(0xFFEAEAEA)),
    ),
    child: InkWell(
      borderRadius: BorderRadius.circular(17),
      onTap: () async {
        final changed = await Navigator.push<Invoice>(
          context,
          MaterialPageRoute(
            builder: (_) => InvoiceDetail(
              invoice: invoice,
              onChanged: _saveInvoice,
              officeAddresses: _officeAddresses,
            ),
          ),
        );
        if (changed != null) {
          await _saveInvoice(changed);
        }
      },

      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              width: 43,
              height: 43,
              decoration: BoxDecoration(
                color: invoice.isPaid
                    ? const Color(0xFFE6F7ED)
                    : const Color(0xFFFFEEE9),
                borderRadius: BorderRadius.circular(13),
              ),
              child: Icon(
                invoice.isPaid
                    ? Icons.verified_rounded
                    : Icons.receipt_long_rounded,
                color: invoice.isPaid ? Colors.green : _brandRed,
              ),
            ),
            const SizedBox(width: 13),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    invoice.customer.isEmpty
                        ? 'Tanpa nama pelanggan'
                        : invoice.customer,
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${invoice.number} • ${DateFormat('dd MMM yy', 'id_ID').format(invoice.issueDate)}',
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    _rupiah.format(invoice.total),
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      color: _brandInk,
                    ),
                  ),
                ],
              ),
            ),
            _statusChip(invoice),
          ],
        ),
      ),
    ),
  );

  Widget _statusChip(Invoice invoice) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
    decoration: BoxDecoration(
      color: invoice.isPaid ? const Color(0xFFE6F7ED) : const Color(0xFFFFF0EB),
      borderRadius: BorderRadius.circular(30),
    ),
    child: Text(
      invoice.status,
      style: TextStyle(
        fontSize: 9,
        color: invoice.isPaid ? const Color(0xFF15803D) : _brandRed,
        fontWeight: FontWeight.w800,
      ),
    ),
  );
  Widget _emptyState() => Container(
    padding: const EdgeInsets.all(28),
    decoration: BoxDecoration(
      color: _brandCream,
      borderRadius: BorderRadius.circular(18),
    ),
    child: const Column(
      children: [
        Icon(Icons.receipt_long_outlined, size: 45, color: _brandRed),
        SizedBox(height: 10),
        Text(
          'Belum ada invoice',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
        ),
        SizedBox(height: 4),
        Text(
          'Tekan Buat Invoice untuk membuat tagihan baru.',
          textAlign: TextAlign.center,
        ),
      ],
    ),
  );

  Widget _profile() => ListView(
    padding: const EdgeInsets.all(20),
    children: [
      const Text(
        'Profil perusahaan',
        style: TextStyle(fontSize: 25, fontWeight: FontWeight.w800),
      ),
      const SizedBox(height: 18),
      Center(
        child: Image.asset('assets/images/happy_group_logo.png', height: 75),
      ),
      const SizedBox(height: 20),
      _infoBox(
        'PT. Happy Trans Haryadi',
        'Jl. Imogiri Barat Km 7, Bangunharjo, Kec. Sewon, Kab. Bantul, Yogyakarta 55188\n+62 811-2867-917',
      ),
      const SizedBox(height: 12),
      _infoBox(
        'Rekening pembayaran',
        'BCA 846-598-6111\nMANDIRI 137.004747.1111\nA/N ARI HARYADI\nBCA 8465-688-111',
      ),
      const SizedBox(height: 24),
      ListTile(
        contentPadding: EdgeInsets.zero,
        leading: const Icon(Icons.location_on_outlined, color: _brandRed),
        title: const Text('Data alamat kantor'),
        subtitle: Text(
          '${_officeAddresses.length} alamat tersimpan — tambah, ubah, atau hapus alamat',
        ),
        trailing: const Icon(Icons.chevron_right_rounded),
        onTap: _openAddressSettings,
      ),
      const SizedBox(height: 12),
      const Text(
        'Aset dokumen',
        style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
      ),
      const SizedBox(height: 10),
      const ListTile(
        leading: Icon(Icons.draw_rounded, color: _brandRed),
        title: Text('TTD & stempel perusahaan'),
        subtitle: Text('Mba Kiki — otomatis pada invoice PDF'),
      ),
      const ListTile(
        leading: Icon(Icons.approval_rounded, color: _brandRed),
        title: Text('Stempel PAID'),
        subtitle: Text('Tampil otomatis untuk invoice lunas'),
      ),
    ],
  );
  Widget _infoBox(String title, String content) => Container(
    padding: const EdgeInsets.all(17),
    decoration: BoxDecoration(
      color: Colors.white,
      border: Border.all(color: const Color(0xFFEAEAEA)),
      borderRadius: BorderRadius.circular(16),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
        const SizedBox(height: 8),
        Text(
          content,
          style: TextStyle(height: 1.55, color: Colors.grey.shade700),
        ),
      ],
    ),
  );
}

class AddressSettingsScreen extends StatefulWidget {
  const AddressSettingsScreen({super.key, required this.addresses});
  final List<OfficeAddress> addresses;

  @override
  State<AddressSettingsScreen> createState() => _AddressSettingsScreenState();
}

class _AddressSettingsScreenState extends State<AddressSettingsScreen> {
  late List<OfficeAddress> _addresses;

  @override
  void initState() {
    super.initState();
    _addresses = List.of(widget.addresses);
  }

  Future<void> _editAddress([OfficeAddress? current]) async {
    final form = GlobalKey<FormState>();
    final name = TextEditingController(text: current?.name ?? '');
    final fullAddress = TextEditingController(text: current?.fullAddress ?? '');
    final result = await showModalBottomSheet<OfficeAddress>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(sheetContext).viewInsets.bottom,
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
            child: Form(
              key: form,
              child: ListView(
                shrinkWrap: true,
                children: [
                  Center(
                    child: Container(
                      width: 42,
                      height: 4,
                      decoration: BoxDecoration(
                        color: Colors.grey.shade300,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    current == null
                        ? 'Tambah alamat kantor'
                        : 'Ubah alamat kantor',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 20),
                  TextFormField(
                    controller: name,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(
                      labelText: 'Nama alamat / kantor',
                      hintText: 'Contoh: Kantor Surabaya',
                    ),
                    validator: (value) => value == null || value.trim().isEmpty
                        ? 'Isi nama kantor'
                        : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: fullAddress,
                    textCapitalization: TextCapitalization.sentences,
                    minLines: 4,
                    maxLines: 7,
                    decoration: const InputDecoration(
                      labelText: 'Alamat lengkap',
                      hintText:
                          'Jalan, nomor, kelurahan, kecamatan, kota, provinsi, kode pos',
                    ),
                    validator: (value) => value == null || value.trim().isEmpty
                        ? 'Isi alamat lengkap'
                        : null,
                  ),
                  const SizedBox(height: 20),
                  FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: _brandRed,
                      padding: const EdgeInsets.symmetric(vertical: 15),
                    ),
                    onPressed: () {
                      if (!form.currentState!.validate()) return;
                      Navigator.pop(
                        sheetContext,
                        OfficeAddress(
                          id:
                              current?.id ??
                              DateTime.now().microsecondsSinceEpoch.toString(),
                          name: name.text.trim(),
                          fullAddress: fullAddress.text.trim(),
                        ),
                      );
                    },
                    icon: const Icon(Icons.save_rounded),
                    label: const Text('SIMPAN ALAMAT'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    name.dispose();
    fullAddress.dispose();
    if (result == null || !mounted) return;
    setState(() {
      final index = _addresses.indexWhere((address) => address.id == result.id);
      if (index >= 0) {
        _addresses[index] = result;
      } else {
        _addresses.add(result);
      }
    });
  }

  Future<void> _deleteAddress(OfficeAddress address) async {
    final approved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Hapus alamat?'),
        content: Text(
          'Alamat “${address.name}” akan dihapus dari pilihan invoice.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Hapus'),
          ),
        ],
      ),
    );
    if (approved == true && mounted) {
      setState(() => _addresses.removeWhere((item) => item.id == address.id));
    }
  }

  void _saveAndClose() => Navigator.pop(context, _addresses);

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Data alamat kantor'),
      actions: [
        TextButton(
          onPressed: _saveAndClose,
          child: const Text(
            'SELESAI',
            style: TextStyle(color: _brandRed, fontWeight: FontWeight.w800),
          ),
        ),
      ],
    ),
    floatingActionButton: FloatingActionButton.extended(
      onPressed: () => _editAddress(),
      backgroundColor: _brandRed,
      foregroundColor: Colors.white,
      icon: const Icon(Icons.add_location_alt_rounded),
      label: const Text('Tambah alamat'),
    ),
    body: _addresses.isEmpty
        ? const Center(
            child: Padding(
              padding: EdgeInsets.all(32),
              child: Text(
                'Belum ada alamat kantor.\nTekan Tambah alamat untuk membuat alamat baru.',
                textAlign: TextAlign.center,
              ),
            ),
          )
        : ListView.separated(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 100),
            itemCount: _addresses.length,
            separatorBuilder: (context, index) => const SizedBox(height: 10),
            itemBuilder: (_, index) {
              final address = _addresses[index];
              return Card(
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: const BorderSide(color: Color(0xFFEAEAEA)),
                ),
                child: ListTile(
                  contentPadding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
                  leading: const CircleAvatar(
                    backgroundColor: _brandCream,
                    child: Icon(Icons.location_on_rounded, color: _brandRed),
                  ),
                  title: Text(
                    address.name,
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  subtitle: Padding(
                    padding: const EdgeInsets.only(top: 5),
                    child: Text(address.fullAddress),
                  ),
                  isThreeLine: true,
                  trailing: PopupMenuButton<String>(
                    onSelected: (choice) => choice == 'edit'
                        ? _editAddress(address)
                        : _deleteAddress(address),
                    itemBuilder: (_) => const [
                      PopupMenuItem(value: 'edit', child: Text('Ubah')),
                      PopupMenuItem(value: 'delete', child: Text('Hapus')),
                    ],
                  ),
                ),
              );
            },
          ),
  );
}

class InvoiceEditor extends StatefulWidget {
  const InvoiceEditor({
    super.key,
    this.invoice,
    required this.nextNumber,
    required this.officeAddresses,
  });
  final Invoice? invoice;
  final String nextNumber;
  final List<OfficeAddress> officeAddresses;

  @override
  State<InvoiceEditor> createState() => _InvoiceEditorState();
}

class _InvoiceEditorState extends State<InvoiceEditor> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _number,
      _customer,
      _address,
      _phone,
      _terms,
      _notes;
  late DateTime _date;
  late List<InvoiceItem> _items;
  late List<Payment> _payments;
  late String _companyAddress;
  late String _paymentStatus;

  @override
  void initState() {
    super.initState();
    final invoice = widget.invoice;
    _number = TextEditingController(text: invoice?.number ?? widget.nextNumber);
    _customer = TextEditingController(text: invoice?.customer ?? '');
    _address = TextEditingController(text: invoice?.customerAddress ?? '');
    _phone = TextEditingController(text: invoice?.customerPhone ?? '');
    _terms = TextEditingController(
      text:
          invoice?.terms ??
          'DP 50%\nPelunasan H-3 sebelum tanggal keberangkatan\nInclude Unit, BBM, dan Driver.\nExclude Pajak, Parkir, Tol, Makan dan Tip Crew.',
    );
    _notes = TextEditingController(text: invoice?.notes ?? '');
    _date = invoice?.issueDate ?? DateTime.now();
    _items = List.of(invoice?.items ?? []);
    _payments = List.of(invoice?.payments ?? []);
    _companyAddress = invoice?.companyAddress ?? _yogyakartaAddress;
    _paymentStatus = invoice?.paymentStatus ?? 'auto';
  }

  @override
  void dispose() {
    for (final controller in [
      _number,
      _customer,
      _address,
      _phone,
      _terms,
      _notes,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  double get _total => _items.fold(0, (sum, item) => sum + item.total);
  double get _recordedPaid =>
      _payments.fold(0, (sum, payment) => sum + payment.amount);
  double get _paid => _paymentStatus == 'lunas' ? _total : _recordedPaid;
  double get _due => (_total - _paid).clamp(0, double.infinity);

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
      locale: const Locale('id', 'ID'),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _addItem() async {
    final result = await showModalBottomSheet<InvoiceItem>(
      context: context,
      isScrollControlled: true,
      builder: (_) => ItemEditorSheet(
        item: InvoiceItem(
          description: _vehicleTypes.first,
          price: 0,
          quantity: 1,
        ),
      ),
    );
    if (result != null) setState(() => _items.add(result));
  }

  Future<void> _editItem(int index) async {
    final result = await showModalBottomSheet<InvoiceItem>(
      context: context,
      isScrollControlled: true,
      builder: (_) => ItemEditorSheet(item: _items[index]),
    );
    if (result != null) setState(() => _items[index] = result);
  }

  Future<void> _addPayment() async {
    final suggested = _paymentStatus == 'dp' ? _total * .5 : _due;
    final result = await showModalBottomSheet<Payment>(
      context: context,
      isScrollControlled: true,
      builder: (_) => PaymentEditorSheet(
        suggestedAmount: suggested,
        defaultNote: _paymentStatus == 'dp' ? 'DP' : 'Pembayaran',
      ),
    );
    if (result != null && result.amount > 0) {
      setState(() => _payments.add(result));
    }
  }

  void _submit() {
    if (!_form.currentState!.validate()) return;
    if (_items.isEmpty ||
        _items.any(
          (item) =>
              item.description.isEmpty || item.price <= 0 || item.quantity <= 0,
        )) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Tambahkan minimal satu item dengan harga dan qty yang valid.',
          ),
        ),
      );
      return;
    }
    Navigator.pop(
      context,
      Invoice(
        id:
            widget.invoice?.id ??
            DateTime.now().microsecondsSinceEpoch.toString(),
        number: _number.text.trim(),
        issueDate: _date,
        customer: _customer.text.trim(),
        customerAddress: _address.text.trim(),
        customerPhone: _phone.text.trim(),
        companyAddress: _companyAddress,
        paymentStatus: _paymentStatus,
        items: _items,
        payments: _payments,
        terms: _terms.text.trim(),
        notes: _notes.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.invoice == null ? 'Buat invoice' : 'Edit invoice'),
      ),
      body: Form(
        key: _form,
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 20),
                children: [
                  _editorHero(),
                  const SizedBox(height: 16),
                  _formCard([
                    _section('Informasi invoice'),
                    TextFormField(
                      controller: _number,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(
                        labelText: 'Nomor invoice',
                        prefixIcon: Icon(Icons.tag_rounded),
                      ),
                      validator: _required,
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        alignment: Alignment.centerLeft,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 14,
                        ),
                      ),
                      onPressed: _pickDate,
                      icon: const Icon(Icons.calendar_month_rounded),
                      label: Text(
                        'Tanggal invoice  •  ${_dateFormat.format(_date)}',
                      ),
                    ),
                  ]),
                  const SizedBox(height: 14),
                  _formCard([
                    _section('Kantor penerbit'),
                    DropdownButtonFormField<String>(
                      initialValue:
                          widget.officeAddresses.any(
                            (item) => item.fullAddress == _companyAddress,
                          )
                          ? _companyAddress
                          : null,
                      decoration: const InputDecoration(
                        labelText: 'Alamat kantor pada invoice',
                        prefixIcon: Icon(Icons.business_rounded),
                      ),
                      items: widget.officeAddresses
                          .map(
                            (address) => DropdownMenuItem(
                              value: address.fullAddress,
                              child: Text(address.name),
                            ),
                          )
                          .toList(),
                      onChanged: (value) => setState(
                        () => _companyAddress = value ?? _companyAddress,
                      ),
                    ),
                    if (_companyAddress.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: _brandCream,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          _companyAddress,
                          style: TextStyle(
                            fontSize: 12,
                            height: 1.45,
                            color: Colors.grey.shade700,
                          ),
                        ),
                      ),
                    ],
                  ]),
                  const SizedBox(height: 14),
                  _formCard([
                    _section('Tagihkan kepada'),
                    TextFormField(
                      controller: _customer,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(
                        labelText: 'Nama pelanggan / perusahaan',
                        prefixIcon: Icon(Icons.person_rounded),
                      ),
                      validator: _required,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _address,
                      minLines: 2,
                      maxLines: 3,
                      decoration: const InputDecoration(
                        labelText: 'Alamat pelanggan (opsional)',
                        prefixIcon: Icon(Icons.location_on_outlined),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(
                        labelText: 'WhatsApp / telepon (opsional)',
                        prefixIcon: Icon(Icons.phone_outlined),
                      ),
                    ),
                  ]),
                  const SizedBox(height: 14),
                  _formCard([
                    Row(
                      children: [
                        const Icon(
                          Icons.directions_bus_rounded,
                          color: _brandRed,
                        ),
                        const SizedBox(width: 8),
                        Expanded(child: _section('Item layanan', top: 0)),
                        Text(
                          '${_items.length} item',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade600,
                          ),
                        ),
                      ],
                    ),
                    ..._itemWidgets(),
                    const SizedBox(height: 6),
                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      onPressed: _addItem,
                      icon: const Icon(Icons.add_rounded),
                      label: const Text('Tambah item layanan'),
                    ),
                    const SizedBox(height: 12),
                    _totalBox(),
                  ]),
                  const SizedBox(height: 14),
                  _formCard([
                    _section('Status pembayaran'),
                    DropdownButtonFormField<String>(
                      initialValue: _paymentStatus,
                      decoration: const InputDecoration(
                        labelText: 'Pilih status pembayaran',
                        prefixIcon: Icon(Icons.account_balance_wallet_rounded),
                      ),
                      items: const [
                        DropdownMenuItem(
                          value: 'auto',
                          child: Text('Otomatis dari nominal pembayaran'),
                        ),
                        DropdownMenuItem(
                          value: 'dp',
                          child: Text('DP / pembayaran sebagian'),
                        ),
                        DropdownMenuItem(
                          value: 'lunas',
                          child: Text('Lunas — tampilkan stempel PAID'),
                        ),
                      ],
                      onChanged: (value) =>
                          setState(() => _paymentStatus = value ?? 'auto'),
                    ),
                    const SizedBox(height: 9),
                    Text(
                      _paymentStatus == 'lunas'
                          ? 'Invoice akan dianggap lunas dan PDF diberi stempel PAID.'
                          : _paymentStatus == 'dp'
                          ? 'Catat nominal DP pada bagian pembayaran berikut.'
                          : 'Status mengikuti nominal pembayaran yang dicatat.',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey.shade700,
                      ),
                    ),
                    ..._paymentWidgets(),
                  ]),
                  const SizedBox(height: 14),
                  _formCard([
                    _section('Ketentuan & catatan'),
                    TextFormField(
                      controller: _terms,
                      minLines: 4,
                      maxLines: 8,
                      decoration: const InputDecoration(
                        labelText: 'Terms / ketentuan',
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _notes,
                      minLines: 2,
                      maxLines: 5,
                      decoration: const InputDecoration(
                        labelText: 'Catatan tambahan',
                      ),
                    ),
                  ]),
                ],
              ),
            ),
            SafeArea(
              top: false,
              child: Container(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  boxShadow: [
                    BoxShadow(
                      color: Color(0x14000000),
                      blurRadius: 12,
                      offset: Offset(0, -3),
                    ),
                  ],
                ),
                child: SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: _brandRed,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                    onPressed: _submit,
                    icon: const Icon(Icons.save_rounded),
                    label: const Text('SIMPAN INVOICE'),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _editorHero() => Container(
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      color: _brandInk,
      borderRadius: BorderRadius.circular(20),
    ),
    child: Row(
      children: [
        Container(
          padding: const EdgeInsets.all(10),
          decoration: const BoxDecoration(
            color: Color(0x26FFFFFF),
            shape: BoxShape.circle,
          ),
          child: const Icon(Icons.receipt_long_rounded, color: Colors.white),
        ),
        const SizedBox(width: 13),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.invoice == null ? 'Invoice baru' : 'Perbarui invoice',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 19,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 3),
              const Text(
                'Lengkapi data tagihan sebelum disimpan.',
                style: TextStyle(color: Colors.white70, fontSize: 12),
              ),
            ],
          ),
        ),
      ],
    ),
  );

  Widget _formCard(List<Widget> children) => Container(
    padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: const Color(0xFFEAEAEA)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: children,
    ),
  );

  List<Widget> _itemWidgets() => [
    if (_items.isEmpty)
      Text(
        'Belum ada item layanan.',
        style: TextStyle(color: Colors.grey.shade700),
      ),
    ..._items.asMap().entries.map(
      (entry) => Card(
        elevation: 0,
        color: _brandCream,
        margin: const EdgeInsets.only(bottom: 9),
        child: ListTile(
          onTap: () => _editItem(entry.key),
          leading: const Icon(Icons.directions_bus_rounded, color: _brandRed),
          title: Text(
            entry.value.description,
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
          subtitle: Text(
            '${entry.value.quantity.toStringAsFixed(entry.value.quantity % 1 == 0 ? 0 : 2)} unit × ${_rupiah.format(entry.value.price)}${entry.value.detail.isEmpty ? '' : '\n${entry.value.detail}'}${entry.value.note.isEmpty ? '' : '\nCatatan: ${entry.value.note}'}',
          ),
          isThreeLine:
              entry.value.detail.isNotEmpty || entry.value.note.isNotEmpty,
          trailing: IconButton(
            onPressed: () => setState(() => _items.removeAt(entry.key)),
            icon: const Icon(Icons.delete_outline_rounded, color: Colors.red),
          ),
        ),
      ),
    ),
  ];

  List<Widget> _paymentWidgets() => [
    if (_payments.isEmpty)
      Padding(
        padding: const EdgeInsets.only(top: 12),
        child: Text(
          'Belum ada pembayaran tercatat.',
          style: TextStyle(color: Colors.grey.shade700),
        ),
      )
    else
      ..._payments.asMap().entries.map(
        (entry) => ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const CircleAvatar(
            backgroundColor: Color(0xFFE6F7ED),
            child: Icon(Icons.check, color: Colors.green),
          ),
          title: Text(
            _rupiah.format(entry.value.amount),
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
          subtitle: Text(
            '${_dateFormat.format(entry.value.date)}${entry.value.note.isEmpty ? '' : ' • ${entry.value.note}'}',
          ),
          trailing: IconButton(
            onPressed: () => setState(() => _payments.removeAt(entry.key)),
            icon: const Icon(Icons.close, color: Colors.red),
          ),
        ),
      ),
    TextButton.icon(
      onPressed: _addPayment,
      icon: const Icon(Icons.add_card_rounded),
      label: const Text('Catat pembayaran'),
    ),
  ];

  Widget _section(String title, {double top = 21}) => Padding(
    padding: EdgeInsets.only(top: top, bottom: 11),
    child: Text(
      title.toUpperCase(),
      style: const TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w800,
        color: _brandRed,
        letterSpacing: 1.1,
      ),
    ),
  );
  Widget _totalBox() => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: _brandCream,
      borderRadius: BorderRadius.circular(12),
    ),
    child: Column(
      children: [
        _amountLine('Total layanan', _total),
        _amountLine('Tercatat dibayar', _recordedPaid),
        const Divider(),
        _amountLine('Sisa tagihan', _due, accent: true),
      ],
    ),
  );
  Widget _amountLine(String label, double amount, {bool accent = false}) => Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Text(
        label,
        style: TextStyle(
          fontWeight: accent ? FontWeight.w800 : FontWeight.w500,
        ),
      ),
      Text(
        _rupiah.format(amount),
        style: TextStyle(
          fontWeight: FontWeight.w800,
          color: accent ? _brandRed : _brandInk,
        ),
      ),
    ],
  );
  String? _required(String? value) =>
      value == null || value.trim().isEmpty ? 'Wajib diisi' : null;
}

class ItemEditorSheet extends StatefulWidget {
  const ItemEditorSheet({super.key, required this.item});
  final InvoiceItem item;
  @override
  State<ItemEditorSheet> createState() => _ItemEditorSheetState();
}

class _ItemEditorSheetState extends State<ItemEditorSheet> {
  final _form = GlobalKey<FormState>();
  late String _type;
  late final TextEditingController _price, _quantity, _detail, _note;
  @override
  void initState() {
    super.initState();
    _type = _vehicleTypes.contains(widget.item.description)
        ? widget.item.description
        : _vehicleTypes.first;
    _price = TextEditingController(
      text: widget.item.price == 0
          ? ''
          : NumberFormat.decimalPattern('id_ID').format(widget.item.price),
    );
    _quantity = TextEditingController(
      text: widget.item.quantity.toStringAsFixed(
        widget.item.quantity % 1 == 0 ? 0 : 2,
      ),
    );
    _detail = TextEditingController(text: widget.item.detail);
    _note = TextEditingController(text: widget.item.note);
  }

  @override
  void dispose() {
    _price.dispose();
    _quantity.dispose();
    _detail.dispose();
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
    child: SafeArea(
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
        child: Form(
          key: _form,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 42,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'Item layanan',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _type,
                decoration: const InputDecoration(labelText: 'Jenis kendaraan'),
                items: _vehicleTypes
                    .map(
                      (type) =>
                          DropdownMenuItem(value: type, child: Text(type)),
                    )
                    .toList(),
                onChanged: (value) => setState(() => _type = value ?? _type),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    flex: 3,
                    child: TextFormField(
                      controller: _price,
                      keyboardType: TextInputType.number,
                      inputFormatters: [RupiahInputFormatter()],
                      decoration: const InputDecoration(
                        labelText: 'Harga',
                        prefixText: 'Rp ',
                        hintText: 'Contoh: 5.000.000',
                      ),
                      validator: (value) =>
                          _parseRupiah(value ?? '') <= 0 ? 'Isi harga' : null,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: TextFormField(
                      controller: _quantity,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: const InputDecoration(labelText: 'Qty'),
                      validator: (value) =>
                          (double.tryParse(
                                    (value ?? '').replaceAll(',', '.'),
                                  ) ??
                                  0) <=
                              0
                          ? 'Isi qty'
                          : null,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _detail,
                minLines: 3,
                maxLines: 5,
                decoration: const InputDecoration(
                  labelText: 'Rute / detail layanan',
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _note,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Catatan item (tampil di bawah item pada invoice)',
                  hintText: 'Contoh: Harga belum termasuk tol dan parkir',
                ),
              ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: _brandRed,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  onPressed: () {
                    if (!_form.currentState!.validate()) return;
                    Navigator.pop(
                      context,
                      InvoiceItem(
                        description: _type,
                        price: _parseRupiah(_price.text),
                        quantity: double.parse(
                          _quantity.text.replaceAll(',', '.'),
                        ),
                        detail: _detail.text.trim(),
                        note: _note.text.trim(),
                      ),
                    );
                  },
                  icon: const Icon(Icons.check_rounded),
                  label: const Text('SIMPAN ITEM'),
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class PaymentEditorSheet extends StatefulWidget {
  const PaymentEditorSheet({
    super.key,
    required this.suggestedAmount,
    required this.defaultNote,
  });
  final double suggestedAmount;
  final String defaultNote;

  @override
  State<PaymentEditorSheet> createState() => _PaymentEditorSheetState();
}

class _PaymentEditorSheetState extends State<PaymentEditorSheet> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _amount, _reference, _note;
  late DateTime _date;
  String _account = _paymentAccounts.first;
  String _method = _paymentMethods.first;

  @override
  void initState() {
    super.initState();
    _amount = TextEditingController(
      text: widget.suggestedAmount <= 0
          ? ''
          : NumberFormat.decimalPattern('id_ID').format(widget.suggestedAmount),
    );
    _reference = TextEditingController();
    _note = TextEditingController(text: widget.defaultNote);
    _date = DateTime.now();
  }

  @override
  void dispose() {
    _amount.dispose();
    _reference.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
      locale: const Locale('id', 'ID'),
    );
    if (picked != null) setState(() => _date = picked);
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
    child: SafeArea(
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
        child: Form(
          key: _form,
          child: ListView(
            shrinkWrap: true,
            children: [
              Center(
                child: Container(
                  width: 42,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'Tambah pembayaran',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 20),
              DropdownButtonFormField<String>(
                initialValue: _account,
                decoration: const InputDecoration(
                  labelText: 'Dibayar ke rekening',
                ),
                items: _paymentAccounts
                    .map(
                      (item) =>
                          DropdownMenuItem(value: item, child: Text(item)),
                    )
                    .toList(),
                onChanged: (value) =>
                    setState(() => _account = value ?? _account),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _amount,
                      keyboardType: TextInputType.number,
                      inputFormatters: [RupiahInputFormatter()],
                      decoration: const InputDecoration(
                        labelText: 'Nominal',
                        prefixText: 'Rp ',
                        hintText: 'Contoh: 5.000.000',
                      ),
                      validator: (value) =>
                          _parseRupiah(value ?? '') <= 0 ? 'Isi nominal' : null,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _pickDate,
                      icon: const Icon(Icons.calendar_today_outlined, size: 17),
                      label: Text(DateFormat('dd/MM/yyyy').format(_date)),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _method,
                      decoration: const InputDecoration(
                        labelText: 'Metode pembayaran',
                      ),
                      items: _paymentMethods
                          .map(
                            (item) => DropdownMenuItem(
                              value: item,
                              child: Text(item),
                            ),
                          )
                          .toList(),
                      onChanged: (value) =>
                          setState(() => _method = value ?? _method),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _reference,
                      decoration: const InputDecoration(
                        labelText: 'No. referensi',
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _note,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Catatan internal',
                  hintText: 'Opsional, tidak terlihat oleh pelanggan',
                ),
              ),
              const SizedBox(height: 20),
              FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: _brandRed,
                  padding: const EdgeInsets.symmetric(vertical: 15),
                ),
                onPressed: () {
                  if (!_form.currentState!.validate()) return;
                  Navigator.pop(
                    context,
                    Payment(
                      amount: _parseRupiah(_amount.text),
                      date: _date,
                      note: _note.text.trim(),
                      account: _account,
                      method: _method,
                      reference: _reference.text.trim(),
                    ),
                  );
                },
                icon: const Icon(Icons.check_rounded),
                label: const Text('SIMPAN PEMBAYARAN'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class InvoiceDetail extends StatefulWidget {
  const InvoiceDetail({
    super.key,
    required this.invoice,
    required this.onChanged,
    required this.officeAddresses,
  });
  final Invoice invoice;
  final Future<void> Function(Invoice invoice) onChanged;
  final List<OfficeAddress> officeAddresses;
  @override
  State<InvoiceDetail> createState() => _InvoiceDetailState();
}

class _InvoiceDetailState extends State<InvoiceDetail> {
  late Invoice _invoice;
  @override
  void initState() {
    super.initState();
    _invoice = widget.invoice;
  }

  Future<void> _edit() async {
    final changed = await Navigator.push<Invoice>(
      context,
      MaterialPageRoute(
        builder: (_) => InvoiceEditor(
          invoice: _invoice,
          nextNumber: _invoice.number,
          officeAddresses: widget.officeAddresses,
        ),
      ),
    );
    if (changed != null && mounted) {
      setState(() => _invoice = changed);
      Navigator.pop(context, changed);
    }
  }

  Future<void> _addPayment() async {
    final result = await showModalBottomSheet<Payment>(
      context: context,
      isScrollControlled: true,
      builder: (_) => PaymentEditorSheet(
        suggestedAmount: _invoice.due,
        defaultNote: _invoice.status == 'DP / SEBAGIAN'
            ? 'Pelunasan'
            : 'Pembayaran',
      ),
    );
    if (result == null || result.amount <= 0 || !mounted) return;
    setState(() {
      _invoice.payments.add(result);
      _invoice.paymentStatus = _invoice.due < 1
          ? 'lunas'
          : _invoice.recordedPaid > 0
          ? 'dp'
          : 'auto';
    });
    await widget.onChanged(_invoice);
  }

  Future<void> _markPaid() async {
    setState(() => _invoice.paymentStatus = 'lunas');
    await widget.onChanged(_invoice);
  }

  Future<void> _export() async {
    final bytes = await InvoicePdf.create(_invoice);
    if (!mounted) return;
    await Printing.sharePdf(bytes: bytes, filename: '${_invoice.number}.pdf');
  }

  Future<void> _preview() async {
    final bytes = await InvoicePdf.create(_invoice);
    if (!mounted) return;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => PdfPreviewScreen(invoice: _invoice, bytes: bytes),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(_invoice.number),
      actions: [
        IconButton(onPressed: _edit, icon: const Icon(Icons.edit_outlined)),
        IconButton(
          onPressed: _export,
          icon: const Icon(Icons.ios_share_rounded),
        ),
      ],
    ),
    body: ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 34),
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _invoice.customer,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 25,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Dibuat ${_dateFormat.format(_invoice.issueDate)}',
                    style: TextStyle(color: Colors.grey.shade700),
                  ),
                ],
              ),
            ),
            _statusPill(),
          ],
        ),
        const SizedBox(height: 22),
        _amountCard(),
        const SizedBox(height: 18),
        _block(
          'Layanan',
          _invoice.items
              .map(
                (e) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              e.description,
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            if (e.detail.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 3),
                                child: Text(
                                  e.detail,
                                  style: TextStyle(color: Colors.grey.shade700),
                                ),
                              ),
                            if (e.note.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 6),
                                child: Text(
                                  'Catatan: ${e.note}',
                                  style: TextStyle(
                                    color: _brandRed,
                                    fontSize: 12,
                                    fontStyle: FontStyle.italic,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                      Text(
                        '${_rupiah.format(e.total)}\n${e.quantity} × ${_rupiah.format(e.price)}',
                        textAlign: TextAlign.right,
                        style: const TextStyle(fontSize: 12),
                      ),
                    ],
                  ),
                ),
              )
              .toList(),
        ),
        const SizedBox(height: 14),
        FilledButton.icon(
          style: FilledButton.styleFrom(
            backgroundColor: Colors.green.shade700,
            padding: const EdgeInsets.symmetric(vertical: 15),
          ),
          onPressed: _addPayment,
          icon: const Icon(Icons.add_card_rounded),
          label: const Text('TAMBAH PEMBAYARAN'),
        ),
        if (!_invoice.isPaid) ...[
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: _markPaid,
            icon: const Icon(Icons.verified_rounded),
            label: const Text('TANDAI LUNAS'),
          ),
        ],
        const SizedBox(height: 14),
        _block(
          'Pembayaran',
          _invoice.payments.isEmpty
              ? [
                  Text(
                    'Belum ada pembayaran.',
                    style: TextStyle(color: Colors.grey.shade700),
                  ),
                ]
              : _invoice.payments
                    .map(
                      (e) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(
                          Icons.check_circle,
                          color: Colors.green,
                        ),
                        title: Text(
                          _rupiah.format(e.amount),
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        subtitle: Text(
                          '${_dateFormat.format(e.date)} • ${e.method} ke ${e.account}${e.reference.isEmpty ? '' : '\nRef: ${e.reference}'}${e.note.isEmpty ? '' : '\n${e.note}'}',
                        ),
                      ),
                    )
                    .toList(),
        ),
        const SizedBox(height: 14),
        _block('Ketentuan', [
          Text(_invoice.terms, style: const TextStyle(height: 1.55)),
        ]),
        const SizedBox(height: 25),
        FilledButton.icon(
          style: FilledButton.styleFrom(
            backgroundColor: _brandRed,
            padding: const EdgeInsets.symmetric(vertical: 16),
          ),
          onPressed: _preview,
          icon: const Icon(Icons.picture_as_pdf_rounded),
          label: const Text('PREVIEW & CETAK PDF'),
        ),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: _export,
          icon: const Icon(Icons.share_rounded),
          label: const Text('Bagikan PDF'),
        ),
      ],
    ),
  );
  Widget _statusPill() => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
    decoration: BoxDecoration(
      color: _invoice.isPaid
          ? const Color(0xFFE6F7ED)
          : const Color(0xFFFFEEE9),
      borderRadius: BorderRadius.circular(30),
    ),
    child: Text(
      _invoice.status,
      style: TextStyle(
        fontWeight: FontWeight.bold,
        color: _invoice.isPaid ? const Color(0xFF15803D) : _brandRed,
      ),
    ),
  );
  Widget _amountCard() => Container(
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(
      color: _brandInk,
      borderRadius: BorderRadius.circular(20),
    ),
    child: Column(
      children: [
        _line('Total', _invoice.total, Colors.white),
        const Divider(color: Colors.white24, height: 23),
        _line('Sudah dibayar', _invoice.paid, const Color(0xFF8EE9B3)),
        const SizedBox(height: 8),
        _line('Sisa tagihan', _invoice.due, const Color(0xFFFFB0A9)),
      ],
    ),
  );
  Widget _line(String a, double b, Color color) => Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Text(a, style: const TextStyle(color: Colors.white70)),
      Text(
        _rupiah.format(b),
        style: TextStyle(
          color: color,
          fontWeight: FontWeight.bold,
          fontSize: 17,
        ),
      ),
    ],
  );
  Widget _block(String title, List<Widget> children) => Container(
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(17),
      border: Border.all(color: const Color(0xFFE8E8E8)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
        ),
        const Divider(height: 22),
        ...children,
      ],
    ),
  );
}

class PdfPreviewScreen extends StatelessWidget {
  const PdfPreviewScreen({
    super.key,
    required this.invoice,
    required this.bytes,
  });
  final Invoice invoice;
  final Uint8List bytes;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Preview invoice')),
    body: PdfPreview(
      build: (_) async => bytes,
      canChangePageFormat: false,
      canChangeOrientation: false,
      allowPrinting: true,
      allowSharing: true,
      pdfFileName: '${invoice.number}.pdf',
    ),
  );
}

class InvoicePdf {
  static Future<Uint8List> create(Invoice invoice) async {
    final logo = pw.MemoryImage(
      (await rootBundle.load(
        'assets/images/happy_group_logo.png',
      )).buffer.asUint8List(),
    );
    final signature = pw.MemoryImage(
      (await rootBundle.load(
        'assets/images/signature_kiki_stamp.png',
      )).buffer.asUint8List(),
    );
    final paidStamp = pw.MemoryImage(
      (await rootBundle.load(
        'assets/images/paid_stamp.png',
      )).buffer.asUint8List(),
    );
    final document = pw.Document();
    const red = PdfColor.fromInt(0xFFE52322);
    const ink = PdfColor.fromInt(0xFF1D1D1B);
    document.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.fromLTRB(38, 35, 38, 35),
        build: (context) => [
          pw.Row(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Image(logo, width: 160),
              pw.Spacer(),
              pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.end,
                children: [
                  pw.Text(
                    'PT. HAPPY TRANS HARYADI',
                    style: pw.TextStyle(
                      fontWeight: pw.FontWeight.bold,
                      fontSize: 11,
                      color: ink,
                    ),
                  ),
                  pw.SizedBox(height: 4),
                  pw.SizedBox(
                    width: 220,
                    child: pw.Text(
                      'Kantor: ${invoice.companyAddress}\n+62 811-2867-917',
                      textAlign: pw.TextAlign.right,
                      style: const pw.TextStyle(fontSize: 8, lineSpacing: 2),
                    ),
                  ),
                ],
              ),
            ],
          ),
          pw.SizedBox(height: 22),
          pw.Container(height: 3, color: red),
          pw.SizedBox(height: 18),
          pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Text(
                    'BILL TO',
                    style: pw.TextStyle(
                      color: red,
                      fontSize: 9,
                      fontWeight: pw.FontWeight.bold,
                      letterSpacing: 1,
                    ),
                  ),
                  pw.SizedBox(height: 5),
                  pw.Text(
                    invoice.customer,
                    style: pw.TextStyle(
                      fontSize: 15,
                      fontWeight: pw.FontWeight.bold,
                    ),
                  ),
                  if (invoice.customerAddress.isNotEmpty)
                    pw.SizedBox(
                      width: 230,
                      child: pw.Text(
                        invoice.customerAddress,
                        style: const pw.TextStyle(fontSize: 9),
                      ),
                    ),
                  if (invoice.customerPhone.isNotEmpty)
                    pw.Text(
                      invoice.customerPhone,
                      style: const pw.TextStyle(fontSize: 9),
                    ),
                ],
              ),
              pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.end,
                children: [
                  pw.Text(
                    'INVOICE',
                    style: pw.TextStyle(
                      color: red,
                      fontSize: 25,
                      fontWeight: pw.FontWeight.bold,
                    ),
                  ),
                  pw.SizedBox(height: 5),
                  _pdfPair('Invoice #', invoice.number),
                  _pdfPair('Tanggal', _dateFormat.format(invoice.issueDate)),
                ],
              ),
            ],
          ),
          pw.SizedBox(height: 25),
          pw.Table(
            border: pw.TableBorder.all(color: PdfColors.grey400, width: .5),
            columnWidths: {
              0: const pw.FlexColumnWidth(4.4),
              1: const pw.FlexColumnWidth(1.55),
              2: const pw.FlexColumnWidth(.75),
              3: const pw.FlexColumnWidth(1.7),
            },
            children: [
              pw.TableRow(
                decoration: const pw.BoxDecoration(color: ink),
                children: ['ITEMS / DESKRIPSI', 'HARGA', 'QTY', 'TOTAL']
                    .map(
                      (text) => pw.Padding(
                        padding: const pw.EdgeInsets.all(8),
                        child: pw.Text(
                          text,
                          textAlign: text == 'ITEMS / DESKRIPSI'
                              ? pw.TextAlign.left
                              : pw.TextAlign.right,
                          style: pw.TextStyle(
                            fontSize: 8,
                            color: PdfColors.white,
                            fontWeight: pw.FontWeight.bold,
                          ),
                        ),
                      ),
                    )
                    .toList(),
              ),
              ...invoice.items.map(
                (item) => pw.TableRow(
                  children: [
                    pw.Padding(
                      padding: const pw.EdgeInsets.all(8),
                      child: pw.Column(
                        crossAxisAlignment: pw.CrossAxisAlignment.start,
                        children: [
                          pw.Text(
                            item.description,
                            style: pw.TextStyle(
                              fontWeight: pw.FontWeight.bold,
                              fontSize: 10,
                            ),
                          ),
                          if (item.detail.isNotEmpty) pw.SizedBox(height: 4),
                          if (item.detail.isNotEmpty)
                            pw.Text(
                              item.detail,
                              style: const pw.TextStyle(
                                fontSize: 8,
                                lineSpacing: 2,
                              ),
                            ),
                          if (item.note.isNotEmpty) pw.SizedBox(height: 5),
                          if (item.note.isNotEmpty)
                            pw.Text(
                              'Catatan: ${item.note}',
                              style: pw.TextStyle(
                                fontSize: 8,
                                color: red,
                                fontStyle: pw.FontStyle.italic,
                              ),
                            ),
                        ],
                      ),
                    ),
                    _pdfCell(_rupiah.format(item.price)),
                    _pdfCell(
                      item.quantity.toStringAsFixed(
                        item.quantity % 1 == 0 ? 0 : 2,
                      ),
                    ),
                    _pdfCell(_rupiah.format(item.total)),
                  ],
                ),
              ),
            ],
          ),
          pw.SizedBox(height: 20),
          pw.Row(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Expanded(
                flex: 5,
                child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text(
                      'TERMS',
                      style: pw.TextStyle(
                        color: red,
                        fontSize: 9,
                        fontWeight: pw.FontWeight.bold,
                        letterSpacing: 1,
                      ),
                    ),
                    pw.SizedBox(height: 5),
                    pw.Text(
                      invoice.terms,
                      style: const pw.TextStyle(fontSize: 8, lineSpacing: 2),
                    ),
                    if (invoice.notes.isNotEmpty) pw.SizedBox(height: 14),
                    if (invoice.notes.isNotEmpty)
                      pw.Text(
                        'NOTES',
                        style: pw.TextStyle(
                          color: red,
                          fontSize: 9,
                          fontWeight: pw.FontWeight.bold,
                          letterSpacing: 1,
                        ),
                      ),
                    if (invoice.notes.isNotEmpty) pw.SizedBox(height: 5),
                    if (invoice.notes.isNotEmpty)
                      pw.Text(
                        invoice.notes,
                        style: const pw.TextStyle(fontSize: 8),
                      ),
                  ],
                ),
              ),
              pw.SizedBox(width: 24),
              pw.Expanded(
                flex: 4,
                child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.stretch,
                  children: [
                    pw.Container(
                      padding: const pw.EdgeInsets.all(10),
                      decoration: pw.BoxDecoration(
                        border: pw.Border.all(color: PdfColors.grey400),
                      ),
                      child: pw.Column(
                        children: [
                          _pdfTotal('Total', invoice.total, false),
                          _pdfTotal('Paid', invoice.paid, false),
                          pw.Divider(color: PdfColors.grey500),
                          _pdfTotal('Amount Due (IDR)', invoice.due, true),
                        ],
                      ),
                    ),
                    if (invoice.isPaid) pw.SizedBox(height: 8),
                    if (invoice.isPaid)
                      pw.Center(
                        child: pw.Opacity(
                          opacity: .8,
                          child: pw.Image(paidStamp, width: 165),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          pw.SizedBox(height: 22),
          pw.Row(
            crossAxisAlignment: pw.CrossAxisAlignment.end,
            children: [
              pw.Expanded(
                child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text(
                      'BANK ACCOUNT',
                      style: pw.TextStyle(
                        color: red,
                        fontSize: 9,
                        fontWeight: pw.FontWeight.bold,
                        letterSpacing: 1,
                      ),
                    ),
                    pw.SizedBox(height: 5),
                    pw.Text(
                      'PT HAPPY TRANS HARYADI\nBCA 846-598-6111\nMANDIRI 137.004747.1111\nARI HARYADI - BCA 8465-688-111',
                      style: const pw.TextStyle(fontSize: 8, lineSpacing: 2),
                    ),
                  ],
                ),
              ),
              pw.SizedBox(width: 20),
              pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.center,
                children: [
                  pw.Text(
                    'Hormat kami,',
                    style: const pw.TextStyle(fontSize: 8),
                  ),
                  pw.SizedBox(height: 2),
                  pw.Text(
                    'PT. HAPPY TRANS HARYADI',
                    style: pw.TextStyle(
                      fontSize: 7,
                      fontWeight: pw.FontWeight.bold,
                    ),
                  ),
                  pw.Text(
                    _dateFormat.format(invoice.issueDate),
                    style: const pw.TextStyle(fontSize: 7),
                  ),
                  pw.SizedBox(height: 3),
                  pw.Image(
                    signature,
                    width: 145,
                    height: 88,
                    fit: pw.BoxFit.contain,
                  ),
                  pw.Text(
                    'Kiki Saputri',
                    style: pw.TextStyle(
                      fontSize: 9,
                      fontWeight: pw.FontWeight.bold,
                    ),
                  ),
                  pw.Text('Finance', style: const pw.TextStyle(fontSize: 8)),
                ],
              ),
            ],
          ),
        ],
      ),
    );
    return document.save();
  }

  static pw.Widget _pdfCell(String text) => pw.Padding(
    padding: const pw.EdgeInsets.all(8),
    child: pw.Text(
      text,
      textAlign: pw.TextAlign.right,
      style: const pw.TextStyle(fontSize: 8),
    ),
  );
  static pw.Widget _pdfPair(String label, String value) => pw.Row(
    mainAxisSize: pw.MainAxisSize.min,
    children: [
      pw.Text('$label: ', style: const pw.TextStyle(fontSize: 8)),
      pw.Text(
        value,
        style: pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold),
      ),
    ],
  );
  static pw.Widget _pdfTotal(String label, double value, bool bold) =>
      pw.Padding(
        padding: const pw.EdgeInsets.symmetric(vertical: 3),
        child: pw.Row(
          mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
          children: [
            pw.Text(
              label,
              style: pw.TextStyle(
                fontSize: bold ? 10 : 8,
                fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
              ),
            ),
            pw.Text(
              _rupiah.format(value),
              style: pw.TextStyle(
                fontSize: bold ? 10 : 8,
                fontWeight: pw.FontWeight.bold,
                color: bold
                    ? const PdfColor.fromInt(0xFFE52322)
                    : PdfColors.black,
              ),
            ),
          ],
        ),
      );
}
