import { describe, expect, it } from 'vitest';
import { canTransition, type Transition } from './index';

type State = 'draft' | 'active' | 'closed';
type Event = 'activate' | 'close';

const table: readonly Transition<State, Event>[] = [
  { from: 'draft', event: 'activate', to: 'active' },
  { from: 'active', event: 'close', to: 'closed' },
];

describe('canTransition', () => {
  it('allows only declared moves', () => {
    expect(canTransition(table, 'draft', 'activate')).toBe(true);
    expect(canTransition(table, 'active', 'close')).toBe(true);
  });

  it('rejects undeclared moves', () => {
    expect(canTransition(table, 'draft', 'close')).toBe(false);
    expect(canTransition(table, 'closed', 'activate')).toBe(false);
  });
});
