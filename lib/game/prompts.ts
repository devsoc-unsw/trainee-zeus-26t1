import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Returns the row count of the `prompts` table. Used by the start
 * route to surface a friendly INTERNAL error when the seed list is
 * shorter than the lobby player count.
 */
export async function countPrompts(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from('prompts')
    .select('*', { head: true, count: 'exact' });
  if (error) throw new Error(`prompts count failed: ${error.message}`);
  return count ?? 0;
}
