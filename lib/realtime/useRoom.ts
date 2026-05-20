'use client';

import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';
import { roomChannel, playersChannel, submissionsChannel } from './channels';

export type RoomRow = {
  id: string;
  code: string;
  host_id: string | null;
  status: 'lobby' | 'active' | 'ended';
  phase: 'lobby' | 'writing' | 'describing' | 'reimplementing' | 'reveal' | 'ended';
  current_round: number;
  round_count: number;
};
export type PlayerRow = {
  id: string;
  room_id: string;
  name: string;
  is_host: boolean;
  seat_index: number | null;
  created_at: string;
};
export type SubmissionRow = {
  id: string;
  room_id: string;
  round_num: number;
  chain_index: number;
  author_id: string | null;
  round_type: 'code' | 'describe';
  content: string;
  language: 'python' | 'javascript' | 'java' | null;
  created_at: string;
};

export type UseRoomState = {
  room: RoomRow | null;
  players: PlayerRow[];
  submissions: SubmissionRow[];
  loading: boolean;
  error: string | null;
};

/**
 * Subscribe to a single room's `rooms` row + the `players` list + the
 * `submissions` list, all filtered by `room_id`. Re-renders the calling
 * component whenever any of them changes. Pass `null` for `roomId` to
 * skip subscriptions (e.g. before navigation).
 */
export function useRoom(roomId: string | null): UseRoomState {
  const [state, setState] = useState<UseRoomState>({
    room: null,
    players: [],
    submissions: [],
    loading: !!roomId,
    error: null,
  });

  useEffect(() => {
    if (!roomId) {
      setState({ room: null, players: [], submissions: [], loading: false, error: null });
      return;
    }
    const sb = getBrowserClient();
    let cancelled = false;

    (async () => {
      const [roomRes, playersRes, submissionsRes] = await Promise.all([
        sb.from('rooms').select('*').eq('id', roomId).maybeSingle(),
        sb.from('players').select('*').eq('room_id', roomId).order('created_at', { ascending: true }),
        sb.from('submissions').select('*').eq('room_id', roomId).order('created_at', { ascending: true }),
      ]);
      if (cancelled) return;
      if (roomRes.error || playersRes.error || submissionsRes.error) {
        setState((s) => ({
          ...s,
          loading: false,
          error:
            roomRes.error?.message ??
            playersRes.error?.message ??
            submissionsRes.error?.message ??
            'unknown',
        }));
        return;
      }
      setState({
        room: roomRes.data as RoomRow | null,
        players: (playersRes.data ?? []) as PlayerRow[],
        submissions: (submissionsRes.data ?? []) as SubmissionRow[],
        loading: false,
        error: null,
      });
    })();

    const roomCh = sb
      .channel(roomChannel(roomId))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          setState((s) => {
            const row = (payload.new ?? payload.old) as RoomRow | null;
            if (payload.eventType === 'DELETE') return { ...s, room: null };
            return { ...s, room: row };
          });
        },
      )
      .subscribe();

    const playersCh = sb
      .channel(playersChannel(roomId))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        (payload) => {
          setState((s) => {
            const list = [...s.players];
            if (payload.eventType === 'INSERT') {
              list.push(payload.new as PlayerRow);
            } else if (payload.eventType === 'UPDATE') {
              const idx = list.findIndex((p) => p.id === (payload.new as PlayerRow).id);
              if (idx >= 0) list[idx] = payload.new as PlayerRow;
            } else if (payload.eventType === 'DELETE') {
              const id = (payload.old as PlayerRow).id;
              return { ...s, players: list.filter((p) => p.id !== id) };
            }
            list.sort((a, b) => a.created_at.localeCompare(b.created_at));
            return { ...s, players: list };
          });
        },
      )
      .subscribe();

    const submissionsCh = sb
      .channel(submissionsChannel(roomId))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'submissions', filter: `room_id=eq.${roomId}` },
        (payload) => {
          setState((s) => {
            const list = [...s.submissions];
            if (payload.eventType === 'INSERT') {
              list.push(payload.new as SubmissionRow);
            } else if (payload.eventType === 'UPDATE') {
              const idx = list.findIndex((r) => r.id === (payload.new as SubmissionRow).id);
              if (idx >= 0) list[idx] = payload.new as SubmissionRow;
            } else if (payload.eventType === 'DELETE') {
              const id = (payload.old as SubmissionRow).id;
              return { ...s, submissions: list.filter((r) => r.id !== id) };
            }
            list.sort((a, b) => a.created_at.localeCompare(b.created_at));
            return { ...s, submissions: list };
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      sb.removeChannel(roomCh);
      sb.removeChannel(playersCh);
      sb.removeChannel(submissionsCh);
    };
  }, [roomId]);

  return state;
}
