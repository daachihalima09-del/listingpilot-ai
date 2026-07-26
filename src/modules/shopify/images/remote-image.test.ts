import assert from 'node:assert/strict';
import test from 'node:test';
import {
  downloadRemoteImage,
  isUnsafeImageAddress,
  parseSafeRemoteImageUrl,
  RemoteImageError,
} from './remote-image.ts';

const png = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1,
]);

test('remote URL policy requires credential-free HTTPS on the standard port', () => {
  assert.equal(
    parseSafeRemoteImageUrl('https://cdn.example/image.png#preview').toString(),
    'https://cdn.example/image.png',
  );
  for (const url of [
    'http://cdn.example/image.png',
    'https://user:pass@cdn.example/image.png',
    'https://cdn.example:8443/image.png',
    'data:image/png;base64,AA==',
    'blob:https://cdn.example/id',
    'https://localhost/image.png',
    'https://127.0.0.1/image.png',
    'https://169.254.169.254/latest/meta-data',
  ]) assert.throws(() => parseSafeRemoteImageUrl(url), RemoteImageError);
});

test('private, loopback, link-local, metadata, and unsafe IPv6 are blocked', () => {
  for (const address of [
    '10.0.0.1', '127.0.0.1', '172.16.0.1', '192.168.1.1',
    '169.254.1.1', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1',
  ]) assert.equal(isUnsafeImageAddress(address), true);
  assert.equal(isUnsafeImageAddress('203.0.113.9'), false);
});

test('safe download validates each redirect, content, and authoritative hash', async () => {
  const requested: string[] = [];
  const image = await downloadRemoteImage('https://one.example/start', {
    resolveHost: async () => ['203.0.113.9'],
    fetcher: async (url) => {
      requested.push(url.toString());
      if (requested.length === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://two.example/image.png?token=secret' },
        });
      }
      return new Response(png, {
        headers: { 'content-type': 'image/png' },
      });
    },
  });
  assert.equal(requested.length, 2);
  assert.equal(image.canonicalUrl, null);
  assert.match(image.contentHash, /^[a-f0-9]{64}$/);
});

test('unsafe redirect and HTML masquerading as an image are rejected', async () => {
  await assert.rejects(() => downloadRemoteImage('https://safe.example/a', {
    resolveHost: async () => ['203.0.113.9'],
    fetcher: async () => new Response(null, {
      status: 302,
      headers: { location: 'https://127.0.0.1/private' },
    }),
  }), { category: 'UNSAFE_HOST' });
  await assert.rejects(() => downloadRemoteImage('https://safe.example/a', {
    resolveHost: async () => ['203.0.113.9'],
    fetcher: async () => new Response('<html></html>', {
      headers: { 'content-type': 'image/png' },
    }),
  }), { category: 'INVALID_CONTENT' });
});

test('redirect and download time limits are bounded', async () => {
  await assert.rejects(() => downloadRemoteImage('https://safe.example/a', {
    maximumRedirects: 0,
    resolveHost: async () => ['203.0.113.9'],
    fetcher: async () => new Response(null, {
      status: 302,
      headers: { location: 'https://safe.example/b' },
    }),
  }), { category: 'REDIRECT_LIMIT' });
  await assert.rejects(() => downloadRemoteImage('https://safe.example/a', {
    timeoutMs: 1,
    resolveHost: async () => ['203.0.113.9'],
    fetcher: async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }),
  }), { category: 'TIMEOUT' });
});
