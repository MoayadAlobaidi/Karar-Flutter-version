// Phase 1 placeholder: establishes the package boundary and the build.
// The full transition engine arrives in Phase 2. Every lifecycle move — human,
// job, or AI initiated — routes through a declared transition table.

export interface Transition<State extends string, Event extends string> {
  readonly from: State;
  readonly event: Event;
  readonly to: State;
}

/** True when the table declares a transition out of `from` for `event`. */
export const canTransition = <State extends string, Event extends string>(
  transitions: readonly Transition<State, Event>[],
  from: State,
  event: Event,
): boolean => transitions.some((t) => t.from === from && t.event === event);
