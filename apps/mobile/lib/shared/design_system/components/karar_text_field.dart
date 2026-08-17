import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';

import '../../extensions/build_context_extensions.dart';
import '../../formatting/arabic_digit_input_formatter.dart';
import '../foundations/karar_icons.dart';

/// The product's text input.
///
/// The field is controlled: validation state arrives as [errorText] from the
/// screen's state, it is not computed inside the widget. That keeps the one
/// copy of a validation rule in the place that can also send it to the server.
class KararTextField extends StatefulWidget {
  const KararTextField({
    required this.label,
    this.controller,
    this.hint,
    this.helperText,
    this.errorText,
    this.isRequired = false,
    this.isEnabled = true,
    this.obscureText = false,
    this.keyboardType,
    this.textInputAction,
    this.autofillHints,
    this.maxLength,
    this.maxLines = 1,
    this.prefixIcon,
    this.onChanged,
    this.onSubmitted,
    this.focusNode,
    this.normalizeArabicDigits = false,
    this.showClearAction = false,
    super.key,
  });

  final String label;
  final TextEditingController? controller;
  final String? hint;
  final String? helperText;

  /// Non-null puts the field into its error state and announces the message.
  final String? errorText;

  final bool isRequired;
  final bool isEnabled;
  final bool obscureText;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final List<String>? autofillHints;
  final int? maxLength;
  final int maxLines;
  final IconData? prefixIcon;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final FocusNode? focusNode;

  /// Rewrites Arabic-Indic digits to ASCII as the user types. Set on every
  /// numeric field.
  final bool normalizeArabicDigits;

  final bool showClearAction;

  @override
  State<KararTextField> createState() => _KararTextFieldState();
}

class _KararTextFieldState extends State<KararTextField> {
  late final TextEditingController _controller =
      widget.controller ?? TextEditingController();
  late final FocusNode _focusNode = widget.focusNode ?? FocusNode();
  bool _ownsController = false;
  bool _ownsFocusNode = false;
  bool _isFocused = false;
  bool _isObscured = false;

  @override
  void initState() {
    super.initState();
    _ownsController = widget.controller == null;
    _ownsFocusNode = widget.focusNode == null;
    _isObscured = widget.obscureText;
    _focusNode.addListener(_handleFocusChange);
  }

  @override
  void didUpdateWidget(covariant KararTextField oldWidget) {
    super.didUpdateWidget(oldWidget);
    final String? error = widget.errorText;
    if (error != null &&
        error != oldWidget.errorText &&
        MediaQuery.supportsAnnounceOf(context)) {
      // A field that turns red without saying anything is silent to a screen
      // reader. The message below is the belt; the live region on the error
      // text is the braces, and is what carries on platforms where explicit
      // announcements are not honoured.
      unawaited(
        SemanticsService.sendAnnouncement(
          View.of(context),
          context.l10n.fieldErrorAnnouncement(widget.label, error),
          context.direction,
          assertiveness: Assertiveness.assertive,
        ),
      );
    }
  }

  @override
  void dispose() {
    _focusNode.removeListener(_handleFocusChange);
    if (_ownsFocusNode) {
      _focusNode.dispose();
    }
    if (_ownsController) {
      _controller.dispose();
    }
    super.dispose();
  }

  void _handleFocusChange() {
    if (mounted && _focusNode.hasFocus != _isFocused) {
      setState(() => _isFocused = _focusNode.hasFocus);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bool hasError = widget.errorText != null;
    final Color borderColor = !widget.isEnabled
        ? context.colors.borderSubtle
        : hasError
        ? context.colors.danger.content
        : _isFocused
        ? context.colors.borderFocus
        : context.colors.borderStrong;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        _Label(
          label: widget.label,
          isRequired: widget.isRequired,
          isEnabled: widget.isEnabled,
        ),
        SizedBox(height: context.spacing.xs),
        DecoratedBox(
          decoration: BoxDecoration(
            color: widget.isEnabled
                ? context.colors.surface
                : context.colors.disabledSurface,
            borderRadius: context.radii.all(context.radii.md),
            border: Border.all(
              color: borderColor,
              width: _isFocused || hasError
                  ? context.sizing.borderWidthStrong
                  : context.sizing.borderWidth,
            ),
          ),
          child: Padding(
            padding: EdgeInsetsDirectional.symmetric(
              horizontal: context.spacing.md,
              vertical: context.spacing.xs,
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: <Widget>[
                if (widget.prefixIcon != null)
                  Padding(
                    padding: EdgeInsetsDirectional.only(
                      end: context.spacing.sm,
                    ),
                    child: Icon(
                      widget.prefixIcon,
                      size: context.sizing.iconSmall,
                      color: context.colors.contentTertiary,
                    ),
                  ),
                Expanded(child: _buildInput(context)),
                ..._buildTrailingActions(context),
              ],
            ),
          ),
        ),
        _Assistive(
          errorText: widget.errorText,
          helperText: widget.helperText,
          // The count is a quantity, so its digits follow the formatter rather
          // than whichever locale the generated bundle was loaded for.
          counter: widget.maxLength == null
              ? null
              : context.formatter.applyNumerals(
                  context.l10n.fieldCharacterCount(
                    _controller.text.characters.length,
                    widget.maxLength!,
                  ),
                ),
        ),
      ],
    );
  }

  Widget _buildInput(BuildContext context) {
    return TextField(
      controller: _controller,
      focusNode: _focusNode,
      enabled: widget.isEnabled,
      obscureText: _isObscured,
      keyboardType: widget.keyboardType,
      textInputAction: widget.textInputAction,
      autofillHints: widget.autofillHints,
      maxLines: widget.obscureText ? 1 : widget.maxLines,
      maxLength: widget.maxLength,
      // The count is rendered in the assistive row so it inherits the design
      // system's type and colour instead of Material's.
      buildCounter: _noCounter,
      inputFormatters: <TextInputFormatter>[
        if (widget.normalizeArabicDigits) const ArabicDigitInputFormatter(),
        if (widget.maxLength != null)
          LengthLimitingTextInputFormatter(widget.maxLength),
      ],
      onChanged: (String value) {
        widget.onChanged?.call(value);
        if (widget.maxLength != null || widget.showClearAction) {
          setState(() {});
        }
      },
      onSubmitted: widget.onSubmitted,
      // start, not left: the caret and the text follow reading direction.
      textAlign: TextAlign.start,
      style: context.typography.bodyLarge.copyWith(
        color: widget.isEnabled
            ? context.colors.contentPrimary
            : context.colors.contentDisabled,
      ),
      cursorColor: context.colors.brand,
      decoration: InputDecoration(
        isDense: true,
        border: InputBorder.none,
        enabledBorder: InputBorder.none,
        focusedBorder: InputBorder.none,
        disabledBorder: InputBorder.none,
        errorBorder: InputBorder.none,
        contentPadding: EdgeInsetsDirectional.symmetric(
          vertical: context.spacing.sm,
        ),
        hintText: widget.hint,
        hintStyle: context.typography.bodyLarge.copyWith(
          color: context.colors.contentTertiary,
        ),
        counterText: '',
      ),
    );
  }

  List<Widget> _buildTrailingActions(BuildContext context) {
    final List<Widget> actions = <Widget>[];
    if (widget.showClearAction && _controller.text.isNotEmpty) {
      actions.add(
        _FieldAction(
          icon: KararIcons.clear,
          semanticLabel: context.l10n.fieldClear(widget.label),
          onPressed: () {
            _controller.clear();
            widget.onChanged?.call('');
            setState(() {});
          },
        ),
      );
    }
    if (widget.obscureText) {
      actions.add(
        _FieldAction(
          icon: _isObscured ? KararIcons.visible : KararIcons.hidden,
          semanticLabel: _isObscured
              ? context.l10n.fieldShowValue(widget.label)
              : context.l10n.fieldHideValue(widget.label),
          onPressed: () => setState(() => _isObscured = !_isObscured),
        ),
      );
    }
    return actions;
  }

  static Widget? _noCounter(
    BuildContext context, {
    required int currentLength,
    required bool isFocused,
    required int? maxLength,
  }) => null;
}

class _Label extends StatelessWidget {
  const _Label({
    required this.label,
    required this.isRequired,
    required this.isEnabled,
  });

  final String label;
  final bool isRequired;
  final bool isEnabled;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      // "Required" is spoken, never signalled by a red asterisk alone.
      label: isRequired ? context.l10n.a11yFieldWithRequired(label) : label,
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Flexible(
            child: Text(
              label,
              textAlign: TextAlign.start,
              style: context.typography.labelMedium.copyWith(
                color: isEnabled
                    ? context.colors.contentSecondary
                    : context.colors.contentDisabled,
              ),
            ),
          ),
          if (isRequired)
            Padding(
              padding: EdgeInsetsDirectional.only(start: context.spacing.xxs),
              child: Text(
                context.l10n.fieldRequiredIndicator,
                style: context.typography.labelMedium.copyWith(
                  color: context.colors.danger.content,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Assistive extends StatelessWidget {
  const _Assistive({
    required this.errorText,
    required this.helperText,
    required this.counter,
  });

  final String? errorText;
  final String? helperText;
  final String? counter;

  @override
  Widget build(BuildContext context) {
    final String? message = errorText ?? helperText;
    if (message == null && counter == null) {
      return const SizedBox.shrink();
    }
    final bool hasError = errorText != null;
    return Padding(
      padding: EdgeInsetsDirectional.only(top: context.spacing.xs),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          if (message != null)
            Expanded(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  if (hasError)
                    Padding(
                      padding: EdgeInsetsDirectional.only(
                        end: context.spacing.xs,
                        top: context.spacing.xxs,
                      ),
                      child: Icon(
                        KararIcons.statusDanger,
                        size: context.sizing.iconXSmall,
                        color: context.colors.danger.content,
                      ),
                    ),
                  Expanded(
                    child: Semantics(
                      liveRegion: hasError,
                      child: Text(
                        message,
                        textAlign: TextAlign.start,
                        style: context.typography.bodySmall.copyWith(
                          color: hasError
                              ? context.colors.danger.content
                              : context.colors.contentTertiary,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            )
          else
            const Spacer(),
          if (counter != null)
            Padding(
              padding: EdgeInsetsDirectional.only(start: context.spacing.sm),
              child: Text(
                counter!,
                style: context.typography.bodySmall.copyWith(
                  color: context.colors.contentTertiary,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _FieldAction extends StatelessWidget {
  const _FieldAction({
    required this.icon,
    required this.semanticLabel,
    required this.onPressed,
  });

  final IconData icon;
  final String semanticLabel;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: semanticLabel,
      onTap: onPressed,
      excludeSemantics: true,
      child: InkResponse(
        onTap: onPressed,
        radius: context.sizing.minTouchTarget / 2,
        child: SizedBox(
          width: context.sizing.minTouchTarget,
          height: context.sizing.minTouchTarget,
          child: Icon(
            icon,
            size: context.sizing.iconSmall,
            color: context.colors.contentTertiary,
          ),
        ),
      ),
    );
  }
}
