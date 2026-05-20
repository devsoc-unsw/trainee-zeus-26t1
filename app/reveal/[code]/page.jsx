"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Window from "@/components/window/Window";
import Button from "@/components/input/Button";
import CodeEditor from "@/components/game/CodeEditor";
import PlayerAvatar from "@/components/game/PlayerAvatar";
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

function initialsOf(name) {
  if (!name) return "??";
  return name.slice(0, 2).toUpperCase();
}

function roleLabelOf(roundType) {
  return roundType === "code" ? "Code" : "Desc";
}

/** Group submissions by chain_index and order by round_num ascending. */
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

  // Trigger AI judging once per (roomId, reveal phase) entry. Multiple
  // reveal-page mounts across tabs all POST; the route+RPC are
  // idempotent (chains already done/failed are skipped).
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

  useEffect(() => { if (notFound) router.replace("/"); }, [notFound, router]);

  const chains = chainsFromSubmissions(submissions, players);

  const [viewerChainIndex, setViewerChainIndex] = useState(0);
  useEffect(() => {
    if (typeof me?.seatIndex === "number") setViewerChainIndex(me.seatIndex);
  }, [me?.seatIndex]);

  const chain = chains.find((c) => c.chainIndex === viewerChainIndex) ?? chains[0] ?? null;
  const originalSegment = chain?.segments?.[0] ?? null;
  const reconstructedSegment = chain
    ? [...(chain.segments ?? [])].reverse().find((s) => s.round_type === "code") ?? null
    : null;

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

  if (loading || !room) return <div className={styles.stage}>Loading…</div>;

  return (
    <div className={styles.stage}>
      <Window title="Code Telephone — Round Reveal" width={900} height={700}>
        <div className={styles.body}>
          {error && <div role="alert">Realtime error: {error}</div>}

          {!chain || !originalSegment ? (
            <p className={styles.emptyMessage}>No reveal data yet.</p>
          ) : (
            <>
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>
                  Viewing chain {chain.chainIndex + 1} of {chains.length}
                </h2>
                <div className={styles.chain}>
                  {chain.segments.map((seg, i) => (
                    <span key={`seg-${seg.round_num}-${i}`}>
                      <div className={styles.chainNode}>
                        <PlayerAvatar initials={initialsOf(seg.authorName)} seed={seg.authorName} />
                        <span className={styles.chainNodeName}>{seg.authorName}</span>
                        <span className={styles.chainNodeLabel}>{roleLabelOf(seg.round_type)}</span>
                      </div>
                      {i < chain.segments.length - 1 && (
                        <span className={styles.chainArrow} aria-hidden>→</span>
                      )}
                    </span>
                  ))}
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.diff}>
                  <div className={styles.diffPanel}>
                    <span className={styles.diffHeader}>
                      Original prompt <strong>(seed)</strong>
                    </span>
                    <CodeEditor
                      value={originalSegment.content ?? ""}
                      language={originalSegment.language ?? "python"}
                      fileName="prompt"
                      readOnly
                      height={220}
                      showStatusBar={false}
                    />
                  </div>
                  {reconstructedSegment && (
                    <div className={styles.diffPanel}>
                      <span className={styles.diffHeader}>
                        Reconstructed <strong>({reconstructedSegment.authorName})</strong>
                      </span>
                      <CodeEditor
                        value={reconstructedSegment.content ?? ""}
                        language={reconstructedSegment.language ?? "python"}
                        fileName="reconstructed"
                        readOnly
                        height={220}
                        showStatusBar={false}
                      />
                    </div>
                  )}
                </div>
              </section>

              {(() => {
                const scoreRow = chainScores.find((s) => s.chain_index === chain.chainIndex);
                if (!scoreRow || scoreRow.status === "pending") {
                  return (
                    <section className={styles.section}>
                      <p className={styles.emptyMessage}>Scoring this chain…</p>
                    </section>
                  );
                }
                if (scoreRow.status === "failed") {
                  return (
                    <section className={styles.section}>
                      <p className={styles.emptyMessage}>
                        Scoring unavailable: {scoreRow.notes ?? "unknown error"}
                      </p>
                    </section>
                  );
                }
                return (
                  <section className={styles.section}>
                    <div>
                      <div style={{ fontSize: "3rem", fontWeight: 700 }}>
                        {scoreRow.overall_score ?? "—"}
                        <span style={{ fontSize: "1.5rem", opacity: 0.6 }}>/100</span>
                      </div>
                      {scoreRow.notes && (
                        <p style={{ marginTop: "0.5rem", opacity: 0.8 }}>{scoreRow.notes}</p>
                      )}
                    </div>
                  </section>
                );
              })()}

              {chains.length > 1 && (
                <section className={styles.section}>
                  <div>
                    {chains.map((c) => (
                      <Button
                        key={c.chainIndex}
                        onClick={() => setViewerChainIndex(c.chainIndex)}
                      >
                        Chain {c.chainIndex + 1}{c.chainIndex === viewerChainIndex ? " ✓" : ""}
                      </Button>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          <footer className={styles.footer}>
            <Button variant="primary" disabled={!me?.isHost} onClick={handlePlayAgain}>
              Play again
            </Button>
          </footer>
        </div>
      </Window>
    </div>
  );
}
