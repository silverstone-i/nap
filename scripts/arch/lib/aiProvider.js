/**
 * @file AI provider factory — calls OpenAI or Claude via native fetch
 * @module scripts/arch/lib/aiProvider
 */

/* global fetch */

/**
 * Create an AI provider that can send a prompt and return a text response.
 * @param {'openai'|'claude'} provider
 * @returns {{ interpret: (prompt: string) => Promise<string> }}
 */
export function createProvider(provider) {
  switch (provider) {
    case 'openai':
      return { interpret: interpretOpenAI };
    case 'claude':
      return { interpret: interpretClaude };
    default:
      throw new Error(`Unknown AI provider: "${provider}". Use "openai" or "claude".`);
  }
}

/**
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function interpretOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4096,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

/**
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function interpretClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return data.content[0].text;
}
