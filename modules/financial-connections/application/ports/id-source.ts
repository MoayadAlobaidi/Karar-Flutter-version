/**
 * `IdSource` — identity minting for this module's rows (data-model.md §2:
 * UUID v7). Randomness and the clock stay in infrastructure behind this port
 * so the use cases and the domain remain deterministic and replayable
 * (architecture test 11).
 */
export interface IdSource {
  nextId(): string;
}
