const SUPPORTED_LANGS = new Set(['python']);
const LANGUAGE_ID: Record<string, number> = { python: 71 };

export type TestCase = { name: string; code: string };
export type TestResult = { name: string; passed: boolean; output?: string; error?: string };

function buildSourceFor(language: string, fnCode: string, caseCode: string): string {
  // Python only for this plan. Concatenate the user's function, then the
  // case's assert(s), then a sentinel print so we can detect success
  // independent of stdout being captured.
  return `${fnCode}\n\n${caseCode}\nprint("PASS")\n`;
}

export async function runCases(args: {
  code: string;
  language: string;
  cases: TestCase[];
}): Promise<TestResult[]> {
  const apiKey = process.env.JUDGE0_API_KEY;
  if (!apiKey) return [];
  if (!SUPPORTED_LANGS.has(args.language)) return [];
  if (args.cases.length === 0) return [];

  const host = process.env.JUDGE0_API_HOST ?? 'judge0-ce.p.rapidapi.com';
  const endpoint = `https://${host}/submissions?base64_encoded=false&wait=true`;
  const langId = LANGUAGE_ID[args.language];

  const results: TestResult[] = [];

  for (const c of args.cases) {
    const sourceCode = buildSourceFor(args.language, args.code, c.code);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': host,
        },
        body: JSON.stringify({
          source_code: sourceCode,
          language_id: langId,
        }),
      });
      if (!res.ok) {
        results.push({ name: c.name, passed: false, error: `judge0 HTTP ${res.status}` });
        continue;
      }
      const data = await res.json() as {
        status?: { id?: number };
        stdout?: string | null;
        stderr?: string | null;
      };
      const statusId = data.status?.id ?? 0;
      const passed = statusId === 3 && (data.stdout ?? '').includes('PASS');
      results.push({
        name: c.name,
        passed,
        output: data.stdout ?? undefined,
        error: passed ? undefined : (data.stderr ?? `status_id=${statusId}`),
      });
    } catch (err) {
      results.push({ name: c.name, passed: false, error: `judge0 fetch failed: ${(err as Error).message}` });
    }
  }

  return results;
}
