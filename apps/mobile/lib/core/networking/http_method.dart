// PURE DART ONLY.
//
// Safety and idempotency are properties the retry and replay logic reads
// directly. They are declared once, here, so no call site has to remember
// whether a POST may be repeated.
/// HTTP methods the client issues.
enum HttpMethod {
  get(isSafe: true, isIdempotent: true),
  head(isSafe: true, isIdempotent: true),
  post(isSafe: false, isIdempotent: false),
  put(isSafe: false, isIdempotent: true),
  patch(isSafe: false, isIdempotent: false),
  delete(isSafe: false, isIdempotent: true);

  const HttpMethod({required this.isSafe, required this.isIdempotent});

  /// A safe method has no side effect the caller is responsible for.
  final bool isSafe;

  /// An idempotent method may be repeated without changing the outcome.
  /// A non-idempotent method is NEVER retried automatically, and never
  /// replayed after a token refresh, unless it carries an idempotency key.
  final bool isIdempotent;

  /// The wire representation.
  String get wireName => name.toUpperCase();
}
