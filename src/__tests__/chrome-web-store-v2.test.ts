import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChromeWebStoreV2 } from '../stores/chrome-web-store-v2';
import type { ChromeWebStoreV2Options } from '../utils/config-schema';

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

  it('waits for an async upload to succeed before publishing', async () => {
    const requests = mockCwsApi({
      uploadState: 'IN_PROGRESS',
      asyncUploadStates: ['SUCCEEDED'],
    });
    const store = new ChromeWebStoreV2(options(zip));

    await store.submit();

    expect(requests.map(r => r.url.split(':').at(-1))).toEqual([
      'fetchStatus',
      'upload',
      'fetchStatus',
      'publish',
    ]);
  }, 10_000);

  it('fails without publishing when an async upload fails', async () => {
    const requests = mockCwsApi({
      uploadState: 'IN_PROGRESS',
      asyncUploadStates: ['FAILED'],
    });
    const store = new ChromeWebStoreV2(options(zip));

    await expect(store.submit()).rejects.toThrow(
      'CWS item upload state is FAILED',
    );
    expect(requests.some(r => r.url.endsWith(':publish'))).toBe(false);
  }, 10_000);
});

function options(zip: string): ChromeWebStoreV2Options {
  return {
    apiVersion: 'v2',
    zip,
    extensionId: 'test-extension',
    publisherId: 'test-publisher',
    serviceAccountAccessToken: 'test-token',
    skipSubmitReview: false,
    cancelPending: false,
  };
}

function mockCwsApi({
  uploadState = 'SUCCEEDED',
  asyncUploadStates = [],
}: {
  uploadState?: string;
  asyncUploadStates?: string[];
} = {}): Array<{ url: string; init: RequestInit }> {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  let statusCalls = 0;
  globalThis.fetch = mock(
    async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input);
      requests.push({ url, init });

      if (url.endsWith(':fetchStatus')) {
        // The first call validates credentials, before any upload
        const lastAsyncUploadState = asyncUploadStates[statusCalls++ - 1];
        return jsonResponse({ lastAsyncUploadState });
      }
      if (url.endsWith(':upload')) return jsonResponse({ uploadState });
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
