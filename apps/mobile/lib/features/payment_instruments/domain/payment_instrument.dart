// PURE DART ONLY. See lib/README.md — domain purity.
//
// AN INSTRUMENT HAS NO BALANCE.
//
// A card, a tokenised card, a QR payment identity: these are things that SPEND
// from an account. The money is in the account. Two virtual cards on one
// wallet are two instruments and ONE balance, and this type is the reason the
// screen cannot say otherwise — there is no amount field on it, and `version`
// is the only number it carries.
//
// The question "how much is on this card" has no answer in this platform. It
// must not acquire one here, and it cannot: nothing in this file can hold a
// `Money`, and nothing in this feature reads a balance route.
//
// DELIBERATELY ABSENT, and to stay absent: any PAN, any CVV, any expiry, any
// tokenised reference, any provider identifier, any fingerprint, any
// ciphertext or key version. The platform sends none of them and this client
// reconstructs none of them — including as a placeholder that would imply the
// digits exist somewhere the person could reach.
import 'package:meta/meta.dart';

import '../../financial_accounts/domain/safe_mask.dart';

/// What kind of instrument it is.
///
/// TOKENIZED_CARD is a TYPE, not a live provisioning state, and no member of
/// this vocabulary means the issuer is reachable.
enum InstrumentType {
  physicalCard,
  virtualCard,
  prepaidCard,
  tokenizedCard,
  qrPaymentIdentity,
  other,
  unrecognised,
}

/// The instrument's own lifecycle.
enum InstrumentStatus { active, suspended, expired, cancelled, unrecognised }

/// One instrument that spends from one account.
@immutable
final class PaymentInstrument {
  const PaymentInstrument({
    required this.instrumentId,
    required this.accountId,
    required this.instrumentType,
    required this.status,
    required this.spendable,
    required this.mask,
    required this.displayLabel,
    required this.impliesLiveIssuerLink,
    required this.version,
    required this.createdAt,
    required this.updatedAt,
  });

  final String instrumentId;

  /// The single balance-bearing account this instrument spends from. Singular
  /// by contract; there is no field through which it could be re-pointed, and
  /// no way for this client to attach a second account to one instrument.
  final String accountId;

  final InstrumentType instrumentType;
  final InstrumentStatus status;

  /// Whether it may currently be used to spend, as the platform STATED it —
  /// never derived from the status vocabulary, because a client that derived
  /// it would disagree with the server the first time a status was added.
  final bool spendable;

  final SafeMask mask;

  /// The subject's own name for the instrument.
  final String displayLabel;

  /// False for every status the vocabulary permits. Carried so the claim is
  /// checkable rather than merely stated.
  final bool impliesLiveIssuerLink;

  final int version;
  final DateTime createdAt;
  final DateTime updatedAt;

  @override
  String toString() => 'PaymentInstrument($instrumentId)';
}
