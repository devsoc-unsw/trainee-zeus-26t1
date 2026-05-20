"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Window from "@/components/window/Window";
import Button from "@/components/input/Button";
import CodeEditor from "@/components/game/CodeEditor";
import PlayerAvatar from "@/components/game/PlayerAvatar";
import Pill from "@/components/game/Pill";
import { CTLogoMark } from "@/components/brand/CTLogo";
import { useRoom } from "@/lib/realtime/useRoom";
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

function roundLabel(roundType) {
  return roundType === "describe" ? "Description" : "Code";
}

/** Group submissions by chain_index, sorted by round_num. */
function chainsFromSubmissions(submissions, players) {
  const playersById = new Map(players.map((p) => [p.id, p]));
  const byChain = new Map();
  for (const sub of submissions) {
    if (!byChain.has(sub.chain_index)) byChain.set(sub.chain_index, []);
    byChain.get(sub.chain_index).push(sub);
  }
  const chains = [];
  for (const [chainIndex, segments] of [...byChain.entries()].sort((a, b) => a[0] - b[0])) {
    segments.sort((a, b) => a.round_num - b.round_num);
    chains.push({
      chainIndex,
      segments: segments.map((s) => ({
        ...s,
        authorName: s.author_id ? (playersById.get(s.author_id)?.name ?? "?") : "Prompt",
      })),
    });
  }
  return chains;
}

function ChainNode({ segment, isLast }) {
  const preview = (segment.content ?? "").split("\n")[0]?.slice(0, 60) ?? "";
  return (
    <>
      <div className={styles.chainNode}>
        <div className={styles.chainNodeHead}>
          <PlayerAvatar name={segment.authorName} size={24} />
          <span className={styles.chainNodeName}>{segment.authorName}</span>
        </div>
        <div className={styles.chainNodeStage}>{roundLabel(segment.round_type)}</div>
        <div className={styles.chainNodePreview}>{preview}</div>
      </div>
      {!isLast && (
        <svg className={styles.chainArrow} width="40" height="20" viewBox="0 0 40 20" aria-hidden="true">
          <path
            d="M0 10 H30 M22 4 L30 10 L22 16"
            stroke="var(--aero-500)"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </>
  );
}

export default function RevealPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params?.code || "").toString().toUpperCase();

  const { roomId, notFound } = useRoomIdFromCode(code);
  const { room, players, submissions, chainScores, loading, error } = useRoom(roomId);
  const me = useMe(code);

  useEffect(() => {
    if (!room || !code) return;
    if (room.phase === "lobby") router.replace(`/waiting-room/${code}`);
  }, [room?.phase, code, router]);

  useEffect(() => { if (notFound) router.replace("/"); }, [notFound, router]);

  // Trigger AI judging once on mount when phase=reveal. Idempotent — the
  // route + judgeRoom skip chains whose status is already done/failed.
  useEffect(() => {
    if (!roomId || !room || room.phase !== "reveal") return;
    let cancelled = false;
    (async () => {
      try {
        await fetch(`/api/judge/${roomId}`, { method: "POST" });
      } catch (err) {
        if (!cancelled) console.warn("[reveal] judge trigger failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [roomId, room?.phase]);

  const chains = chainsFromSubmissions(submissions, players);

  const [viewerChainIndex, setViewerChainIndex] = useState(0);
  useEffect(() => {
    if (typeof me?.seatIndex === "number") setViewerChainIndex(me.seatIndex);
  }, [me?.seatIndex]);

  const chain = chains.find((c) => c.chainIndex === viewerChainIndex) ?? chains[0] ?? null;
  const segments = chain?.segments ?? [];
  const originalSegment = chain?.segments?.[0] ?? null;
  const reconstructedSegment = chain
    ? [...(chain.segments ?? [])].reverse().find((s) => s.round_type === "code") ?? null
    : null;

  const scoreRow = chain ? chainScores.find((s) => s.chain_index === chain.chainIndex) : null;
  const targetScore = scoreRow?.status === "done" ? Math.round(scoreRow.overall_score ?? 0) : null;

  // Animated counter that runs whenever targetScore changes from null → number.
  const [counted, setCounted] = useState(0);
  const [lastTarget, setLastTarget] = useState(targetScore);
  if (targetScore !== lastTarget) {
    setLastTarget(targetScore);
    setCounted(0);
  }
  useEffect(() => {
    if (targetScore == null) return;
    let i = 0;
    const id = setInterval(() => {
      i += 3;
      if (i >= targetScore) {
        i = targetScore;
        clearInterval(id);
      }
      setCounted(i);
    }, 30);
    return () => clearInterval(id);
  }, [targetScore]);

  const handlePlayAgain = async () => {
    if (!code) return;
    try {
      const res = await fetch(`/api/rooms/${code}/reset`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Reset failed: ${err.error?.message ?? res.status}`);
      }
    } catch (err) {
      console.error("[reveal] reset failed:", err);
    }
  };

  if (loading || !room) return <div className={styles.reveal}>Loading…</div>;

  const totalChains = chains.length;

  return (
    <Window
      title={`Code Telephone — Reveal — ${code}`}
      subtitle="Semantic match scored by the AI judge"
      icon={<CTLogoMark size={14} />}
      width={1080}
      height={680}
      centered
    >
      <div className={styles.reveal}>
        <header className={styles.head}>
          <div>
            <h2 className={styles.title}>The chain</h2>
            <p className={styles.sub}>
              Trace how the function moved through the room
              {totalChains > 1 && ` · viewing chain ${chain ? chain.chainIndex + 1 : "?"} of ${totalChains}`}
            </p>
          </div>
          <Pill tone="active">Reveal</Pill>
        </header>

        {error && <div role="alert">Realtime error: {error}</div>}

        {!chain || !originalSegment ? (
          <p>No reveal data yet.</p>
        ) : (
          <>
            <div className={styles.chainRow}>
              {segments.map((seg, i) => (
                <ChainNode
                  key={`seg-${seg.round_num}-${i}`}
                  segment={seg}
                  isLast={i === segments.length - 1}
                />
              ))}
            </div>

            <div className={styles.body}>
              <div className={styles.panes}>
                <div className={styles.pane}>
                  <header className={styles.paneHead}>
                    <span className={styles.paneTag} style={{ background: "#7cb6f5" }}>
                      ORIGINAL
                    </span>
                    <span>{originalSegment.authorName} · {roundLabel(originalSegment.round_type)}</span>
                  </header>
                  <CodeEditor
                    value={originalSegment.content ?? ""}
                    language={originalSegment.language ?? "python"}
                    fileName="original"
                    readOnly
                    showStatusBar={false}
                  />
                </div>
                {reconstructedSegment && (
                  <div className={styles.pane}>
                    <header className={styles.paneHead}>
                      <span className={styles.paneTag} style={{ background: "#c9a4f5" }}>
                        RECONSTRUCTED
                      </span>
                      <span>{reconstructedSegment.authorName} · code</span>
                    </header>
                    <CodeEditor
                      value={reconstructedSegment.content ?? ""}
                      language={reconstructedSegment.language ?? "python"}
                      fileName="reconstructed"
                      readOnly
                      showStatusBar={false}
                    />
                  </div>
                )}
              </div>

              <aside className={styles.scoreCard} aria-label="Round score">
                <div className={styles.scoreBlock}>
                  <div className={styles.scoreLabel}>Semantic match</div>
                  {!scoreRow || scoreRow.status === "pending" ? (
                    <>
                      <div className={styles.scoreNum}>—</div>
                      <p className={styles.scoreNote}>Scoring this chain…</p>
                    </>
                  ) : scoreRow.status === "failed" ? (
                    <>
                      <div className={styles.scoreNum}>—</div>
                      <p className={styles.scoreNote}>
                        Scoring unavailable: {scoreRow.notes ?? "unknown error"}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className={styles.scoreNum}>
                        {counted}
                        <span>%</span>
                      </div>
                      <div
                        className={styles.scoreBar}
                        role="progressbar"
                        aria-valuenow={counted}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div className={styles.scoreBarFill} style={{ width: counted + "%" }} />
                      </div>
                      {scoreRow.notes && (
                        <p className={styles.scoreNote}>{scoreRow.notes}</p>
                      )}
                    </>
                  )}
                </div>
              </aside>
            </div>

            {totalChains > 1 && (
              <div className={styles.actions}>
                {chains.map((c) => (
                  <Button
                    key={c.chainIndex}
                    variant="ghost"
                    onClick={() => setViewerChainIndex(c.chainIndex)}
                  >
                    Chain {c.chainIndex + 1}{c.chainIndex === viewerChainIndex ? " ✓" : ""}
                  </Button>
                ))}
              </div>
            )}
          </>
        )}

        <div className={styles.actions}>
          <Button variant="primary" disabled={!me?.isHost} onClick={handlePlayAgain}>
            Play again →
          </Button>
        </div>
      </div>
    </Window>
  );
}
