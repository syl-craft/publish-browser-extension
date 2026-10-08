import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChromeWebStoreV2 } from '../stores/chrome-web-store-v2';

const originalFetch = globalThis.fetch;

describe('ChromeWebStoreV2', () => {
  let directory: string;
  let zip: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'publish-browser-extension-'));
    zip = join(directory, 'extension.zip');
    await writeFile(zip, 'zip');
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  });

  it('sends a deploy percentage of 0 when publishing', async () => {
    const requests = mockCwsApi();
    const store = new ChromeWebStoreV2({
      apiVersion: 'v2',
      zip,
      extensionId: 'test-extension',
      publisherId: 'test-publisher',
      serviceAccountAccessToken: 'test-token',
      skipSubmitReview: false,
      cancelPending: false,
      deployPercentage: 0,
    });

    await store.submit();

    const publish = requests.find(r => r.url.endsWith(':publish'));
    expect(JSON.parse(String(publish?.init.body))).toEqual({
      deployInfos: [{ deployPercentage: 0 }],
    });
  });

  it('omits deploy infos when no deploy percentage is set', async () => {
    const requests = mockCwsApi();
    const store = new ChromeWebStoreV2({
      apiVersion: 'v2',
      zip,
      extensionId: 'test-extension',
      publisherId: 'test-publisher',
      serviceAccountAccessToken: 'test-token',
      skipSubmitReview: false,
      cancelPending: false,
    });

    await store.submit();

    const publish = requests.find(r => r.url.endsWith(':publish'));
    expect(JSON.parse(String(publish?.init.body))).toEqual({});
  });
});

function mockCwsApi(): Array<{ url: string; init: RequestInit }> {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = mock(
    async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input);
      requests.push({ url, init });

      if (url.endsWith(':fetchStatus')) return jsonResponse({});
      if (url.endsWith(':upload'))
        return jsonResponse({ uploadState: 'SUCCEEDED' });
      if (url.endsWith(':publish')) return jsonResponse({});

      throw Error(`Unexpected request: ${init.method} ${url}`);
    },
  ) as unknown as typeof fetch;
  return requests;
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
  });
}
