/// Every Flutter feature folder that holds financial code.
///
/// ONE list, imported by every guard that scans the financial tree. It used to
/// be written out twice — four roots in
/// `test/features/financial_accounts/architecture_test.dart` and the same four
/// again in `test/architecture/financial_contract_reading_test.dart` — under a
/// comment describing "the four feature folders this workstream owns". The
/// workstreams finished; the folders became seven; the lists did not move.
///
/// The cost was not theoretical: 41 of the 87 financial `.dart` files — the
/// whole of `financial_connections`, `statement_imports` and
/// `transfer_matching` — were scanned by NO money rule at all, including a live
/// money entry field in the statement-import column-mapping form and the amount
/// rendering on the transfer-matches screen.
///
/// A guard whose file list is maintained by hand fails the way this one did:
/// silently, and in the direction of scanning less.
const List<String> financialFeatureRoots = <String>[
  'lib/features/financial_accounts',
  'lib/features/financial_connections',
  'lib/features/payment_instruments',
  'lib/features/statement_imports',
  'lib/features/transaction_categories',
  'lib/features/transactions',
  'lib/features/transfer_matching',
];
