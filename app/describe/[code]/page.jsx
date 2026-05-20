"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Window from "@/components/window/Window";
import CodeEditor from "@/components/game/CodeEditor";
import Notepad from "@/components/notepad/Notepad";
import GameShell from "@/components/game/GameShell";
import PlayerAvatar from "@/components/game/PlayerAvatar";
import Pill from "@/components/game/Pill";
import { CTLogoMark } from "@/components/brand/CTLogo";
import { useRoom } from "@/lib/realtime/useRoom";
import { chainForPlayer } from "@/lib/game/seating";
import styles from "./page.module.css";

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
        .from("rooms").select("id").eq("code", code).maybeSingle();
      if (cancelled) return;
      if (error || !data) { setNotFound(true); return; }
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
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [code]);
  return me;
}

function routeForPhase(phase, code) {
  switch (phase) {
    case "lobby":           return `/waiting-room/${code}`;
    case "writing":         return `/editor/${code}`;
    case "reimplementing":  return `/reimplement/${code}`;
    case "reveal":          return `/reveal/${code}`;
    default:                return null;
  }
}

const FALLBACK_CODE = "# waiting for the previous player's code…\n";

export default function DescribePage() {
  const params = useParams();
  const router = useRouter();
  const code = (params?.code || "").toString().toUpperCase();

  const { roomId, notFound } = useRoomIdFromCode(code);
  const { room, players, submissions, loading, error } = useRoom(roomId);
  const me = useMe(code);

  useEffect(() => {
    if (!room || !code) return;
    const target = routeForPhase(room.phase, code);
    if (target) router.replace(target);
  }, [room?.phase, code, router]);

  useEffect(() => { if (notFound) router.replace("/"); }, [notFound, router]);

  const playerCount = players.length;
  const round = room?.current_round ?? 2;
  const seatIndex = me?.seatIndex;
  const myChain = (typeof seatIndex === "number" && playerCount > 0)
    ? chainForPlayer(seatIndex, round, playerCount)
    : null;
  const seedRow = myChain != null
    ? submissions.find((s) => s.round_num === round - 1 && s.chain_index === myChain)
    : null;
  const receivedCode = seedRow?.content ?? FALLBACK_CODE;
  const language = seedRow?.language ?? "python";
  const fromAuthor = seedRow?.author_id
    ? players.find((p) => p.id === seedRow.author_id)
    : null;

  const hasSubmitted = me?.playerId
    ? submissions.some((s) => s.round_num === round && s.author_id === me.playerId)
    : false;
  const submittedCount = submissions.filter((s) => s.round_num === round).length;

  const [description, setDescription] = useState("");

  const handleSubmit = async () => {
    if (!code) return;
    try {
      const res = await fetch(`/api/rooms/${code}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: description }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Submit failed: ${err.error?.message ?? res.status}`);
      }
    } catch (err) {
      console.error("[describe] submit failed:", err);
    }
  };

  const shellPlayers = players.map((p) => {
    const submittedThis = submissions.some((s) => s.round_num === round && s.author_id === p.id);
    const isYou = me?.playerId === p.id;
    return {
      name: p.name,
      you: isYou,
      status: submittedThis ? "submitted" : (isYou ? "active" : "waiting"),
      statusText: submittedThis ? "Submitted" : (isYou ? "Your turn" : "Describing…"),
    };
  });

  if (loading || !room) return <div className={styles.stage}>Loading…</div>;

  return (
    <Window
      title={`Code Telephone — Round ${round}`}
      subtitle="Describe the code in plain English"
      icon={<CTLogoMark size={14} />}
      width={1280}
      height={720}
      centered
      noPadding
      flush
    >
      <GameShell
        phaseIdx={1}
        players={shellPlayers}
        seconds={null}
        readyCount={submittedCount}
        totalPlayers={playerCount}
        screenLabel="describe what it does"
        submitDisabled={description.trim().length < 8 || hasSubmitted}
        submitLabel={hasSubmitted ? "Waiting…" : "Submit description →"}
        onSubmit={handleSubmit}
        tip="Describe behaviour, not syntax. Mention edge cases — they survive the chain."
      >
        {error && <div role="alert">Realtime error: {error}</div>}
        <div className={styles.split}>
          <section className={styles.pane}>
            <header className={styles.paneHead}>
              <span className={styles.tag}>FROM</span>
              {fromAuthor && <PlayerAvatar name={fromAuthor.name} size={20} />}
              <span className={styles.name}>
                {fromAuthor ? `${fromAuthor.name}'s code` : "previous player's code"}
              </span>
              <Pill tone="ghost">read-only</Pill>
            </header>
            <div className={styles.paneBody}>
              <CodeEditor value={receivedCode} language={language} fileName="mystery" readOnly />
            </div>
          </section>

          <section className={styles.pane}>
            <header className={styles.paneHead}>
              <span className={`${styles.tag} ${styles.tagYou}`}>YOU</span>
              <PlayerAvatar name={me ? "you" : ""} size={20} />
              <span className={styles.name}>Your description</span>
              <Pill tone="accent">your turn</Pill>
            </header>
            <div className={styles.paneBody}>
              <Notepad
                fileName="Description"
                value={description}
                onChange={setDescription}
                placeholder="Describe what this function does in plain English…"
              />
            </div>
          </section>
        </div>
      </GameShell>
    </Window>
  );
}
