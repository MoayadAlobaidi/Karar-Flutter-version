// PURE DART ONLY. See lib/README.md — domain purity.
//
// A CALENDAR DAY IS NOT A MOMENT.
//
// The day an institution booked a movement on its books is a date the
// institution wrote down. It has no time and no offset (ADR-0027). Typing it
// as a `DateTime` gives it both: `DateTime(2026, 3, 1)` is local midnight, and
// local midnight in Doha is the last day of February for a reader in Los
// Angeles. A statement line would move across a month boundary depending on
// where the phone happened to be.
//
// So a calendar day is three integers here and stays three integers all the
// way to the widget that renders it. There is deliberately no `toDateTime()`,
// no `DateTime` constructor and no conversion of any kind.
import 'package:meta/meta.dart';

/// One day on a calendar, with no time and no zone.
@immutable
final class CalendarDay implements Comparable<CalendarDay> {
  const CalendarDay({required this.year, required this.month, required this.day});

  /// Parses the contract's `format: date` — `YYYY-MM-DD` — and nothing else.
  ///
  /// Returns null rather than guessing at a value the platform did not send;
  /// the data layer turns a null into a typed contract violation, so a
  /// malformed day is a stated failure instead of a plausible wrong date.
  static CalendarDay? tryParse(String value) {
    if (value.length < 10) {
      return null;
    }
    // A `date-time` starts with a valid date; the contract never sends one
    // where a day belongs, so anything past the tenth character is refused
    // rather than silently truncated to its day part.
    if (value.length != 10 || value[4] != '-' || value[7] != '-') {
      return null;
    }
    final year = int.tryParse(value.substring(0, 4));
    final month = int.tryParse(value.substring(5, 7));
    final day = int.tryParse(value.substring(8, 10));
    if (year == null || month == null || day == null) {
      return null;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }
    return CalendarDay(year: year, month: month, day: day);
  }

  final int year;
  final int month;
  final int day;

  /// The contract representation, byte-identical to what arrived.
  String get iso8601 =>
      '${_pad(year, 4)}-${_pad(month, 2)}-${_pad(day, 2)}';

  @override
  int compareTo(CalendarDay other) {
    if (year != other.year) {
      return year.compareTo(other.year);
    }
    if (month != other.month) {
      return month.compareTo(other.month);
    }
    return day.compareTo(other.day);
  }

  @override
  bool operator ==(Object other) =>
      other is CalendarDay &&
      other.year == year &&
      other.month == month &&
      other.day == day;

  @override
  int get hashCode => Object.hash(year, month, day);

  @override
  String toString() => 'CalendarDay()';

  static String _pad(int value, int width) {
    final digits = value.toString();
    if (digits.length >= width) {
      return digits;
    }
    final buffer = StringBuffer();
    for (var index = digits.length; index < width; index++) {
      buffer.write('0');
    }
    buffer.write(digits);
    return buffer.toString();
  }
}

/// A closed range of calendar days, as a source reported its coverage.
@immutable
final class CalendarDayRange {
  const CalendarDayRange({required this.start, required this.end});

  final CalendarDay start;
  final CalendarDay end;

  @override
  bool operator ==(Object other) =>
      other is CalendarDayRange && other.start == start && other.end == end;

  @override
  int get hashCode => Object.hash(start, end);

  @override
  String toString() => 'CalendarDayRange()';
}
