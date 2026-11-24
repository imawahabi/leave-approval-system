import assert from 'node:assert/strict';
import test from 'node:test';
import { maxBodyBytes, readJsonBody } from '../supabase/functions/civil-auth/body.ts';

test('accepts a valid small JSON object', async () => {
  const body = await readJsonBody(new Request('https://example.invalid', {
    method: 'POST',
    body: JSON.stringify({ action: 'login', civilId: '123456789012' }),
  }));
  assert.deepEqual(body, { action: 'login', civilId: '123456789012' });
});

test('rejects an oversized body without a content-length header', async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"value":"' + 'x'.repeat(maxBodyBytes) + '"}'));
      controller.close();
    },
  });
  const request = new Request('https://example.invalid', {
    method: 'POST', body, duplex: 'half',
  });
  assert.equal(request.headers.get('content-length'), null);
  assert.equal(await readJsonBody(request), null);
});

test('rejects JSON arrays', async () => {
  const body = await readJsonBody(new Request('https://example.invalid', {
    method: 'POST', body: '[]',
  }));
  assert.equal(body, null);
});

test('rejects malformed JSON as invalid input', async () => {
  const body = await readJsonBody(new Request('https://example.invalid', {
    method: 'POST', body: '{invalid',
  }));
  assert.equal(body, null);
});
