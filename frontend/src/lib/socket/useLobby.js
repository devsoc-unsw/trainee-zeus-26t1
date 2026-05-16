// frontend/src/lib/socket/useLobby.js
//
// React hook exposing reactive lobby state + bound actions. Subscribes
// to the singleton client.js, listens for `room:updated`, `room:error`,
// and `game:started`.

"use client";

import { useEffect, useState } from "react";
import { on } from "./client";
import { getSession, leaveRoom, startGame, subscribeLobby } from "./lobby";

function mapPlayers(players, hostId) {
  if (!Array.isArray(players)) return [];
  return players.map((p) => ({
    id: p.id,
    name: p.name,
    ready: false,
    host: typeof p.isHost === "boolean" ? p.isHost : p.id === hostId,
  }));
}

/**
 * Subscribe to lobby state. The state shape mirrors what the waiting
 * room renders. `isHost` is derived: `playerId === hostId`.
 *
 * @returns {{
 *   roomCode: string | null,
 *   roomId:   string | null,
 *   playerId: string | null,
 *   hostId:   string | null,
 *   players:  Array<{id: string, name: string, ready: boolean, host: boolean}>,
 *   error:    {code: string, message: string} | null,
 *   isHost:   boolean,
 *   gameStarted: boolean,
 *   leave:    () => Promise<void>,
 *   start:    () => Promise<void>,
 * }}
 */
export function useLobby() {
  const [snapshot, setSnapshot] = useState(() => getSession());
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsub = subscribeLobby((next) => setSnapshot({ ...next }));
    const offErr = on("room:error", (data) => {
      setError({
        code: data?.code ?? "ROOM_ERROR",
        message: data?.message ?? "Unknown error",
      });
    });
    return () => {
      unsub();
      offErr();
    };
  }, []);

  const isHost =
    !!snapshot.playerId && snapshot.playerId === snapshot.hostId;

  return {
    roomCode: snapshot.code ?? null,
    roomId: snapshot.roomId ?? null,
    playerId: snapshot.playerId ?? null,
    hostId: snapshot.hostId ?? null,
    players: mapPlayers(snapshot.players, snapshot.hostId),
    error,
    isHost,
    gameStarted: !!snapshot.gameStarted,
    leave: leaveRoom,
    start: startGame,
  };
}
