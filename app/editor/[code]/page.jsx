"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Window from "@/components/window/Window";
import CodeEditor from "@/components/game/CodeEditor";
import LanguagePicker from "@/components/game/LanguagePicker";
import GameShell from "@/components/game/GameShell";
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
    case "describing":      return `/describe/${code}`;
    case "reimplementing":  return `/reimplement/${code}`;
    case "reveal":          return `/reveal/${code}`;
    default:                return null;
  }
}

const FALLBACK_PROMPT = "Waiting for prompt…";
const FALLBACK_STARTER = "# write your solution here\n";

export default function EditorPage() {
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
  const round = room?.current_round ?? 1;
  const seatIndex = me?.seatIndex;

  const myChain = (typeof seatIndex === "number" && playerCount > 0)
    ? chainForPlayer(seatIndex, round, playerCount)
    : null;
  const seedRow = myChain != null
    ? submissions.find((s) => s.round_num === round - 1 && s.chain_index === myChain)
    : null;
  const promptText = seedRow?.content ?? FALLBACK_PROMPT;

  const hasSubmitted = me?.playerId
    ? submissions.some((s) => s.round_num === round && s.author_id === me.playerId)
    : false;
  const submittedCount = submissions.filter((s) => s.round_num === round).length;

  const [language] = useState("python");
  const [editorValue, setEditorValue] = useState(FALLBACK_STARTER);

  const handleSubmit = async () => {
    if (!code) return;
    try {
      const res = await fetch(`/api/rooms/${code}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: editorValue, language }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Submit failed: ${err.error?.message ?? res.status}`);
      }
    } catch (err) {
      console.error("[editor] submit failed:", err);
    }
  };

  // Map nextjs_merge's PlayerRow array onto the {name, you, status, statusText}
  // shape that GameShell's PlayerRail expects.
  const shellPlayers = players.map((p) => {
    const submittedThis = submissions.some((s) => s.round_num === round && s.author_id === p.id);
    const isYou = me?.playerId === p.id;
    return {
      name: p.name,
      you: isYou,
      status: submittedThis ? "submitted" : (isYou ? "active" : "waiting"),
      statusText: submittedThis ? "Submitted" : (isYou ? "Your turn" : "Writing…"),
    };
  });

  // Disable submit until the player writes more than a comment line.
  const meaningful = editorValue
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#") && !l.trim().startsWith("//"))
    .join("\n")
    .trim().length > 6;

  if (loading || !room) return <div className={styles.stage}>Loading…</div>;

  return (
    <Window
      title={`Code Telephone — Round ${round}`}
      subtitle="Write the function"
      icon={<CTLogoMark size={14} />}
      width={1280}
      height={720}
      centered
      noPadding
      flush
    >
      <GameShell
        phaseIdx={0}
        players={shellPlayers}
        seconds={null}
        readyCount={submittedCount}
        totalPlayers={playerCount}
        screenLabel="write code that matches the prompt"
        submitDisabled={!meaningful || hasSubmitted}
        submitLabel={hasSubmitted ? "Waiting…" : "Submit →"}
        onSubmit={handleSubmit}
        tip="Clean naming carries meaning further than clever tricks. The AI judge weighs intent, not syntax."
      >
        {error && <div role="alert">Realtime error: {error}</div>}
        <div className={styles.write}>
          <div className={styles.seedBar}>
            <div className={styles.seedLeft}>
              <span className={styles.seedTag}>YOUR PROMPT</span>
              <h3 className={styles.seedTitle}>{promptText}</h3>
              <p className={styles.seedSub}>
                Write a function that matches the prompt above. The next player will
                see only your code — make it readable.
              </p>
            </div>
            <div className={styles.seedRight}>
              <LanguagePicker
                value={language}
                disabled
                name="editor-language"
              />
            </div>
          </div>
          <div className={styles.editorWrap}>
            <CodeEditor
              value={editorValue}
              onChange={setEditorValue}
              language={language}
              fileName="solution"
            />
          </div>
        </div>
      </GameShell>
    </Window>
  );
}
