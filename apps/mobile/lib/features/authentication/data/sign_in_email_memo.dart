// DATA LAYER.
//
// The address the user last typed into a sign-in or registration form, kept in
// memory for the length of one process.
//
// WHY IT EXISTS: `/auth/verify-email` takes an address AND a code, so a
// verification screen that did not remember the address would have to ask a
// signed-in user what their own e-mail address is. The bootstrap context does
// not carry it, so there is nothing else to read it from.
//
// WHY IT IS SAFE: an address is personal data, not a credential. It is held in
// memory only — never secure storage, never preferences, never a file, never
// a log — it does not survive a relaunch, and it is dropped when the session
// ends. It is a convenience, so every screen that reads it still shows an
// editable field and works when the memo is empty.
import '../domain/value_objects/email_address.dart';

/// Remembers the last address entered, for prefilling.
final class SignInEmailMemo {
  SignInEmailMemo();

  EmailAddress? _address;

  EmailAddress? get address => _address;

  void remember(EmailAddress address) => _address = address;

  void forget() => _address = null;

  /// Never prints the address.
  @override
  String toString() => 'SignInEmailMemo(remembered: ${_address != null})';
}
