// THE TRANSFER-MATCHING NAVIGATION LOCATIONS.
//
// EVERY SEGMENT IS A LITERAL. No account name, no amount, no currency and no
// transaction reference is ever put in a location: a route is the one piece of
// client state that ends up in a deep link, a restoration bundle and a
// framework log line, and a person's financial structure has no business in any
// of them.
//
// ## Why these do not begin with `/financial`
//
// The sibling financial surfaces use `/financial/...`, and this one reads
// `/transfer-matches` instead. That is deliberate and it is enforced:
// `test/architecture/financial_contract_reading_test.dart` fails the build on a
// `'/financial…'` string literal anywhere under `lib` outside the generated
// client, with a single named exemption for the existing financial route
// constants. A second exempted file would be a second place where a contract
// path could hide, so this feature takes a location prefix that cannot be
// confused with one — exactly as the statement-import surface does. These are
// in-app navigation locations; they were never API paths.
//
// ## Why there is no per-match location
//
// The contract offers no read-one operation for a match, and inventing one on
// the client — paging the whole listing until an identifier turns up — would
// make a deep link's cost depend on how many decisions a person has already
// taken. The evidence for one pair is opened INSIDE the listing instead, which
// is also why no match identifier appears in a location.
abstract final class TransferMatchRoutes {
  /// Every pair the platform has proposed, and every one already decided.
  static const String matches = '/transfer-matches';
}
