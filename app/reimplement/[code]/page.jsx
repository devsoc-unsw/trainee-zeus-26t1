"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Notepad from "@/components/notepad/Notepad";
import Window from "@/components/window/Window";
import CodeEditor from "@/components/game/CodeEditor";
import LanguagePicker from "@/components/game/LanguagePicker";
import PhaseHUD from "@/components/game/PhaseHUD";
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

  const hasSubmitted = me?.playerId
    ? submissions.some((s) => s.round_num === round && s.author_id === me.playerId)
    : false;
  const submittedCount = submissions.filter((s) => s.round_num === round).length;

  const [language] = useState("python");
  const [reconstructedCode, setReconstructedCode] = useState("");

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

  if (loading || !room) return <div className={styles.stage}>Loading…</div>;

  const solutionExt = language === "javascript" ? "js" : language === "java" ? "java" : "py";

  return (
    <div className={styles.stage}>
      <PhaseHUD
        phaseIndex={3}
        phaseTotal={room.round_count ?? 3}
        title="Re-implement the function"
        timer="—:—"
        readyCount={`${submittedCount} of ${playerCount} submitted`}
        submitLabel={hasSubmitted ? "Waiting…" : "Submit code"}
        onSubmit={hasSubmitted ? undefined : handleSubmit}
      />

      {error && <div role="alert">Realtime error: {error}</div>}

      <div className={styles.descWindow}>
        <Notepad
          fileName="received"
          value={receivedDescription}
          readOnly
          x={56}
          y={88}
          width={440}
          height={460}
        />
      </div>

      <div className={styles.codeWindow}>
        <Window
          title={`solution.${solutionExt} — Code Telephone`}
          x={520}
          y={88}
          width={580}
          height={460}
        >
          <LanguagePicker value={language} disabled name="reimplement-language" />
          <CodeEditor
            value={reconstructedCode}
            onChange={setReconstructedCode}
            language={language}
            fileName="solution"
            height={428}
            showStatusBar
          />
        </Window>
      </div>
    </div>
  );
}
