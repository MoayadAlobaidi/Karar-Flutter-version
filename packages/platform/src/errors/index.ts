// Platform error model: infrastructure codes, the safe/internal split on
// PlatformError, and the pure RFC 7807 mapper. Transport (the NestJS
// exception filter) lives in apps/api and consumes this.
export { ErrorCode } from './error-code.js';
export { PlatformError, type ErrorOrigin, type SafeDetailValue } from './platform-error.js';
export { toProblemDetails, type ProblemDetails } from './problem-details.js';
