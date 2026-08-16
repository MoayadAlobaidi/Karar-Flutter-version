// @karar/platform notifications — the notification port and the local-only
// capture sink. Real providers arrive with a deployment-profile phase.
export {
  SECURITY_NOTICE_KINDS,
  type NotificationError,
  type NotificationPort,
  type NotificationResult,
  type PasswordResetMessage,
  type SecurityNotice,
  type SecurityNoticeKind,
  type VerificationMessage,
} from './port.js';
export {
  LocalMailSink,
  LocalMailSinkEnvironmentError,
  type LocalMailSinkOptions,
  type RecordedNotification,
} from './local-mail-sink.js';
