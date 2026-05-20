"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Window from "@/components/window/Window";
import GlassPanel from "@/components/glass/GlassPanel";
import Button from "@/components/input/Button";
import Radio from "@/components/input/Radio";
import PlayerAvatar from "@/components/game/PlayerAvatar";
import { useRoom } from "@/lib/realtime/useRoom";
import styles from "./page.module.css";

const MAX_PLAYERS = 6;
const languages = [
  { id: "python",     label: "Python" },
  { id: "javascript", label: "JavaScript" },
  { id: "java",       label: "Java" },
];
const SELECTED_LANG = "python";

/**
 * The URL gives us the room `code`, but useRoom needs the room uuid.
 * Look it up via the anon browser client (RLS allows SELECT).
 */
function useRoomIdFromCode(code) {
  const [roomId, setRoomId] = useState(null);
  const [notFound, setNotFound] = useState(false);
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      const { getBrowserClient } = await import("@/lib/supabase/browser");
      const sb = getBrowserClient();
      const { data, error } = await sb
        .from("rooms")
        .select("id")
        .eq("code", code)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
        return;
      }
      setRoomId(data.id);
    })();
    return () => { cancelled = true; };
  }, [code]);
  return { roomId, notFound };
}

function useMe(code) {
  const [me, setMe] = useState(null);
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/rooms/${code}/me`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setMe(data);
      } catch (err) {
        console.error("[lobby] /me fetch failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [code]);
  return me;
}

function routeForPhase(phase, code) {
  switch (phase) {
    case "writing":         return `/editor/${code}`;
    case "describing":      return `/describe/${code}`;
    case "reimplementing":  return `/reimplement/${code}`;
    case "reveal":          return `/reveal/${code}`;
    default:                return null;
  }
}

export default function WaitingRoom() {
  const params = useParams();
  const router = useRouter();
  const code = (params?.code || "").toString().toUpperCase();

  const { roomId, notFound } = useRoomIdFromCode(code);
  const { room, players, loading, error } = useRoom(roomId);
  const me = useMe(code);

  // If the room code doesn't exist (or was just deleted), bounce home.
  useEffect(() => {
    if (notFound) router.replace("/");
  }, [notFound, router]);

  // Phase navigation: when the room transitions out of lobby, every
  // client follows.
  useEffect(() => {
    if (!room || !code) return;
    const target = routeForPhase(room.phase, code);
    if (target) router.replace(target);
  }, [room?.phase, code, router]);

  const handleLeave = async () => {
    try {
      await fetch(`/api/rooms/${code}/leave`, { method: "POST" });
    } catch (err) {
      console.error("[lobby] leave failed:", err);
    } finally {
      router.replace("/");
    }
  };

  const handleStart = async () => {
    try {
      const res = await fetch(`/api/rooms/${code}/start`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Start failed: ${err.error?.message ?? res.status}`);
      }
      // Success: phase will flip via Realtime; the useEffect above navigates.
    } catch (err) {
      console.error("[lobby] start failed:", err);
    }
  };

  const displayRoomCode = code || "—";
  const emptySlots = Math.max(0, MAX_PLAYERS - players.length);

  const startDisabled = !me?.isHost || players.length < 2;
  const hostNote = loading
    ? "Loading…"
    : me?.isHost
      ? (players.length < 2 ? "Need at least 2 players to start." : "You're the host — start when ready.")
      : "Waiting for host to start.";

  return (
    <div className={styles.lobbyStage}>
      <Window
        title={`Code Telephone — Waiting Room — ${displayRoomCode}`}
        width={580}
        menubar={
          <div className={styles.menuItems}>
            <span>File</span>
            <span>Edit</span>
            <span>View</span>
            <span>Help</span>
          </div>
        }
      >
        <div className={styles.lobbyBody}>
          <header className={styles.header}>
            <div className={styles.roomLabel}>Room Code</div>
            <div className={styles.roomCode}>{displayRoomCode}</div>
          </header>

          {error && (
            <div role="alert">Lobby error: {error}</div>
          )}

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>
                Players <span className={styles.muted}>({players.length}/{MAX_PLAYERS})</span>
              </h2>
            </div>
            <GlassPanel className={styles.playerList}>
              <ul className={styles.playerUl}>
                {players.map((p) => (
                  <li key={p.id} className={styles.playerRow}>
                    <PlayerAvatar initials={p.name.slice(0, 2).toUpperCase()} seed={p.name} />
                    <span className={styles.playerName}>{p.name}</span>
                    {room?.host_id === p.id && <span className={styles.hostTag}>host</span>}
                  </li>
                ))}
                {Array.from({ length: emptySlots }).map((_, i) => (
                  <li key={`empty-${i}`} className={`${styles.playerRow} ${styles.empty}`}>
                    <span className={styles.emptyAvatar} />
                    <span className={styles.emptyText}>Empty slot</span>
                  </li>
                ))}
              </ul>
            </GlassPanel>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Language</h2>
            </div>
            <div className={styles.langRow}>
              {languages.map((l) => (
                <Radio
                  key={l.id}
                  name="language"
                  value={l.id}
                  checked={l.id === SELECTED_LANG}
                  label={l.label}
                />
              ))}
            </div>
          </section>

          <footer className={styles.actions}>
            <Button onClick={handleLeave}>Leave</Button>
            <span className={styles.flex} />
            <span className={styles.hostNote}>{hostNote}</span>
            <Button variant="primary" disabled={startDisabled} onClick={handleStart}>
              Start Game
            </Button>
          </footer>
        </div>
      </Window>
    </div>
  );
}
