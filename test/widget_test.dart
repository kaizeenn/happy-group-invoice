import 'package:flutter_test/flutter_test.dart';
import 'package:happy_group_invoice/main.dart';

void main() {
  test('Invoice calculates balance and paid state', () {
    final invoice = Invoice(
      id: '1',
      number: 'TEST-001',
      issueDate: DateTime(2026, 9, 15),
      customer: 'Test Customer',
      items: [
        InvoiceItem(description: 'Sewa Unit', price: 15000000, quantity: 1),
      ],
      payments: [Payment(amount: 7500000, date: DateTime(2026, 9, 15))],
    );

    expect(invoice.total, 15000000);
    expect(invoice.due, 7500000);
    expect(invoice.isPaid, isFalse);

    invoice.payments.add(Payment(amount: 7500000, date: DateTime(2026, 9, 16)));
    expect(invoice.due, 0);
    expect(invoice.isPaid, isTrue);
  });
}
