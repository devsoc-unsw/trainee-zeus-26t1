"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLobby } from "@/lib/socket/useLobby";
import { useRound } from "@/lib/socket/useRound";
import { getSession } from "@/lib/socket/lobby";
import { syncGame } from "@/lib/socket/round";
import { clearDraft, clearSession } from "@/lib/socket/session";

/**
 * Top-level navigator. Mounted once in app/layout.jsx. Subscribes to
 * useLobby() + useRound() and pushes the player's route when state
 * transitions across phases.
 *
 * Routing rule (see docs/superpowers/specs/2026-05-17-socket-bugfixes-
 * and-game-router-design.md):
 *   - no roomCode             → no auto-push (let the wizard own /)
 *   - status reveal/over      → /reveal
 *   - status active + code/1  → /editor
 *   - status active + describe→ /describe
 *   - status active + code/>1 → /reimplement
 *   - otherwise (idle/lobby)  → /waiting-room
 *
 * Guard rails:
 *   - pathname === "/"        → no push (don't yank user off the home wizard)
 *   - pathname === target     → no push (don't duplicate-navigate)
 */
export default function GameRouter() {
  const router = useRouter();
  const pathname = usePathname();
  const { roomCode } = useLobby();
  const { status, roundType, roundNum } = useRound();

  // One-shot reconnect on mount: if storage has a session, reattach via
  // game:sync. On failure (room gone, server restarted), clear storage and
  // let the routing effect below land the user on / naturally.
  const syncedRef = useRef(false);
  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;
    const persisted = getSession();
    if (!persisted.roomId || !persisted.playerId) return;
    syncGame(persisted.roomId, persisted.playerId).catch((err) => {
      console.warn("[GameRouter] sync failed; clearing session:", err);
      clearSession();
      clearDraft();
    });
  }, []);

  const target = useMemo(() => {
    if (!roomCode) return "/";
    if (status === "reveal" || status === "over") return "/reveal";
    if (status === "active") {
      if (roundType === "describe") return "/describe";
      if (roundType === "code") {
        return roundNum === 1 ? "/editor" : "/reimplement";
      }
    }
    return "/waiting-room";
  }, [roomCode, status, roundType, roundNum]);

  useEffect(() => {
    if (pathname === "/") return;
    if (pathname === target) return;
    router.push(target);
  }, [pathname, target, router]);

  return null;
}
