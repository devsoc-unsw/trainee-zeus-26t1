"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Window from "@/components/window/Window";
import GlassPanel from "@/components/glass/GlassPanel";
import Button from "@/components/input/Button";
import Radio from "@/components/input/Radio";
import Checkbox from "@/components/input/Checkbox";
import PlayerAvatar from "@/components/game/PlayerAvatar";
import Pill from "@/components/game/Pill";
import { CTLogoMark } from "@/components/brand/CTLogo";
import { useRoom } from "@/lib/realtime/useRoom";
import styles from "./page.module.css";

const MAX_PLAYERS = 6;

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
    return () => {
      cancelled = true;
    };
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

  // Cosmetic game-settings state (not yet backend-wired; redesign UX shell).
  const [timing, setTiming] = useState("normal");
  const [bots, setBots] = useState(true);
  const [spectators, setSpectators] = useState(false);

  useEffect(() => {
    if (notFound) router.replace("/");
  }, [notFound, router]);

  // Phase navigation: when room transitions out of lobby, every client follows.
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
      // Phase flip arrives via Realtime; the useEffect above navigates.
    } catch (err) {
      console.error("[lobby] start failed:", err);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(code);
    } catch {
      /* clipboard denied — silent */
    }
  };

  const displayRoomCode = code || "—";
  const emptySlots = Math.max(0, MAX_PLAYERS - players.length);
  const totalSeats = players.length + emptySlots;

  const startDisabled = !me?.isHost || players.length < 2;
  const startHint = loading
    ? "Connecting…"
    : me?.isHost
      ? (players.length < 2 ? "Need at least 2 players to start." : "All set — press Start when ready.")
      : "Host can start when all players are ready.";

  return (
    <Window
      title={`Room ${displayRoomCode}`}
      subtitle={`${players.length} of ${MAX_PLAYERS} seats`}
      icon={<CTLogoMark size={14} />}
      width={720}
      height={580}
      centered
      onClose={handleLeave}
      toolbar={
        <div className={styles.tools}>
          <Pill tone="accent">Public Room</Pill>
          <span className={styles.toolsCodeWrap}>
            Code
            <code className={styles.code}>{displayRoomCode}</code>
            <button
              type="button"
              className={styles.copyBtn}
              onClick={handleCopy}
              aria-label="Copy room code"
              title="Copy room code"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
                <rect x="2.5" y="2.5" width="6" height="6" rx="1" fill="none" stroke="currentColor" />
                <rect x="0.5" y="0.5" width="6" height="6" rx="1" fill="white" stroke="currentColor" />
              </svg>
            </button>
          </span>
          <span className={styles.toolsStatus}>
            {loading ? "Connecting…" : `${players.length} of ${totalSeats} joined`}
          </span>
        </div>
      }
    >
      <div className={styles.lobby}>
        <section className={styles.col} aria-labelledby="lobby-players">
          <h3 id="lobby-players" className={styles.h}>
            Players · {players.length} of {totalSeats}
          </h3>
          <GlassPanel className={styles.playerList}>
            <ul className={styles.playerUl}>
              {players.map((p) => (
                <li
                  key={p.id}
                  className={`${styles.playerRow} ${room?.host_id === p.id ? styles.isHost : ""}`}
                >
                  <PlayerAvatar name={p.name} size={32} />
                  <div className={styles.playerMain}>
                    <div className={styles.playerName}>
                      {p.name}
                      {room?.host_id === p.id && <span className={styles.badge}>host</span>}
                    </div>
                    <div className={styles.playerMeta}>Ready to play</div>
                  </div>
                  <Pill tone="done">
                    <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
                      <path
                        d="M1 4.5L3.5 7L8 2"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Joined
                  </Pill>
                </li>
              ))}
              {Array.from({ length: emptySlots }).map((_, i) => (
                <li key={`empty-${i}`} className={`${styles.playerRow} ${styles.empty}`}>
                  <span className={styles.emptyAvatar} aria-hidden="true" />
                  <div className={styles.playerMain}>
                    <div className={styles.playerName}>Empty seat</div>
                    <div className={styles.playerMeta}>Waiting for a player to join</div>
                  </div>
                  <Pill tone="ghost">Open</Pill>
                </li>
              ))}
            </ul>
          </GlassPanel>
          {error && (
            <p className={styles.lobbyError} role="alert">
              Lobby error: {error}
            </p>
          )}
        </section>

        <section className={styles.col} aria-labelledby="lobby-settings">
          <h3 id="lobby-settings" className={styles.h}>
            Game settings
          </h3>
          <GlassPanel className={styles.settings}>
            <div className={styles.setting}>
              <div className={styles.settingLabel}>Round timing</div>
              <div className={styles.radioRow}>
                {[
                  { value: "fast", label: "90s · sprint" },
                  { value: "normal", label: "3 min · classic" },
                  { value: "long", label: "5 min · relaxed" },
                ].map((opt) => (
                  <Radio
                    key={opt.value}
                    name="time"
                    value={opt.value}
                    checked={timing === opt.value}
                    label={opt.label}
                    onChange={() => setTiming(opt.value)}
                  />
                ))}
              </div>
            </div>

            <div className={styles.setting}>
              <div className={styles.settingLabel}>Languages</div>
              <p className={styles.settingNote}>
                Each player picks their own language during Write and Reimplement. The AI
                judge normalises across them.
              </p>
            </div>

            <div className={styles.setting}>
              <Checkbox
                checked={bots}
                onChange={setBots}
                label="Fill empty seats with bots if a player leaves"
              />
            </div>
            <div className={styles.setting}>
              <Checkbox
                checked={spectators}
                onChange={setSpectators}
                label="Allow spectators (read-only viewers)"
              />
            </div>
          </GlassPanel>

          <div className={styles.actions}>
            <Button variant="ghost" onClick={handleLeave}>
              Leave room
            </Button>
            <Button variant="primary" disabled={startDisabled} onClick={handleStart}>
              Start game →
            </Button>
          </div>
          <p className={styles.hint}>{startHint}</p>
        </section>
      </div>
    </Window>
  );
}
