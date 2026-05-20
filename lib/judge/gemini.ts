const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export type JudgeInput = {
  originalCode: string;
  finalCode: string;
  language: string;
};
export type JudgeResult = {
  overallScore: number;
  notes: string;
};

function buildPrompt({ originalCode, finalCode, language }: JudgeInput): string {
  return `You are evaluating how faithfully a code reconstruction matches an original function passed through a game of telephone.

Original function (language: ${language}):
\`\`\`${language}
${originalCode}
\`\`\`

Final reconstruction (language: ${language}):
\`\`\`${language}
${finalCode}
\`\`\`

Score the reconstruction from 0 to 100:
- 100: behaviorally and structurally identical
- 80+: same behavior, minor style differences
- 60-79: similar intent, partial behavior match
- 40-59: roughly the right shape but significantly different
- below 40: lost most of the original idea

Return JSON only, no commentary:
{"overallScore": <0-100>, "notes": "<1-2 sentence explanation>"}`;
}

function stripFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

export async function judgeChain(input: JudgeInput): Promise<JudgeResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(input) }] }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`gemini API ${res.status}: ${detail.slice(0, 200)}`);
  }

  const body = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('gemini: no candidates in response');

  let parsed: { overallScore?: unknown; notes?: unknown };
  try {
    parsed = JSON.parse(stripFences(text));
  } catch (err) {
    throw new Error(`gemini: failed to parse JSON: ${(err as Error).message}`);
  }

  const score = typeof parsed.overallScore === 'number' ? parsed.overallScore : Number(parsed.overallScore);
  const notes = typeof parsed.notes === 'string' ? parsed.notes : '';
  return {
    overallScore: clampScore(score),
    notes,
  };
}
