const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const MAX_CASES = 5;
const SUPPORTED_LANGS = new Set(['python']);

export type TestCase = { name: string; code: string };

function stripFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function buildPrompt(code: string): string {
  return `You are given a Python function. Generate 2 to 3 test cases that assert properties of the function. Each test case is a small Python snippet that, when run after the function definition, asserts an expected behavior using \`assert\`.

The function:
\`\`\`python
${code}
\`\`\`

Return JSON only, no commentary:
[
  {"name": "<short description>", "code": "<one or two lines of Python that uses assert>"},
  ...
]

Rules:
- Each \`code\` field must be runnable Python that references the function exactly as defined above (same function name).
- Do NOT include imports unless absolutely necessary.
- Do NOT include print statements; only assertions.
- Keep each snippet to 1-2 lines.`;
}

/**
 * Ask Gemini for behavioural test snippets. Returns [] on any failure —
 * Judge0 integration is best-effort.
 */
export async function generateTestCases(args: { code: string; language: string }): Promise<TestCase[]> {
  if (!SUPPORTED_LANGS.has(args.language)) return [];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(args.code) }] }],
      }),
    });
    if (!res.ok) return [];
    const body = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFences(text));
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];

    const valid: TestCase[] = [];
    for (const entry of parsed) {
      if (
        entry && typeof entry === 'object' &&
        typeof (entry as TestCase).name === 'string' &&
        typeof (entry as TestCase).code === 'string'
      ) {
        valid.push({ name: (entry as TestCase).name, code: (entry as TestCase).code });
      }
      if (valid.length >= MAX_CASES) break;
    }
    return valid;
  } catch {
    return [];
  }
}
