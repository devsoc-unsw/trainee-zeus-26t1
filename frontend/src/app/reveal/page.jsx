"use client";

import { useEffect } from "react";
import Window from "@/components/window/Window";
import Button from "@/components/input/Button";
import CodeEditor from "@/components/game/CodeEditor";
import PlayerAvatar from "@/components/game/PlayerAvatar";
import ScoreNumber from "@/components/game/ScoreNumber";
import { getSession } from "@/lib/socket/lobby";
import { syncGame } from "@/lib/socket/round";
import { useLobby } from "@/lib/socket/useLobby";
import { useRound } from "@/lib/socket/useRound";
import styles from "./page.module.css";

function initialsOf(name) {
  if (!name) return "??";
  return name.slice(0, 2).toUpperCase();
}

function roleLabelOf(roundType) {
  if (roundType === "code") return "Code";
  if (roundType === "describe") return "Desc";
  return "?";
}

function eloClassOf(delta, stylesRef) {
  if (delta == null) return stylesRef.eloUnknown;
  if (delta > 0) return stylesRef.eloPositive;
  if (delta < 0) return stylesRef.eloNegative;
  return stylesRef.eloUnknown;
}

function eloFormatOf(delta) {
  if (delta == null) return "?";
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

/** Prefer the chain this player started; otherwise first chain in the room. */
function pickViewerChain(chains, playerId) {
  if (!Array.isArray(chains) || chains.length === 0) return null;
  if (playerId) {
    const mine = chains.find((c) => c.startPlayerId === playerId);
    if (mine) return mine;
  }
  return chains[0];
}

function chainIndexOf(chains, chain) {
  if (!chains || !chain) return 0;
  const idx = chains.indexOf(chain);
  return idx >= 0 ? idx : 0;
}

function originalSegmentOf(chain) {
  return chain?.segments?.[0] ?? null;
}

function reconstructedSegmentOf(chain) {
  const segments = chain?.segments;
  if (!segments?.length) return null;
  return (
    [...segments].reverse().find((s) => s.roundType === "code") ??
    segments[segments.length - 1]
  );
}

/** Map AI judge `overallScore` (0–1) to the reveal pill (0–100). */
function chainScorePercent(scores, chainIndex) {
  if (!Array.isArray(scores)) return null;
  const row = scores.find((s) => s.chainIndex === chainIndex);
  if (!row || typeof row.overallScore !== "number") return null;
  return Math.round(row.overallScore * 100);
}

/** ELO deltas for each unique author in the viewed chain. */
function eloPlayersForChain(eloRows, chain) {
  if (!chain?.segments) return [];
  const byPlayerId = new Map();
  if (Array.isArray(eloRows)) {
    for (const row of eloRows) {
      if (row?.playerId) byPlayerId.set(row.playerId, row);
    }
  }
  const seen = new Set();
  const out = [];
  for (const seg of chain.segments) {
    const key = seg.authorId ?? seg.authorName;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const row = byPlayerId.get(seg.authorId);
    out.push({
      name: seg.authorName,
      delta: typeof row?.delta === "number" ? row.delta : null,
    });
  }
  return out;
}

export default function RevealPage() {
  const { chains, scores, elo, reset } = useRound();
  const { playerId } = useLobby();

  useEffect(() => {
    const { roomId, playerId: pid } = getSession();
    if (!roomId || !pid) return undefined;
    if (chains?.length && scores?.length && elo?.length) return undefined;
    let cancelled = false;
    syncGame(roomId, pid).catch((err) => {
      if (!cancelled) console.error("[reveal] sync failed:", err);
    });
    return () => {
      cancelled = true;
    };
  }, [chains, scores, elo]);

  const chain = pickViewerChain(chains, playerId);
  const chainIndex = chainIndexOf(chains, chain);
  const segments = chain?.segments ?? [];
  const originalSegment = originalSegmentOf(chain);
  const reconstructedSegment = reconstructedSegmentOf(chain);
  const scorePercent = chainScorePercent(scores, chainIndex);
  const eloPlayers = chain ? eloPlayersForChain(elo, chain) : [];

  const handlePlayAgain = () => {
    reset().catch((err) => console.error("[reveal] reset failed:", err));
  };

  const handleReplay = () => {
    console.log("[reveal] view replay — not implemented");
  };

  return (
    <div className={styles.stage}>
      <Window title="Code Telephone — Round Reveal" width={900} height={700}>
        <div className={styles.body}>
          {!chain || !originalSegment || !reconstructedSegment ? (
            <p className={styles.emptyMessage}>
              No reveal data yet. Finish a game to see the chain here, or wait a
              moment if you just completed a round.
            </p>
          ) : (
            <>
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>The chain</h2>
                <div className={styles.chain}>
                  {segments.map((seg, i) => (
                    <ChainNodeFragment
                      key={`seg-${seg.roundNum}-${seg.authorId}-${i}`}
                      segment={seg}
                    />
                  ))}
                  <span className={styles.chainArrow} aria-hidden>
                    →
                  </span>
                  <div className={`${styles.chainNode} ${styles.chainScoreNode}`}>
                    <span className={styles.chainStar} aria-hidden>
                      ✦
                    </span>
                    <span className={styles.chainNodeName}>
                      {scorePercent != null ? `${scorePercent}%` : "—"}
                    </span>
                    <span className={styles.chainNodeLabel}>Score</span>
                  </div>
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.diff}>
                  <div className={styles.diffPanel}>
                    <span className={styles.diffHeader}>
                      Original<strong>({originalSegment.authorName})</strong>
                    </span>
                    <CodeEditor
                      value={originalSegment.content ?? ""}
                      language="python"
                      fileName="original"
                      readOnly
                      height={220}
                      showStatusBar={false}
                    />
                  </div>
                  <div className={styles.diffPanel}>
                    <span className={styles.diffHeader}>
                      Reconstructed
                      <strong>({reconstructedSegment.authorName})</strong>
                    </span>
                    <CodeEditor
                      value={reconstructedSegment.content ?? ""}
                      language="python"
                      fileName="reconstructed"
                      readOnly
                      height={220}
                      showStatusBar={false}
                    />
                  </div>
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.scoreWrap}>
                  <ScoreNumber
                    value={scorePercent}
                    suffix="%"
                    subLabel="semantic match"
                  />
                </div>
              </section>

              {eloPlayers.length > 0 && (
                <section className={styles.section}>
                  <div className={styles.eloRow}>
                    <span className={styles.eloLabel}>ELO</span>
                    {eloPlayers.map((p) => (
                      <span key={p.name} className={styles.eloItem}>
                        <span className={styles.eloName}>{p.name}</span>
                        <span className={eloClassOf(p.delta, styles)}>
                          {eloFormatOf(p.delta)}
                        </span>
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          <footer className={styles.footer}>
            <Button onClick={handleReplay}>View replay</Button>
            <Button variant="primary" onClick={handlePlayAgain}>
              Play again
            </Button>
          </footer>
        </div>
      </Window>
    </div>
  );
}

function ChainNodeFragment({ segment }) {
  return (
    <>
      <div className={styles.chainNode}>
        <PlayerAvatar
          initials={initialsOf(segment.authorName)}
          seed={segment.authorName}
        />
        <span className={styles.chainNodeName}>{segment.authorName}</span>
        <span className={styles.chainNodeLabel}>
          {roleLabelOf(segment.roundType)}
        </span>
      </div>
      <span className={styles.chainArrow} aria-hidden>
        →
      </span>
    </>
  );
}
