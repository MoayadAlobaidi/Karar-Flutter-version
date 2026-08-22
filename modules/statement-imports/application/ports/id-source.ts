/**
 * `IdSource` — where a new identifier comes from.
 *
 * A port rather than a `randomUUID()` call, for two reasons that both matter
 * here. The domain must stay deterministic (architecture test 11), and a
 * commit in this module mints identifiers for hundreds of transactions,
 * revisions and provenance records at once — a test that wants to assert what
 * a commit wrote needs those identifiers to be predictable, and a test that
 * has to mock a global has already lost.
 *
 * The production implementation mints UUIDv7, so identifiers sort by creation
 * time and a B-tree index over a primary key does not fragment the way a
 * UUIDv4 index does under insert-heavy load. That is a property of the
 * implementation, not of this contract: a caller may not depend on the
 * ordering, because doing so would make the id a timestamp and a timestamp
 * something a caller could read a creation instant out of.
 */
export interface IdSource {
  nextId(): string;
}
