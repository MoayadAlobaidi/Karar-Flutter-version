/**
 * The subject-policy module's only legal import surface (architecture
 * test 3).
 *
 * Exported: the domain vocabulary and pure temporal resolution, the ports
 * this module declares (SubjectOptionSource — the jurisdiction-policy
 * workstream's pack resolution binds it at composition; the repository and
 * id-source ports the composition root implements), the use cases, and the
 * pinned-version reader (`GetSelectionVersionForResolution`) the capability
 * workstream's resolver consumes.
 *
 * Deliberately absent: the Prisma repository and the id source
 * (infrastructure is wired by the composition root); ANY use case that
 * records a selection for somebody else — no admin-elects-for-customer path
 * exists in this module, by design (MODULE.md, permissions deliberately
 * absent); any PolicyService port — no operator action exists here; and any
 * HTTP surface — selections never enter bootstrap or client aggregation
 * from this module, and subject-facing election UI arrives with the owning
 * capability, purpose-limited (MODULE.md §APIs exposed).
 */

export {
  SELECTION_STATUSES,
  resolveSelectionAt,
  type SelectionAtInstant,
  type SelectionStatus,
  type SubjectPolicySelection,
} from './domain/selection.js';
export {
  optionPermitted,
  type PermittedProfileOption,
  type SubjectOptionSet,
} from './domain/option-set.js';
export { InvalidReferenceError, JurisdictionRef, ProfileRef } from './domain/refs.js';

export type {
  OptionSetResolution,
  SubjectOptionSource,
} from './application/ports/subject-option-source.js';
export type {
  SubjectPolicyPrincipal,
  SubjectPolicySelectionRepository,
} from './application/ports/selection-repository.js';
export type { IdSource } from './application/ports/id-source.js';

export {
  InvalidSelectionInputError,
  type AuditAppendFailed,
  type CapabilityUnknown,
  type NoSubjectPolicyDeclared,
  type NotFound,
  type OptionNotPermitted,
  type OptionSetUnresolved,
  type PackVersionMismatch,
  type SelectionNotActive,
  type StoreFailure,
} from './application/errors.js';
export { SubjectPolicyAuditTrail, type AuditEntry } from './application/audit-trail.js';

export {
  GetOwnSelection,
  GetSelectionVersionForResolution,
  RecordSubjectPolicySelection,
  SELECTION_SOURCE_SUBJECT_ELECTION,
  WithdrawOwnSelection,
  type CapabilityIdPredicate,
  type GetOwnSelectionError,
  type GetOwnSelectionInput,
  type GetSelectionVersionForResolutionError,
  type GetSelectionVersionForResolutionInput,
  type OwnSelectionView,
  type RecordSubjectPolicySelectionError,
  type RecordSubjectPolicySelectionInput,
  type SelectionVersionResolution,
  type WithdrawOwnSelectionError,
  type WithdrawOwnSelectionInput,
} from './application/use-cases/selections.js';
