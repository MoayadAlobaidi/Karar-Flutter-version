// THE STATEMENT-IMPORT NAVIGATION LOCATIONS.
//
// EVERY SEGMENT IS AN OPAQUE IDENTIFIER OR A LITERAL. No account name, no
// filename, no amount and no currency is ever put in a location: a route is the
// one piece of client state that ends up in a deep link, a restoration bundle
// and a framework log line, and neither financial data nor anything read out of
// an uploaded file has any business in one.
//
// A filename in particular would be a leak with no upside — the platform stores
// none, so a location carrying one would exist only to be logged.
//
// ## Why these do not begin with `/financial`
//
// The sibling financial surfaces use `/financial/...`, and this one reads
// `/statement-imports` instead. That is deliberate and it is enforced:
// `test/architecture/financial_contract_reading_test.dart` fails the build on a
// `'/financial…'` string literal anywhere under `lib` outside the generated
// client, with a single named exemption for the existing financial route
// constants. A second exempted file would be a second place where a contract
// path could hide, so this feature takes a location prefix that cannot be
// confused with one instead of asking for an exemption it does not need. The
// locations are in-app navigation; they were never API paths.
abstract final class StatementImportRoutes {
  /// The first step: choose an account, choose a file, upload it.
  static const String start = '/statement-imports';

  /// The mapping step for one import. The identifier is opaque.
  static const String mapping = '/statement-imports/:importId/columns';

  /// The review step for one import.
  static const String review = '/statement-imports/:importId/review';

  static String mappingPath(String importId) => '$start/$importId/columns';

  static String reviewPath(String importId) => '$start/$importId/review';

  /// The path parameter every parameterised location above reads.
  static const String importIdParameter = 'importId';
}
