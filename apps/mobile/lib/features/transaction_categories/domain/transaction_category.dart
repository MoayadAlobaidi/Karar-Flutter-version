// PURE DART ONLY. See lib/README.md — domain purity.
//
// THE REVIEWED CATEGORY CATALOGUE.
//
// Non-personal reference data, identical for every principal. The catalogue
// changes by reviewed migration; there is no runtime write path, and a
// subject's own label never becomes a catalogue row — so this client offers no
// way to create one.
//
// `assignable` is STATED by the platform and is never derived from
// `retiredAt`. A retired entry stays listed so an existing assignment remains
// readable, and a client that worked out selectability from a timestamp would
// disagree with the server the first time the two rules differed.
//
// There is no confidence, no score and no suggestion anywhere in this feature.
// None exists in the platform, and a client that invented one would be
// presenting a guess as a fact.
import 'package:meta/meta.dart';

/// One catalogue entry.
@immutable
final class TransactionCategory {
  const TransactionCategory({
    required this.code,
    required this.parentCode,
    required this.labelEn,
    required this.labelAr,
    required this.catalogueVersion,
    required this.assignable,
    required this.retiredAt,
  });

  /// A dotted catalogue code, at most three levels deep.
  final String code;

  final String? parentCode;

  /// The catalogue's own labels. They are reference data in two languages,
  /// not translations this client owns, so they do not go through the ARB.
  final String labelEn;
  final String labelAr;

  final String catalogueVersion;

  /// Whether this entry may be chosen NOW. Stated, never derived.
  final bool assignable;

  final DateTime? retiredAt;

  /// How deep this entry sits, from its own code. Used for indentation only.
  int get depth => '.'.allMatches(code).length;

  @override
  String toString() => 'TransactionCategory($code)';
}

/// The catalogue as one list, with the assignable entries kept apart from the
/// retired ones the screen still has to resolve names from.
@immutable
final class CategoryCatalogue {
  const CategoryCatalogue(this.entries);

  final List<TransactionCategory> entries;

  bool get isEmpty => entries.isEmpty;

  /// Entries a person may choose right now.
  List<TransactionCategory> get assignable => <TransactionCategory>[
        for (final entry in entries)
          if (entry.assignable) entry,
      ];

  /// The entry for [code], or null. A code the catalogue does not hold is
  /// rendered as the code itself rather than as a guessed label.
  TransactionCategory? lookup(String code) {
    for (final entry in entries) {
      if (entry.code == code) {
        return entry;
      }
    }
    return null;
  }

  /// The assignable entries whose code or either label contains [query],
  /// case-insensitively. Matching is local to what the platform already sent.
  List<TransactionCategory> search(String query) {
    final needle = query.trim().toLowerCase();
    if (needle.isEmpty) {
      return assignable;
    }
    return <TransactionCategory>[
      for (final entry in assignable)
        if (entry.code.toLowerCase().contains(needle) ||
            entry.labelEn.toLowerCase().contains(needle) ||
            entry.labelAr.contains(query.trim()))
          entry,
    ];
  }

  @override
  String toString() => 'CategoryCatalogue(${entries.length})';
}
