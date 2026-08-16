/** Identifier generation as a port: use cases never reach for randomness
 * themselves (deterministic core; ids are infrastructure). */
export interface IdSource {
  nextId(): string;
}
