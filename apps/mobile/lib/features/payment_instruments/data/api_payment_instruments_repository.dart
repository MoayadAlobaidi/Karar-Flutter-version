// The payment-instrument repository.
//
// The decoder below reads every field the contract sends and drops none of
// them — because there is no amount among them. If a future contract ever put
// a figure on an instrument, this decoder would have to grow a field for it,
// and that is a change somebody has to make on purpose.
import '../../../core/errors/result.dart';
import '../../../core/networking/api_transport.dart';
import '../../financial_accounts/data/financial_gateway.dart';
import '../../financial_accounts/data/financial_wire.dart';
import '../../financial_accounts/domain/page.dart';
import '../../financial_accounts/domain/safe_mask.dart';
import '../domain/payment_instrument.dart';
import '../domain/payment_instruments_repository.dart';

const Map<String, InstrumentType> instrumentTypeByWire = <String, InstrumentType>{
  'PHYSICAL_CARD': InstrumentType.physicalCard,
  'VIRTUAL_CARD': InstrumentType.virtualCard,
  'PREPAID_CARD': InstrumentType.prepaidCard,
  'TOKENIZED_CARD': InstrumentType.tokenizedCard,
  'QR_PAYMENT_IDENTITY': InstrumentType.qrPaymentIdentity,
  'OTHER': InstrumentType.other,
};

const Map<String, InstrumentStatus> instrumentStatusByWire = <String, InstrumentStatus>{
  'ACTIVE': InstrumentStatus.active,
  'SUSPENDED': InstrumentStatus.suspended,
  'EXPIRED': InstrumentStatus.expired,
  'CANCELLED': InstrumentStatus.cancelled,
};

/// [PaymentInstrumentsRepository] over the shared transport.
final class ApiPaymentInstrumentsRepository implements PaymentInstrumentsRepository {
  const ApiPaymentInstrumentsRepository(this._gateway);

  final FinancialGateway _gateway;

  @override
  Future<Result<Page<PaymentInstrument>>> listForAccount(
    String accountId, {
    int? limit,
    String? cursor,
  }) =>
      guarded<Page<PaymentInstrument>>(
        'financial.accounts.paymentInstruments',
        () async => decodePage<PaymentInstrument>(
          await _gateway.get(
            FinancialPaths.accountPaymentInstruments(accountId),
            query: <String, Object?>{'limit': limit, 'cursor': cursor},
            location: 'financial.accounts.paymentInstruments',
          ),
          'financial.accounts.paymentInstruments',
          decodeInstrument,
        ),
      );
}

/// One instrument.
PaymentInstrument decodeInstrument(JsonMap json) {
  const at = 'PaymentInstrumentView';
  final issuerLink = json.object('issuerLink', at);
  return PaymentInstrument(
    instrumentId: json.string('instrumentId', at),
    accountId: json.string('accountId', at),
    instrumentType: decodeEnum<InstrumentType>(
      json.stringOrNull('instrumentType', at),
      instrumentTypeByWire,
      InstrumentType.unrecognised,
    ),
    status: decodeEnum<InstrumentStatus>(
      json.stringOrNull('status', at),
      instrumentStatusByWire,
      InstrumentStatus.unrecognised,
    ),
    spendable: json.boolean('spendable', at),
    mask: SafeMask.from(json.string('mask', at)),
    displayLabel: json.string('displayLabel', at),
    impliesLiveIssuerLink: issuerLink.boolean('impliesLiveIssuerLink', '$at.issuerLink'),
    version: json.integer('version', at),
    createdAt: json.instant('createdAt', at),
    updatedAt: json.instant('updatedAt', at),
  );
}
