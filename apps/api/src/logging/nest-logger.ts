import type { LoggerService } from '@nestjs/common';
import type { PlatformLogger } from '@karar/platform/dist/observability/index.js';

/**
 * Bridges Nest's LoggerService onto the platform's structured pino logger so
 * framework lines (bootstrap, route mapping, shutdown) share the JSON shape,
 * redaction and trace correlation of application logs.
 */
export class PlatformNestLogger implements LoggerService {
  constructor(private readonly logger: PlatformLogger) {}

  private fields(optionalParams: unknown[]): Record<string, unknown> {
    const fields: Record<string, unknown> = {};
    // Nest appends the source context (and for errors, a stack string) last.
    const rest: unknown[] = [];
    for (const param of optionalParams) {
      if (
        typeof param === 'string' &&
        /^[A-Za-z][A-Za-z0-9_-]*$/.test(param) &&
        fields['context'] === undefined
      ) {
        fields['context'] = param;
      } else if (typeof param === 'string' && param.includes('\n    at ')) {
        fields['stack'] = param;
      } else if (param !== undefined) {
        rest.push(param);
      }
    }
    if (rest.length > 0) fields['params'] = rest;
    return fields;
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.info(this.fields(optionalParams), String(message));
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.error(this.fields(optionalParams), String(message));
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.warn(this.fields(optionalParams), String(message));
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.debug(this.fields(optionalParams), String(message));
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.trace(this.fields(optionalParams), String(message));
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.fatal(this.fields(optionalParams), String(message));
  }
}
