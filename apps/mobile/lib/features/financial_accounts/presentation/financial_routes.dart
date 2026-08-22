// The financial routes.
//
// EVERY PATH SEGMENT IS AN OPAQUE IDENTIFIER OR A LITERAL. No display name, no
// mask, no amount, no currency and no issuer name is ever put in a location:
// a route is the one piece of client state that ends up in a deep link, a
// restoration bundle and a framework log line, and financial data has no
// business in any of them.
//
// Literal paths are declared BEFORE the parameterised ones they would
// otherwise be captured by, so `/financial/accounts/new` is the create form
// and not an account whose id is the word "new".
abstract final class FinancialRoutes {
  /// The portfolio.
  static const String accounts = '/financial/accounts';

  /// The manual-account form.
  static const String accountCreate = '/financial/accounts/new';

  /// One account or wallet.
  static const String accountDetail = '/financial/accounts/:accountId';

  /// The edit form for one account.
  static const String accountEdit = '/financial/accounts/:accountId/edit';

  /// The transaction listing.
  static const String transactions = '/financial/transactions';

  /// The manual-transaction form.
  static const String transactionCreate = '/financial/transactions/new';

  /// One transaction.
  static const String transactionDetail = '/financial/transactions/:transactionId';

  /// The correction form for one transaction.
  static const String transactionCorrect =
      '/financial/transactions/:transactionId/correct';

  /// The category catalogue, for one transaction.
  static const String transactionCategory =
      '/financial/transactions/:transactionId/category';

  static String accountDetailPath(String accountId) => '$accounts/$accountId';

  static String accountEditPath(String accountId) => '$accounts/$accountId/edit';

  /// The listing narrowed to one account. The identifier is opaque, which is
  /// what makes it safe in a query.
  static String transactionsForAccount(String accountId) =>
      '$transactions?accountId=$accountId';

  static String transactionDetailPath(String transactionId) =>
      '$transactions/$transactionId';

  static String transactionCorrectPath(String transactionId) =>
      '$transactions/$transactionId/correct';

  static String transactionCategoryPath(String transactionId) =>
      '$transactions/$transactionId/category';

  /// The query parameter the listing reads its account filter from.
  static const String accountIdQueryParameter = 'accountId';
}
