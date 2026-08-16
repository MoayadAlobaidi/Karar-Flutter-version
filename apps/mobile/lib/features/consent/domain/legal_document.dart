// PURE DART ONLY. See lib/README.md — domain purity.
//
// LEGAL DOCUMENTS, AS SAFE METADATA.
//
// This type carries what a person needs in order to know WHICH document is in
// front of them: which entity published it, which regime it belongs to, which
// purposes it covers, which version is in force, when it took effect, and what
// the platform says the reader must do about it.
//
// It deliberately carries no document body and no title composed by the
// client. Legal wording is published by the platform in the language it was
// published in; a client that assembled its own would be asserting terms
// nobody approved. The storage locator and content hash are internal
// references and are not modelled here either — they are not information a
// reader can act on, and a client that showed them would invite support
// questions it cannot answer.
import 'package:meta/meta.dart';

/// What the platform says the reader must do about a version.
enum LegalDocumentAction {
  /// The change is material; the standing grant no longer covers it.
  reacceptanceRequired,

  /// The reader must be shown the change; no new acceptance is required.
  noticeRequired,

  /// Nothing is asked of the reader.
  noUserActionRequired,

  /// The platform did not classify the version, or classified it in a way this
  /// build does not recognise. Never softened into "nothing to do".
  unstated,
}

/// The published version of a legal document that is currently in force.
@immutable
final class LegalDocumentVersion {
  const LegalDocumentVersion({
    required this.versionId,
    required this.version,
    required this.action,
    this.effectiveAt,
  });

  /// The identifier an acceptance is pinned to. Sent back verbatim; never
  /// composed.
  final String versionId;

  /// The human-readable version label the platform published.
  final String version;

  final LegalDocumentAction action;

  /// When the version took effect, when the platform stated it.
  final DateTime? effectiveAt;

  @override
  bool operator ==(Object other) =>
      other is LegalDocumentVersion &&
      other.versionId == versionId &&
      other.version == version &&
      other.action == action &&
      other.effectiveAt == effectiveAt;

  @override
  int get hashCode => Object.hash(versionId, version, action, effectiveAt);

  @override
  String toString() => 'LegalDocumentVersion($versionId)';
}

/// One legal document applicable to the caller.
@immutable
final class LegalDocument {
  const LegalDocument({
    required this.documentId,
    required this.kind,
    required this.entityId,
    required this.jurisdictionRef,
    required this.purposeRefs,
    this.effectiveVersion,
  });

  final String documentId;

  /// The platform's own document kind. Rendered through a lookup that names
  /// the document; an unrecognised kind is shown as the platform stated it
  /// rather than relabelled.
  final String kind;

  /// The publishing operating entity.
  final String entityId;

  /// The regime the document belongs to, as data. Never branched on.
  final String jurisdictionRef;

  /// The processing purposes the document covers.
  final List<String> purposeRefs;

  /// Null when nothing is published. A document with no effective version has
  /// nothing to present and nothing to accept.
  final LegalDocumentVersion? effectiveVersion;

  bool get hasEffectiveVersion => effectiveVersion != null;

  bool covers(String purposeRef) => purposeRefs.contains(purposeRef);

  @override
  String toString() => 'LegalDocument($documentId)';
}

/// A consent grant, as evidence the platform holds.
///
/// The grant IDENTIFIER and its version are safe to render: a person needs
/// them to talk to support about a decision they made. The evidence itself —
/// what was captured at the moment of acceptance — belongs to the platform and
/// never reaches this client, is never stored by it, and is never logged by
/// it.
@immutable
final class ConsentGrant {
  const ConsentGrant({
    required this.grantId,
    required this.purposeRef,
    this.acceptedVersion,
    this.grantedAt,
    this.operatingEntityId,
    this.jurisdictionRef,
  });

  final String grantId;
  final String purposeRef;

  /// The exact version the subject accepted.
  final String? acceptedVersion;

  final DateTime? grantedAt;
  final String? operatingEntityId;
  final String? jurisdictionRef;

  @override
  String toString() => 'ConsentGrant($grantId)';
}

/// The record of a withdrawal.
///
/// The grant row is preserved; withdrawal marks it rather than erasing it, and
/// a later acceptance creates a new versioned grant. The client states that,
/// because a person withdrawing consent is entitled to know the record of
/// their earlier decision still exists.
@immutable
final class ConsentWithdrawal {
  const ConsentWithdrawal({required this.grantId, required this.withdrawnAt});

  final String grantId;
  final DateTime withdrawnAt;

  @override
  String toString() => 'ConsentWithdrawal($grantId)';
}
