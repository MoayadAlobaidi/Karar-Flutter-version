/**
 * Base class for every error the kernel throws.
 *
 * The kernel's error rule (documented on `Result`): a thrown `KernelError`
 * signals a programmer error — a violated precondition at a call site, such as
 * adding two currencies or constructing Money from a malformed literal. It is
 * not a control-flow channel. Expected, recoverable outcomes are returned as
 * `Result` values by the code that owns the boundary (for example the wire
 * mappers in `@karar/platform`), which may catch these errors at the edge and
 * convert them.
 */
export class KernelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
