// HOW MONEY AND CALENDAR DAYS REACH THE SCREEN.
//
// MONEY. The amount arrives as an exact integer count of minor units in a
// STRING, with the currency and that currency's exponent beside it. Two rules
// hold all the way through:
//
//   * no `double`, ever. The minor units are handed to `KararFormatter.scaled`
//     as an `int`, which does the grouping, the decimal separator and the
//     digit shapes with integer arithmetic. A binary float never touches a
//     ledger value;
//   * the EXPONENT COMES FROM THE RESPONSE, not from a currency table in the
//     client. `KararFormatter.money` keeps its own table, which is right for
//     a caller that has only a code — but this surface always has the
//     platform's own exponent, and a table that disagreed with it would
//     misplace the decimal point by a factor of ten.
//
// The currency is rendered as its ISO 4217 alphabetic code. Several Gulf
// currencies share a short symbol, and a fintech that renders two different
// currencies identically has shipped a defect.
//
// CALENDAR DAYS. A booking date is a day an institution wrote down. It is
// rendered from its three integers, never by constructing a `DateTime` — see
// `domain/calendar_day.dart`. Only the digit shapes are localised, so the day
// a screen shows is the day the contract sent, whatever the device's zone.
//
// SOURCE-SUPPLIED TEXT keeps its own digits. A description or a merchant name
// that arrived with Arabic-Indic numerals is rendered as it arrived and is
// only bidi-isolated; rewriting digits inside data the platform stored would
// be editing the record for display.
import 'package:flutter/widgets.dart';

import '../../../shared/shared.dart';
import '../domain/calendar_day.dart';
import '../domain/money.dart';

/// Formats an exact amount with its currency code.
///
/// The code leads in English and follows in Arabic, matching CLDR placement
/// and `KararFormatter.money`.
String formatMoney(BuildContext context, Money money) {
  final formatter = context.formatter;
  final amount = formatMoneyAmount(context, money);
  final code = formatter.currencyDisplayFor(money.currency);
  return formatter.isRightToLeft ? '$amount $code' : '$code $amount';
}

/// The amount alone, without the currency code.
String formatMoneyAmount(BuildContext context, Money money) {
  final minorUnits = money.minorUnitsAsInt;
  if (minorUnits != null) {
    return context.formatter.scaled(minorUnits, money.exponent);
  }
  // Beyond a 64-bit integer. The contract allows thirty digits and this is the
  // only branch that can reach them; the exact characters are rendered with a
  // decimal point inserted rather than approximated, because an approximate
  // ledger value is worse than an unusual-looking exact one.
  return context.formatter.applyNumerals(_exactWithPoint(money));
}

String _exactWithPoint(Money money) {
  final digits = money.magnitudeMinorUnits;
  final sign = money.isNegative ? '-' : '';
  if (money.exponent <= 0) {
    return '$sign$digits';
  }
  final padded = digits.padLeft(money.exponent + 1, '0');
  final split = padded.length - money.exponent;
  return '$sign${padded.substring(0, split)}.${padded.substring(split)}';
}

/// Renders a calendar day.
///
/// `YYYY-MM-DD` with the locale's digits, and nothing else. It is deliberately
/// not passed through a date formatter: every date formatter in the framework
/// takes a `DateTime`, and building one would attach a local midnight to a day
/// that has no time at all.
String formatCalendarDay(BuildContext context, CalendarDay day) =>
    context.formatter.applyNumerals(day.iso8601);

/// Renders a true instant, which is what `asOf`, `capturedAt` and
/// `lastSuccessfulImportAt` are.
String formatInstant(BuildContext context, DateTime instant) =>
    context.formatter.dateTime(instant.toLocal());

/// Renders the day part of a true instant, for a row where the time adds
/// nothing.
String formatInstantDate(BuildContext context, DateTime instant) =>
    context.formatter.date(instant.toLocal());
