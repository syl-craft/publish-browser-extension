import { describe, expect, it } from 'bun:test';
import { pollUntil } from '../polling';
import { sleep } from '../sleep';

describe('pollUntil', () => {
  it('resolves with the first non-null value', async () => {
    let calls = 0;
    const res = await pollUntil(
      async () => (++calls === 3 ? 'done' : undefined),
      { interval: 1 },
    );

    expect(res).toBe('done');
    expect(calls).toBe(3);
  });

  it('rejects when the condition throws', async () => {
    const promise = pollUntil(
      async () => {
        throw Error('Validation failed');
      },
      { interval: 1, timeout: 1000 },
    );

    await expect(promise).rejects.toThrow('Validation failed');
  });

  it('does not run the condition again while it is still pending', async () => {
    let running = 0;
    let maxRunning = 0;
    let calls = 0;
    await pollUntil(
      async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await sleep(20);
        running--;
        return ++calls === 3 ? true : undefined;
      },
      { interval: 1 },
    );

    expect(maxRunning).toBe(1);
  });

  it('rejects with a timeout error when no value is returned in time', async () => {
    const promise = pollUntil(async () => undefined, {
      interval: 1,
      timeout: 20,
    });

    await expect(promise).rejects.toThrow('Timeout');
  });
});
