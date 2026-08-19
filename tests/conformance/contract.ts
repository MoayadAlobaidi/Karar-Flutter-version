/**
 * The OpenAPI document, loaded and made addressable: root plus fragments,
 * `$ref`s resolved across files, operations indexed by operationId.
 *
 * WHY THIS EXISTS. `dart run tool/generate_api_client.dart --check` proves the
 * generated Dart client still matches `openapi.yaml`. Nothing proved the
 * SERVER still matches it. Both ends must be bound to the same document, and
 * this module is the half that lets a test hold a real response next to the
 * schema that describes it.
 *
 * `$ref`s are followed LAZILY rather than inlined up front. Two reasons: a
 * cycle in the contract would hang an eager inliner but merely produce a
 * deeper walk here, and a violation reported mid-walk still names the pointer
 * it came through, which is what a reader needs in order to fix it.
 *
 * ON THE YAML DEPENDENCY (dev-only, see package.json): `yaml@2.9.0` is the
 * exact version already resolved in pnpm-lock.yaml (vite's dependency), and
 * the specifier here is pinned EXACT so pnpm reuses that resolution — the
 * lockfile's `packages:` and `snapshots:` sections gain nothing, no new
 * integrity hash enters the tree, and nothing new is downloaded. The
 * alternative was hand-rolling a YAML parser for a document that uses block
 * scalars, multi-line flow sequences, and quoted keys; a conformance suite
 * that MISREADS the contract is worse than no conformance suite, because it
 * reports agreement it never checked.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse as parseYaml } from 'yaml';

import type { RefResolver, SchemaNode } from './schema-validator.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolvePath(HERE, '..', '..');

export const OPENAPI_ROOT_PATH = resolvePath(
  REPO_ROOT,
  'packages',
  'api-contracts',
  'openapi',
  'openapi.yaml',
);

/** The HTTP methods a path item may carry. Anything else in a path item throws. */
const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/** Path-item keys that are not operations. */
const PATH_ITEM_NON_OPERATION_KEYS: ReadonlySet<string> = new Set([
  'summary',
  'description',
  'servers',
  'parameters',
  '$ref',
]);

export interface DeclaredResponse {
  /** The status code as written in the contract, e.g. `'200'`. */
  readonly status: string;
  /** Media type -> the schema declared for it. Empty when the contract declares no body. */
  readonly schemas: ReadonlyMap<string, SchemaNode>;
}

export interface ContractOperation {
  readonly operationId: string;
  readonly method: HttpMethod;
  /** The templated path as the contract writes it, e.g. `/users/me`. */
  readonly path: string;
  readonly responses: ReadonlyMap<string, DeclaredResponse>;
  /**
   * The media types the operation's request body declares, in document order.
   * Empty when the operation declares no body — which is itself a fact worth
   * asserting: a route that grew a body the contract does not describe is the
   * request-side twin of a response that grew a field.
   */
  readonly requestMediaTypes: readonly string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** JSON Pointer token decoding (RFC 6901): `~1` is `/`, `~0` is `~`. */
function decodePointerToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

export class ContractError extends Error {
  override readonly name = 'ContractError';
}

export class Contract {
  private readonly documents = new Map<string, unknown>();
  private readonly operationsById = new Map<string, ContractOperation>();

  private constructor(private readonly rootPath: string) {}

  static load(rootPath: string = OPENAPI_ROOT_PATH): Contract {
    const contract = new Contract(rootPath);
    contract.index();
    return contract;
  }

  /** The resolver the validator follows `$ref` through. */
  readonly resolve: RefResolver = (ref, from) => this.resolveRef(ref, from);

  operations(): readonly ContractOperation[] {
    return [...this.operationsById.values()];
  }

  operation(operationId: string): ContractOperation {
    const found = this.operationsById.get(operationId);
    if (found === undefined) {
      throw new ContractError(
        `No operation '${operationId}' in ${this.rootPath}. Known: ${[...this.operationsById.keys()].sort().join(', ')}`,
      );
    }
    return found;
  }

  /**
   * The schema the contract declares for one (operation, status, media type),
   * or null when it declares none. Null is a real answer here — several
   * operations describe a failure in prose and attach no body schema — and
   * the coverage ledger reports those separately rather than counting them.
   */
  responseSchema(
    operationId: string,
    status: number | string,
    mediaType: string,
  ): SchemaNode | null {
    const operation = this.operation(operationId);
    const declared = operation.responses.get(String(status));
    if (declared === undefined) return null;
    return declared.schemas.get(mediaType) ?? null;
  }

  /** True when the contract declares this status for this operation at all. */
  declaresStatus(operationId: string, status: number | string): boolean {
    return this.operation(operationId).responses.has(String(status));
  }

  /** Every (operationId, status, mediaType) the contract binds to a schema. */
  schemaBearingResponses(): ReadonlyArray<{
    operationId: string;
    status: string;
    mediaType: string;
  }> {
    const rows: Array<{ operationId: string; status: string; mediaType: string }> = [];
    for (const operation of this.operationsById.values()) {
      for (const [status, response] of operation.responses) {
        for (const mediaType of response.schemas.keys()) {
          rows.push({ operationId: operation.operationId, status, mediaType });
        }
      }
    }
    return rows;
  }

  // --- loading and resolution ----------------------------------------------

  private document(absolutePath: string): unknown {
    const cached = this.documents.get(absolutePath);
    if (cached !== undefined) return cached;
    let raw: string;
    try {
      raw = readFileSync(absolutePath, 'utf8');
    } catch (error) {
      throw new ContractError(
        `Contract fragment ${absolutePath} could not be read: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const parsed: unknown = parseYaml(raw);
    this.documents.set(absolutePath, parsed);
    return parsed;
  }

  /**
   * Resolves one `$ref` — `#/pointer` inside the same fragment, or
   * `./paths/x.yaml#/pointer` into a sibling. The fragments carry their own
   * top-level `components:` (the phase lead merges them on integration), so
   * `#/components/Problem` means "this document's Problem", and resolving it
   * against the ROOT document would silently find nothing.
   */
  private resolveRef(ref: string, from: SchemaNode): SchemaNode {
    const hash = ref.indexOf('#');
    if (hash < 0) {
      throw new ContractError(`$ref '${ref}' (in ${from.documentId}) carries no JSON Pointer`);
    }
    const filePart = ref.slice(0, hash);
    const pointer = ref.slice(hash + 1);
    // Resolved against the ROOT document's directory, not the referring
    // fragment's. That is the convention every existing reference in this
    // contract already uses, and — more to the point — it is what the Dart
    // client generator does. Two readers of one contract that disagree about
    // where a reference points will eventually disagree about what the API is,
    // and the generated client is the half that ships.
    const documentId =
      filePart === '' ? from.documentId : resolvePath(dirname(this.rootPath), filePart);

    let node: unknown = this.document(documentId);
    if (pointer !== '' && !pointer.startsWith('/')) {
      throw new ContractError(`$ref '${ref}' (in ${from.documentId}) is not a JSON Pointer`);
    }
    for (const token of pointer.split('/').slice(1)) {
      const key = decodePointerToken(token);
      if (!isPlainObject(node) || !Object.prototype.hasOwnProperty.call(node, key)) {
        throw new ContractError(
          `$ref '${ref}' (in ${from.documentId}) does not resolve: '${key}' is absent in ${documentId}`,
        );
      }
      node = node[key];
    }
    return { node, documentId };
  }

  private index(): void {
    const root = this.document(this.rootPath);
    if (!isPlainObject(root) || !isPlainObject(root['paths'])) {
      throw new ContractError(`${this.rootPath} has no 'paths' object`);
    }
    for (const [path, pathItemRaw] of Object.entries(root['paths'])) {
      const pathItem = this.dereference({ node: pathItemRaw, documentId: this.rootPath });
      if (!isPlainObject(pathItem.node)) {
        throw new ContractError(`Path item for '${path}' is not an object`);
      }
      for (const [key, operationRaw] of Object.entries(pathItem.node)) {
        if (PATH_ITEM_NON_OPERATION_KEYS.has(key)) continue;
        if (!(HTTP_METHODS as readonly string[]).includes(key)) {
          throw new ContractError(`Path item '${path}' carries unknown key '${key}'`);
        }
        this.addOperation(path, key as HttpMethod, {
          node: operationRaw,
          documentId: pathItem.documentId,
        });
      }
    }

    // A conformance suite that indexed nothing looks exactly like one that
    // found nothing wrong. It must not be possible to reach a green run that
    // way, so an empty index is fatal HERE, before any test asserts anything.
    if (this.operationsById.size === 0) {
      throw new ContractError(
        `${this.rootPath} yielded zero operations. Either the document moved or the ` +
          `index broke; either way this suite would validate nothing.`,
      );
    }
  }

  private addOperation(path: string, method: HttpMethod, operation: SchemaNode): void {
    if (!isPlainObject(operation.node)) {
      throw new ContractError(`Operation ${method.toUpperCase()} ${path} is not an object`);
    }
    const operationId = operation.node['operationId'];
    if (typeof operationId !== 'string' || operationId === '') {
      throw new ContractError(`Operation ${method.toUpperCase()} ${path} has no operationId`);
    }
    const existing = this.operationsById.get(operationId);
    if (existing !== undefined) {
      throw new ContractError(
        `operationId '${operationId}' is declared twice (${existing.method.toUpperCase()} ${existing.path} and ${method.toUpperCase()} ${path})`,
      );
    }

    const responsesRaw = operation.node['responses'];
    if (!isPlainObject(responsesRaw)) {
      throw new ContractError(`Operation '${operationId}' declares no responses`);
    }
    const responses = new Map<string, DeclaredResponse>();
    for (const [status, responseRaw] of Object.entries(responsesRaw)) {
      const response = this.dereference({ node: responseRaw, documentId: operation.documentId });
      if (!isPlainObject(response.node)) {
        throw new ContractError(`Response ${status} of '${operationId}' is not an object`);
      }
      const schemas = new Map<string, SchemaNode>();
      const content = response.node['content'];
      if (content !== undefined) {
        if (!isPlainObject(content)) {
          throw new ContractError(
            `Response ${status} of '${operationId}' has a non-object content`,
          );
        }
        for (const [mediaType, mediaRaw] of Object.entries(content)) {
          if (!isPlainObject(mediaRaw)) {
            throw new ContractError(
              `Response ${status} of '${operationId}' declares a malformed ${mediaType} entry`,
            );
          }
          const schema = mediaRaw['schema'];
          if (schema === undefined) continue;
          schemas.set(mediaType, { node: schema, documentId: response.documentId });
        }
      }
      responses.set(status, { status, schemas });
    }

    const requestMediaTypes: string[] = [];
    const requestBodyRaw = operation.node['requestBody'];
    if (requestBodyRaw !== undefined) {
      const requestBody = this.dereference({
        node: requestBodyRaw,
        documentId: operation.documentId,
      });
      if (!isPlainObject(requestBody.node)) {
        throw new ContractError(`Request body of '${operationId}' is not an object`);
      }
      const content = requestBody.node['content'];
      if (content !== undefined) {
        if (!isPlainObject(content)) {
          throw new ContractError(`Request body of '${operationId}' has a non-object content`);
        }
        requestMediaTypes.push(...Object.keys(content));
      }
    }

    this.operationsById.set(operationId, {
      operationId,
      method,
      path,
      responses,
      requestMediaTypes,
    });
  }

  /** Follows a chain of `$ref`s at the document level (path items, responses). */
  private dereference(start: SchemaNode): SchemaNode {
    let current = start;
    for (let hops = 0; hops < 16; hops += 1) {
      if (!isPlainObject(current.node)) return current;
      const ref = current.node['$ref'];
      if (typeof ref !== 'string') return current;
      current = this.resolveRef(ref, current);
    }
    throw new ContractError(`$ref chain starting in ${start.documentId} did not terminate`);
  }
}
