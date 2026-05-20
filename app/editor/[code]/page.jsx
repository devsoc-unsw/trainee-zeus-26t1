"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Window from "@/components/window/Window";
import CodeEditor from "@/components/game/CodeEditor";
import LanguagePicker from "@/components/game/LanguagePicker";
import Button from "@/components/input/Button";
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

  const [language] = useState("python");
  const [editorValue, setEditorValue] = useState(FALLBACK_STARTER);

  const submittedCount = submissions.filter((s) => s.round_num === round).length;

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

  if (loading || !room) {
    return <div className={styles.stage}>Loading…</div>;
  }

  return (
    <div className={styles.stage}>
      <Window
        title={`Code Telephone — Round ${round} — Write Phase`}
        width={920}
        menubar={
          <div className={styles.menu}>
            <span>File</span><span>Edit</span><span>View</span><span>Help</span>
          </div>
        }
      >
        <div className={styles.body}>
          <header className={styles.phaseHeader}>
            <div>
              <div className={styles.phaseLabel}>Phase 1 of {(room.round_count ?? 3)}</div>
              <div className={styles.phaseTitle}>Write the function</div>
            </div>
            <div className={styles.timer}>
              <span className={styles.timerLabel}>Time left</span>
              <span className={styles.timerValue}>—:—</span>
            </div>
          </header>

          {error && <div role="alert">Realtime error: {error}</div>}

          <section className={styles.prompt}>
            <div className={styles.promptLabel}>Prompt</div>
            <p className={styles.promptText}>{promptText}</p>
          </section>

          <div className={styles.editorWrap}>
            <LanguagePicker value={language} disabled name="editor-language" />
            <CodeEditor
              value={editorValue}
              onChange={setEditorValue}
              language={language}
              fileName="solution"
              height={380}
            />
          </div>

          <footer className={styles.actions}>
            <span className={styles.flex} />
            <span className={styles.readyCount}>{submittedCount} of {playerCount} submitted</span>
            <Button variant="primary" disabled={hasSubmitted} onClick={handleSubmit}>
              {hasSubmitted ? "Waiting…" : "Submit"}
            </Button>
          </footer>
        </div>
      </Window>
    </div>
  );
}
