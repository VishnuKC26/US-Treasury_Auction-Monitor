import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import chatHandler from './api/chat.js';

describe('API /api/chat Serverless Handler Tests', () => {
  process.env.NODE_ENV = 'test';
  function createMockRes() {
    const res = {
      statusCode: 200,
      headers: {},
      body: '',
      setHeader(k, v) { this.headers[k] = v; },
      end(data) { this.body = data || ''; }
    };
    return res;
  }

  it('rejects GET requests with 405 Method Not Allowed', async () => {
    const req = { method: 'GET' };
    const res = createMockRes();
    await chatHandler(req, res);
    assert.equal(res.statusCode, 405);
    const json = JSON.parse(res.body);
    assert.match(json.error, /Method Not Allowed/);
  });

  it('handles OPTIONS pre-flight requests with 204', async () => {
    const req = { method: 'OPTIONS' };
    const res = createMockRes();
    await chatHandler(req, res);
    assert.equal(res.statusCode, 204);
  });

  it('returns 400 when Groq API key is missing with link to console.groq.com/keys', async () => {
    const req = {
      method: 'POST',
      body: { query: 'Analyze 10Y note' }
    };
    const res = createMockRes();
    // Ensure env key is not overriding for test
    const origKey = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;

    try {
      await chatHandler(req, res);
      assert.equal(res.statusCode, 400);
      const json = JSON.parse(res.body);
      assert.match(json.error, /https:\/\/console\.groq\.com\/keys/);
    } finally {
      if (origKey) process.env.GROQ_API_KEY = origKey;
    }
  });

  it('returns 400 when query is empty but key is provided', async () => {
    const req = {
      method: 'POST',
      body: { apiKey: 'gsk_mockkey', query: '' }
    };
    const res = createMockRes();
    await chatHandler(req, res);
    assert.equal(res.statusCode, 400);
    const json = JSON.parse(res.body);
    assert.match(json.error, /Missing query/);
  });

  it('strictly rejects off-topic queries with institutional refusal notice', async () => {
    const req = {
      method: 'POST',
      body: { apiKey: 'gsk_mockkey', query: 'Can you give me a chocolate cake recipe?' }
    };
    const res = createMockRes();
    await chatHandler(req, res);
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.model, 'institutional-guardrail');
    assert.match(json.answer, /Out of Scope Notice/);
    assert.match(json.answer, /strictly refrain from answering/i);
  });
});

