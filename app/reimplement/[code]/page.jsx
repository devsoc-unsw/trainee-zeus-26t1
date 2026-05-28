"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Window from "@/components/window/Window";
import CodeEditor from "@/components/game/CodeEditor";
import Notepad from "@/components/notepad/Notepad";
import GameShell from "@/components/game/GameShell";
import PlayerAvatar from "@/components/game/PlayerAvatar";
import Pill from "@/components/game/Pill";
import { CTLogoMark } from "@/components/brand/CTLogo";
import { useRoom } from "@/lib/realtime/useRoom";
import { usePhaseTimer } from "@/lib/game/usePhaseTimer";
import { chainForPlayer } from "@/lib/game/seating";
import { loadDraft, saveDraft, clearDraft } from "@/lib/storage/drafts";
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
    case "lobby":      return `/waiting-room/${code}`;
    case "writing":    return `/editor/${code}`;
    case "describing": return `/describe/${code}`;
    case "reveal":     return `/reveal/${code}`;
    default:           return null;
  }
}

const FALLBACK_DESCRIPTION = "Waiting for the previous player's description…";

export default function ReimplementPage() {
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
  const round = room?.current_round ?? 3;
  const seatIndex = me?.seatIndex;
  const myChain = (typeof seatIndex === "number" && playerCount > 0)
    ? chainForPlayer(seatIndex, round, playerCount)
    : null;
  const seedRow = myChain != null
    ? submissions.find((s) => s.round_num === round - 1 && s.chain_index === myChain)
    : null;
  const receivedDescription = seedRow?.content ?? FALLBACK_DESCRIPTION;
  const fromAuthor = seedRow?.author_id
    ? players.find((p) => p.id === seedRow.author_id)
    : null;

  const hasSubmitted = me?.playerId
    ? submissions.some((s) => s.round_num === round && s.author_id === me.playerId)
    : false;
  const submittedCount = submissions.filter((s) => s.round_num === round).length;

  // Python-only for now (DB constraint sql/021).
  const language = "python";
  const [reconstructedCode, setReconstructedCode] = useState("");

  // Draft autosave (localStorage) — see editor page for rationale.
  const draftLoadedRef = useRef(false);
  useEffect(() => {
    if (draftLoadedRef.current) return;
    if (!room || !code) return;
    draftLoadedRef.current = true;
    const draft = loadDraft({ code, round, phase: "reimplementing" });
    if (draft?.content) setReconstructedCode(draft.content);
  }, [room?.id, code, round]);
  useEffect(() => {
    if (!draftLoadedRef.current) return;
    if (!code || !room) return;
    if (hasSubmitted) return;
    const t = setTimeout(() => {
      saveDraft({
        code, round, phase: "reimplementing",
        content: reconstructedCode, language,
      });
    }, 600);
    return () => clearTimeout(t);
  }, [reconstructedCode, language, code, round, hasSubmitted, room?.id]);
  useEffect(() => {
    if (!hasSubmitted || !code) return;
    clearDraft({ code, round, phase: "reimplementing" });
  }, [hasSubmitted, code, round]);

  const handleSubmit = async () => {
    if (!code) return;
    try {
      const res = await fetch(`/api/rooms/${code}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: reconstructedCode, language }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Submit failed: ${err.error?.message ?? res.status}`);
      }
    } catch (err) {
      console.error("[reimplement] submit failed:", err);
    }
  };

  const secondsLeft = usePhaseTimer(
    room?.phase_started_at,
    room?.phase_duration_seconds,
  );
  const autoSubmittedRef = useRef(false);
  useEffect(() => {
    if (autoSubmittedRef.current) return;
    if (secondsLeft !== 0) return;
    if (hasSubmitted) return;
    if (!me?.playerId) return;
    autoSubmittedRef.current = true;
    handleSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, hasSubmitted, me?.playerId]);

  const handleForceAdvance = async () => {
    if (!code) return;
    try {
      const res = await fetch(`/api/rooms/${code}/force-advance`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Skip phase failed: ${err.error?.message ?? res.status}`);
      }
    } catch (err) {
      console.error("[reimplement] force-advance failed:", err);
    }
  };

  const handleEndRoom = async () => {
    if (!me?.isHost || !code) return;
    if (typeof window !== "undefined"
        && !window.confirm("End this room for everyone? All players will be sent home.")) return;
    try {
      const res = await fetch(`/api/rooms/${code}/terminate`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`End room failed: ${err.error?.message ?? res.status}`);
        return;
      }
    } catch (err) {
      console.error("[reimplement] terminate failed:", err);
    } finally {
      router.replace("/");
    }
  };

  const handleKick = async (targetId, targetName) => {
    if (typeof window !== "undefined"
        && !window.confirm(`Kick ${targetName} from the game? Their remaining submissions will be filled in as empty.`)) return;
    try {
      const res = await fetch(`/api/rooms/${code}/kick`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId: targetId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Kick failed: ${err.error?.message ?? res.status}`);
      }
    } catch (err) {
      console.error("[reimplement] kick failed:", err);
    }
  };

  useEffect(() => {
    if (loading || !me?.playerId || players.length === 0) return;
    const self = players.find((p) => p.id === me.playerId);
    if (!self || self.is_active === false) router.replace("/");
  }, [players, me?.playerId, loading, router]);

  const shellPlayers = players.map((p) => {
    const submittedThis = submissions.some((s) => s.round_num === round && s.author_id === p.id);
    const isYou = me?.playerId === p.id;
    const isInactive = p.is_active === false;
    const canKick = !!me?.isHost && !isYou && !p.is_host && !isInactive;
    return {
      id: p.id,
      name: p.name,
      you: isYou,
      isInactive,
      status: isInactive ? "danger" : submittedThis ? "submitted" : (isYou ? "active" : "waiting"),
      statusText: isInactive ? "Kicked" : submittedThis ? "Submitted" : (isYou ? "Your turn" : "Writing…"),
      onKick: canKick ? () => handleKick(p.id, p.name) : undefined,
    };
  });

  if (loading || !room) return <div className={styles.stage}>Loading…</div>;

  return (
    <Window
      title={`Code Telephone — Round ${round}`}
      subtitle="Write the function from the description"
      icon={<CTLogoMark size={14} />}
      width={1280}
      height={720}
      centered
      noPadding
      flush
    >
      <GameShell
        phaseIdx={2}
        players={shellPlayers}
        seconds={secondsLeft}
        readyCount={submittedCount}
        totalPlayers={playerCount}
        screenLabel="reimplement from the description"
        submitDisabled={reconstructedCode.trim().length < 4 || hasSubmitted}
        submitLabel={hasSubmitted ? "Waiting…" : "Submit code →"}
        onSubmit={handleSubmit}
        canForceAdvance={!!me?.isHost}
        onForceAdvance={handleForceAdvance}
        canEndRoom={!!me?.isHost}
        onEndRoom={handleEndRoom}
        tip="Write idiomatic code — clarity is what carries through the chain."
      >
        {error && <div role="alert">Realtime error: {error}</div>}
        <div className={styles.split}>
          <section className={styles.pane}>
            <header className={styles.paneHead}>
              <span className={styles.tag}>FROM</span>
              {fromAuthor && <PlayerAvatar name={fromAuthor.name} size={20} />}
              <span className={styles.name}>
                {fromAuthor ? `${fromAuthor.name}'s description` : "previous player's description"}
              </span>
              <Pill tone="ghost">read-only</Pill>
            </header>
            <div className={styles.paneBody}>
              <Notepad fileName="Description" value={receivedDescription} readOnly />
            </div>
          </section>

          <section className={styles.pane}>
            <header className={styles.paneHead}>
              <span className={`${styles.tag} ${styles.tagYou}`}>YOU</span>
              <PlayerAvatar name={me ? "you" : ""} size={20} />
              <span className={styles.name}>Your reconstruction</span>
              <Pill tone="accent">your turn</Pill>
            </header>
            <div className={styles.paneBody}>
              <CodeEditor
                value={reconstructedCode}
                onChange={setReconstructedCode}
                language={language}
                fileName="solution"
              />
            </div>
          </section>
        </div>
      </GameShell>
    </Window>
  );
}
