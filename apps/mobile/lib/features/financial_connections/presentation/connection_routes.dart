// THE DATA-SOURCE NAVIGATION LOCATIONS.
//
// EVERY SEGMENT IS A LITERAL OR AN OPAQUE IDENTIFIER. No connection label, no
// issuer name, no rail and no date is ever put in a location: a route is the
// one piece of client state that ends up in a deep link, a restoration bundle
// and a framework log line, and a person's financial structure has no business
// in any of them. The account identifier is opaque, which is what makes it safe
// in a path segment.
//
// ## Why these do not begin with `/financial`
//
// The sibling financial surfaces use `/financial/...`, and this one reads
// `/data-sources` instead. That is deliberate and it is enforced:
// `test/architecture/financial_contract_reading_test.dart` fails the build on a
// `'/financial…'` string literal anywhere under `lib` outside the generated
// client, with a single named exemption for the existing financial route
// constants. A second exempted file would be a second place where a contract
// path could hide, so this feature takes a location prefix that cannot be
// confused with one — exactly as the statement-import and transfer-matching
// surfaces do. These are in-app navigation locations; they were never API
// paths.
//
// ## Why the prefix says "data sources" rather than "connections"
//
// A location is read by people. `/connections` in a finance application means
// "the banks I have linked", and this platform links to none. The contract's
// word for the entity is `connection` and the domain keeps it, because the
// contract's word is the contract's; the part a person sees says what is
// actually true.
abstract final class ConnectionRoutes {
  /// Where the person's data comes from: every connection they hold, and the
  /// honest state of every rail this platform has not built.
  static const String dataSources = '/data-sources';

  /// The sources feeding ONE account: their stated priority, what each covers,
  /// and when anything last arrived through it.
  static const String accountSources = '/data-sources/accounts/:accountId';

  /// The path parameter [accountSources] reads.
  static const String accountIdParameter = 'accountId';

  static String accountSourcesPath(String accountId) =>
      '$dataSources/accounts/$accountId';
}
