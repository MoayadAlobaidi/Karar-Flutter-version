// Wire mappings for the kernel's exact numeric types (ADR-0006).
//
// Every bigint-backed quantity travels as a **string**: JSON numbers are IEEE
// doubles, silently lossy past 2^53, and JSON.stringify throws on bigint.
// Serializers here are total; parsers validate untrusted input and return
// `Result` — the transport boundary is where kernel construction rules become
// expected conditions instead of programmer errors.
export { moneyToWire, moneyFromWire, type MoneyWire } from './money.js';
export { percentageToWire, percentageFromWire, type PercentageWire } from './percentage.js';
export {
  exchangeRateToWire,
  exchangeRateFromWire,
  type ExchangeRateWire,
} from './exchange-rate.js';
