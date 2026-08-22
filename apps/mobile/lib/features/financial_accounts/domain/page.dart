// PURE DART ONLY. See lib/README.md — domain purity.
//
// One page of a keyset-paginated listing.
//
// `hasMore` is carried rather than inferred. The platform states it because an
// empty page can be a stated end or a sparse middle, and a client that guessed
// from `items.isEmpty` would stop a month early on a filtered listing.
import 'package:meta/meta.dart';

/// What a page IS, as the platform stated it.
@immutable
final class PageCursor {
  const PageCursor({
    required this.limit,
    required this.returned,
    required this.hasMore,
    required this.nextCursor,
  });

  final int limit;
  final int returned;

  /// Whether the STORE has more rows. Never derived from the returned count:
  /// filters are applied after the keyset query, so a short page can still
  /// have a successor.
  final bool hasMore;

  /// Opaque. It encodes a position in the caller's own result set and is
  /// echoed back untouched; it is never parsed, and never put in a route.
  final String? nextCursor;

  @override
  String toString() => 'PageCursor()';
}

/// A page of results with the cursor that describes it.
@immutable
final class Page<T> {
  const Page({required this.items, required this.cursor});

  final List<T> items;
  final PageCursor cursor;

  bool get isEmpty => items.isEmpty;

  /// This page followed by [next], preserving order. Used to accumulate a
  /// listing as a person scrolls.
  Page<T> followedBy(Page<T> next) => Page<T>(
        items: List<T>.unmodifiable(<T>[...items, ...next.items]),
        cursor: next.cursor,
      );

  @override
  String toString() => 'Page<$T>(${items.length})';
}
