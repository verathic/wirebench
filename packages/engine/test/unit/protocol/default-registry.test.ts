import { afterEach, describe, expect, it } from 'vitest';
import { createBuiltinRegistry, defaultRegistry, setDefaultRegistry } from '../../../src/protocols.js';

describe('setDefaultRegistry', () => {
  afterEach(() => {
    setDefaultRegistry(undefined);
  });

  it('makes every entry point that is passed no registry use the one a host built', () => {
    const switched = createBuiltinRegistry({ grpc: false });
    setDefaultRegistry(switched);

    expect(defaultRegistry()).toBe(switched);
    expect(defaultRegistry().status('grpc')).toBe('disabled');
    expect(defaultRegistry().status('rest')).toBe('enabled');
  });

  it('goes back to the built-in registry, every feature on, when cleared', () => {
    setDefaultRegistry(createBuiltinRegistry({ grpc: false }));
    setDefaultRegistry(undefined);

    expect(defaultRegistry().status('grpc')).toBe('enabled');
  });
});
