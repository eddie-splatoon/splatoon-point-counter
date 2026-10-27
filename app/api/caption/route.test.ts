import { NextRequest } from 'next/server';
import { describe, it, expect, beforeEach } from 'vitest';

import { GET, POST, DELETE, MAX_CAPTION_LINES, getInitialCaptionData, __TEST_ONLY_setCaptionData } from './route';

const postText = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/caption', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));

beforeEach(() => {
  __TEST_ONLY_setCaptionData(getInitialCaptionData());
});

describe('Caption API', () => {
  describe('GET', () => {
    it('returns the initial caption data', async () => {
      const response = await GET();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ lines: [], revision: 0 });
    });
  });

  describe('POST', () => {
    it('appends a trimmed caption line and increments the revision', async () => {
      const response = await postText({ text: '  こんにちは  ' });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.revision).toBe(1);
      expect(body.lines).toHaveLength(1);
      expect(body.lines[0]).toMatchObject({ id: 1, text: 'こんにちは' });
      expect(typeof body.lines[0].timestamp).toBe('number');

      const getBody = await (await GET()).json();
      expect(getBody).toEqual(body);
    });

    it(`keeps only the latest ${MAX_CAPTION_LINES} lines`, async () => {
      for (let i = 1; i <= MAX_CAPTION_LINES + 2; i++) {
        await postText({ text: `line ${i}` });
      }
      const body = await (await GET()).json();

      expect(body.lines).toHaveLength(MAX_CAPTION_LINES);
      expect(body.lines[0].text).toBe('line 3');
      expect(body.lines[MAX_CAPTION_LINES - 1].text).toBe(`line ${MAX_CAPTION_LINES + 2}`);
      expect(body.revision).toBe(MAX_CAPTION_LINES + 2);
    });

    it.each([
      ['missing text', {}],
      ['non-string text', { text: 123 }],
      ['empty text', { text: '' }],
      ['whitespace-only text', { text: '   ' }],
      ['null body', null],
    ])('returns 400 for %s', async (_, payload) => {
      const response = await postText(payload);
      expect(response.status).toBe(400);
      expect(await (await GET()).json()).toEqual(getInitialCaptionData());
    });

    it('returns 400 for invalid JSON', async () => {
      const response = await postText('not json');
      expect(response.status).toBe(400);
    });
  });

  describe('DELETE', () => {
    it('clears all lines and increments the revision', async () => {
      await postText({ text: 'a' });
      await postText({ text: 'b' });

      const response = await DELETE();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ lines: [], revision: 3 });
    });
  });
});
