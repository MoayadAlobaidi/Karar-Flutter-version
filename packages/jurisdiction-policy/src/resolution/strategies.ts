// Resolution strategies — a REGISTRY, not a closed enum (jurisdiction-policy.md
// §5). Which policy version governs a long-lived record is a legal question
// with an open answer set, so:
//
//   - each capability that requires resolution NAMES its strategy in the pack;
//   - an unnamed or unknown strategy fails validation and resolution — there
//     is NO default strategy anywhere in this package;
//   - adding a strategy is a new registered definition plus tests; the
//     resolver consults the registry and never changes;
//   - the strategy id and pack version always appear in provenance.

export interface GoverningVersionContext {
  /** The pack version in force when the record was created, if known. */
  readonly versionAtCreation: string | null;
  /** The pack version in force at the instant the question is asked. */
  readonly versionAtEvaluation: string | null;
}

export interface ResolutionStrategyDefinition {
  readonly id: string;
  readonly description: string;
  /**
   * The pack version(s) that govern a record under this strategy. An empty
   * result means the strategy cannot answer from the given context — the
   * consumer fails closed. More than one version means the consumer combines
   * the answers RESTRICTIVELY (intersection of what each permits).
   */
  readonly governingVersions: (context: GoverningVersionContext) => readonly string[];
}

export interface ResolutionStrategyRegistry {
  get(id: string): ResolutionStrategyDefinition | undefined;
  has(id: string): boolean;
  ids(): readonly string[];
}

/** Builds an immutable registry; a duplicate id is a defect and throws. */
export function createResolutionStrategyRegistry(
  definitions: readonly ResolutionStrategyDefinition[],
): ResolutionStrategyRegistry {
  const byId = new Map<string, ResolutionStrategyDefinition>();
  for (const definition of definitions) {
    if (byId.has(definition.id)) {
      throw new Error(`resolution strategy '${definition.id}' is registered twice`);
    }
    byId.set(definition.id, definition);
  }
  return Object.freeze({
    get: (id: string) => byId.get(id),
    has: (id: string) => byId.has(id),
    ids: () => Object.freeze([...byId.keys()]),
  });
}

export const AT_CREATION: ResolutionStrategyDefinition = Object.freeze({
  id: 'AT_CREATION',
  description: 'The policy in force when the record was made governs it.',
  governingVersions: ({ versionAtCreation }: GoverningVersionContext) =>
    versionAtCreation === null ? [] : [versionAtCreation],
});

export const AT_EVALUATION: ResolutionStrategyDefinition = Object.freeze({
  id: 'AT_EVALUATION',
  description: 'The policy in force when the question is asked governs it.',
  governingVersions: ({ versionAtEvaluation }: GoverningVersionContext) =>
    versionAtEvaluation === null ? [] : [versionAtEvaluation],
});

export const MOST_RESTRICTIVE: ResolutionStrategyDefinition = Object.freeze({
  id: 'MOST_RESTRICTIVE',
  description:
    'Both the creation-time and evaluation-time policies are consulted; only what both permit is permitted.',
  governingVersions: ({ versionAtCreation, versionAtEvaluation }: GoverningVersionContext) => {
    const versions: string[] = [];
    if (versionAtCreation !== null) versions.push(versionAtCreation);
    if (versionAtEvaluation !== null && versionAtEvaluation !== versionAtCreation) {
      versions.push(versionAtEvaluation);
    }
    return versions;
  },
});

/** The strategies registered at launch. Consumers may build wider registries
 * (createResolutionStrategyRegistry) without touching the resolver. */
export const DEFAULT_RESOLUTION_STRATEGIES: ResolutionStrategyRegistry =
  createResolutionStrategyRegistry([AT_CREATION, AT_EVALUATION, MOST_RESTRICTIVE]);
