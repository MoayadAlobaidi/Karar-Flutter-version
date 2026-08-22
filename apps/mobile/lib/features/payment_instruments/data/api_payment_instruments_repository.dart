// The payment-instrument repository, over the GENERATED client.
//
// The mapper below reads every field the contract sends and drops none of
// them — because there is no amount among them. If a future contract ever put
// a figure on an instrument, regeneration would add it to the DTO and this
// mapper would have to grow a field for it, which is a change somebody has to
// make on purpose.
import '../../../core/errors/result.dart';
import '../../../core/networking/generated/karar_api_client.dart';
import '../../../core/networking/generated/models.dart';
import '../../financial_accounts/data/contract_mapping.dart';
import '../../financial_accounts/domain/page.dart';
import '../../financial_accounts/domain/safe_mask.dart';
import '../domain/payment_instrument.dart';
import '../domain/payment_instruments_repository.dart';

/// [PaymentInstrumentsRepository] over the generated client.
final class ApiPaymentInstrumentsRepository implements PaymentInstrumentsRepository {
  const ApiPaymentInstrumentsRepository(this._client);

  final KararApiClient _client;

  @override
  Future<Result<Page<PaymentInstrument>>> listForAccount(
    String accountId, {
    int? limit,
    String? cursor,
  }) =>
      guarded<Page<PaymentInstrument>>(
        'financial.accounts.paymentInstruments',
        () async {
          final response = await _client.listOwnAccountPaymentInstruments(
            accountId: accountId,
            limit: limit,
            cursor: cursor,
          );
          return pageFrom<PaymentInstrument, PaymentInstrumentViewDto>(
            response.items,
            response.page,
            instrumentFromDto,
          );
        },
      );
}

// ---------------------------------------------------------------------------
// Vocabularies. Exhaustive switches; a member added to the contract breaks the
// build rather than falling into a fallback.
// ---------------------------------------------------------------------------

InstrumentType instrumentTypeFromDto(InstrumentTypeDto dto) => switch (dto) {
      InstrumentTypeDto.physicalCard => InstrumentType.physicalCard,
      InstrumentTypeDto.virtualCard => InstrumentType.virtualCard,
      InstrumentTypeDto.prepaidCard => InstrumentType.prepaidCard,
      InstrumentTypeDto.tokenizedCard => InstrumentType.tokenizedCard,
      InstrumentTypeDto.qrPaymentIdentity => InstrumentType.qrPaymentIdentity,
      InstrumentTypeDto.other => InstrumentType.other,
      InstrumentTypeDto.unknown => InstrumentType.unrecognised,
    };

InstrumentStatus instrumentStatusFromDto(InstrumentStatusDto dto) => switch (dto) {
      InstrumentStatusDto.active => InstrumentStatus.active,
      InstrumentStatusDto.suspended => InstrumentStatus.suspended,
      InstrumentStatusDto.expired => InstrumentStatus.expired,
      InstrumentStatusDto.cancelled => InstrumentStatus.cancelled,
      InstrumentStatusDto.unknown => InstrumentStatus.unrecognised,
    };

/// One instrument.
PaymentInstrument instrumentFromDto(PaymentInstrumentViewDto dto) => PaymentInstrument(
      instrumentId: dto.instrumentId,
      accountId: dto.accountId,
      instrumentType: instrumentTypeFromDto(dto.instrumentType),
      status: instrumentStatusFromDto(dto.status),
      spendable: dto.spendable,
      mask: SafeMask.from(dto.mask),
      displayLabel: dto.displayLabel,
      impliesLiveIssuerLink: dto.issuerLink.impliesLiveIssuerLink,
      version: dto.version,
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
    );
