import { sleep } from './sleep';

export async function pollUntil<T>(
  condition: () => Promise<T | undefined>,
  options?: {
    interval?: number;
    timeout?: number;
  },
): Promise<T> {
  const {
    interval = 5e3, // 5 seconds
    timeout = 10 * 60e3, // 10 minutes
  } = options ?? {};
  const start = Date.now();

  while (true) {
    await sleep(interval);
    if (Date.now() - start > timeout) throw new Error('Timeout');

    // A slow check never overlaps the next one, and its errors reject the poll
    const res = await condition();
    if (res != null) return res;
  }
}
