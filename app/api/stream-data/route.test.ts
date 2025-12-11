import { NextRequest } from 'next/server';
import { describe, it, expect, beforeEach } from 'vitest';

import { GET, POST, getInitialStreamData, __TEST_ONLY_setStreamData, StreamData } from './route';

// Reset the stream data before each test
beforeEach(() => {
  __TEST_ONLY_setStreamData(getInitialStreamData());
});

describe('Stream Data API', () => {
  describe('GET', () => {
    it('should return the current stream data', async () => {
      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual(getInitialStreamData());
    });
  });

  describe('POST', () => {
    it('should update the stream data with a valid request body', async () => {
      const initialData = getInitialStreamData();
      const newData = {
        ...initialData,
        scoreLabel: 'New Score Label',
        scoreValue: '1000',
        burndown: {
          ...initialData.burndown,
          entries: [{ score: 100, timestamp: 12345 }, { score: 200, timestamp: 67890 }],
        },
      };

      const request = new NextRequest('http://localhost/api/stream-data', {
        method: 'POST',
        body: JSON.stringify(newData),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.scoreLabel).toBe('New Score Label');
      expect(body.scoreValue).toBe('1000');
      expect(body.burndown.entries).toEqual([{ score: 100, timestamp: 12345 }, { score: 200, timestamp: 67890 }]);

      // Verify that the data was actually updated in the module
      const getResponse = await GET();
      const getBody = await getResponse.json();
      expect(getBody.scoreLabel).toBe('New Score Label');
    });

    it('should return a 400 error for an invalid request body', async () => {
      const invalidData = {
        scoreLabel: 123, // Invalid type
      };

      const request = new NextRequest('http://localhost/api/stream-data', {
        method: 'POST',
        body: JSON.stringify(invalidData),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('should update lastEvent when it is in the payload', async () => {
        const initialData = getInitialStreamData();
        const event = { name: 'STAR', timestamp: Date.now() };
        const payload = {
            ...initialData,
            lastEvent: event,
        };

        const request = new NextRequest('http://localhost/api/stream-data', {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.lastEvent).toEqual(event);
    });
  });
});
