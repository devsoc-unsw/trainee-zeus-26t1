import type { SupabaseClient } from '@supabase/supabase-js';
import { judgeChain as realJudgeChain, type JudgeResult, type TestResult } from '@/lib/judge/gemini';
import { generateTestCases as realGenerateTestCases, type TestCase } from '@/lib/judge/test-cases';
import { runCases as realRunCases } from '@/lib/judge0/run';

type Submission = {
  chain_index: number;
  round_num: number;
  round_type: string;
  content: string;
  language: string | null;
};

type ChainScore = {
  chain_index: number;
  status: string;
};

type GenerateFn = (args: { code: string; language: string }) => Promise<TestCase[]>;
type RunFn = (args: { code: string; language: string; cases: TestCase[] }) => Promise<TestResult[]>;
type JudgeFn = (input: {
  originalCode: string; finalCode: string; language: string;
  testResults?: { original: TestResult[]; final: TestResult[] };
}) => Promise<JudgeResult>;

async function maybeRunBehavioural(args: {
  originalCode: string;
  finalCode: string;
  language: string;
  generateTestCases: GenerateFn;
  runCases: RunFn;
}): Promise<{ original: TestResult[]; final: TestResult[] } | null> {
  try {
    const cases = await args.generateTestCases({ code: args.originalCode, language: args.language });
    if (cases.length === 0) return null;
    const [original, final] = await Promise.all([
      args.runCases({ code: args.originalCode, language: args.language, cases }),
      args.runCases({ code: args.finalCode, language: args.language, cases }),
    ]);
    if (original.length === 0 || final.length === 0) return null;
    return { original, final };
  } catch {
    return null;
  }
}

export async function judgeRoom(args: {
  supabase: SupabaseClient;
  roomId: string;
  judgeChain?: JudgeFn;
  generateTestCases?: GenerateFn;
  runCases?: RunFn;
}): Promise<{ judged: number; failed: number }> {
  const { supabase, roomId } = args;
  const judge = args.judgeChain ?? realJudgeChain;
  const generate = args.generateTestCases ?? realGenerateTestCases;
  const run = args.runCases ?? realRunCases;

  const { data: room } = await supabase
    .from('rooms').select('id, round_count').eq('id', roomId).maybeSingle();
  if (!room) return { judged: 0, failed: 0 };
  const roundCount = (room as { round_count: number }).round_count;

  const { data: subsData } = await supabase
    .from('submissions').select('chain_index, round_num, round_type, content, language').eq('room_id', roomId);
  const submissions = (subsData ?? []) as Submission[];

  const { data: scoresData } = await supabase
    .from('chain_scores').select('chain_index, status').eq('room_id', roomId);
  const scores = (scoresData ?? []) as ChainScore[];

  let judged = 0;
  let failed = 0;

  for (const score of scores) {
    if (score.status !== 'pending') continue;

    const c = score.chain_index;
    const original = submissions.find((s) => s.chain_index === c && s.round_num === 1 && s.round_type === 'code');
    const final = submissions.find((s) => s.chain_index === c && s.round_num === roundCount && s.round_type === 'code');

    if (!original || !final) {
      await supabase
        .from('chain_scores')
        .update({ status: 'failed', notes: 'missing original or final code submission', updated_at: new Date().toISOString() })
        .eq('room_id', roomId).eq('chain_index', c);
      failed++;
      continue;
    }

    const language = original.language ?? 'python';
    const behavioural = await maybeRunBehavioural({
      originalCode: original.content,
      finalCode: final.content,
      language,
      generateTestCases: generate,
      runCases: run,
    });

    try {
      const result = await judge({
        originalCode: original.content,
        finalCode: final.content,
        language,
        ...(behavioural ? { testResults: behavioural } : {}),
      });
      await supabase
        .from('chain_scores')
        .update({
          status: 'done',
          overall_score: result.overallScore,
          notes: result.notes,
          updated_at: new Date().toISOString(),
        })
        .eq('room_id', roomId).eq('chain_index', c);
      judged++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabase
        .from('chain_scores')
        .update({ status: 'failed', notes: `gemini api error: ${message}`, updated_at: new Date().toISOString() })
        .eq('room_id', roomId).eq('chain_index', c);
      failed++;
    }
  }

  return { judged, failed };
}
