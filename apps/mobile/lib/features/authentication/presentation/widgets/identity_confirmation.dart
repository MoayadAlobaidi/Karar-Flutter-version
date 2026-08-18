// PRESENTATION — confirmation for the destructive identity actions.
//
// Revoking a session, revoking every other session, signing out and turning
// two-step verification off all end something the user cannot undo from the
// screen they are on. Each is confirmed, and each confirmation names what will
// happen rather than asking "are you sure?".
import 'package:flutter/material.dart';

import '../../../../shared/shared.dart';

/// Asks the user to confirm a destructive action.
///
/// Returns false when the dialog is dismissed by the scrim or the back
/// gesture, so a dismissal never reads as consent.
Future<bool> confirmIdentityAction({
  required BuildContext context,
  required String title,
  required String message,
  required String confirmLabel,
  required String cancelLabel,
  bool isDestructive = true,
}) async {
  final bool? confirmed = await showKararDialog<bool>(
    context: context,
    builder: (BuildContext dialogContext) => KararDialog(
      title: title,
      message: message,
      confirmLabel: confirmLabel,
      onConfirm: () => Navigator.of(dialogContext).pop(true),
      cancelLabel: cancelLabel,
      onCancel: () => Navigator.of(dialogContext).pop(false),
      isDestructive: isDestructive,
    ),
  );
  return confirmed ?? false;
}
