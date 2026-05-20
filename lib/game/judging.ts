import type { SupabaseClient } from '@supabase/supabase-js';
import { judgeChain as realJudgeChain, type JudgeResult } from '@/lib/judge/gemini';

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

export async function judgeRoom(args: {
  supabase: SupabaseClient;
  roomId: string;
  judgeChain?: (input: { originalCode: string; finalCode: string; language: string }) => Promise<JudgeResult>;
}): Promise<{ judged: number; failed: number }> {
  const { supabase, roomId } = args;
  const judge = args.judgeChain ?? realJudgeChain;

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

    try {
      const result = await judge({
        originalCode: original.content,
        finalCode: final.content,
        language: original.language ?? 'python',
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
