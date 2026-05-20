"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Window from "@/components/window/Window";
import Button from "@/components/input/Button";
import CodeEditor from "@/components/game/CodeEditor";
import PlayerAvatar from "@/components/game/PlayerAvatar";
import Pill from "@/components/game/Pill";
import { CTLogoMark } from "@/components/brand/CTLogo";
import styles from "./page.module.css";

// Stubbed during Plan 2 migration. The real round/lobby state and session
// sync will be rewired against the new Realtime architecture later.
function useRound() {
  return { chains: [], scores: [], elo: [], reset: async () => {} };
}
function useLobby() {
  return { playerId: null };
}
function getSession() {
  return { roomId: null, playerId: null };
}
async function syncGame() {}

const FALLBACK_CHAIN = {
  segments: [
    {
      authorName: "Jordan",
      roundType: "code",
      content: `def reverse_string(s: str) -> str:\n    """Return s reversed."""\n    return s[::-1]`,
      language: "python",
      preview: "s[::-1]",
    },
    {
      authorName: "Amrita",
      roundType: "describe",
      content: "Takes a string and returns it with the characters in reverse order.",
      preview: "“Reverses the chars”",
    },
    {
      authorName: "Lukas",
      roundType: "code",
      content: `def flip(text):\n    result = ""\n    for ch in text:\n        result = ch + result\n    return result`,
      language: "python",
      preview: "for loop, prepend",
    },
  ],
};

function pickViewerChain(chains, playerId) {
  if (!Array.isArray(chains) || chains.length === 0) return FALLBACK_CHAIN;
  if (playerId) {
    const mine = chains.find((c) => c.startPlayerId === playerId);
    if (mine) return mine;
  }
  return chains[0];
}

function chainIndexOf(chains, chain) {
  if (!chains?.length || !chain || chain === FALLBACK_CHAIN) return 0;
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

function chainScorePercent(scores, chainIndex) {
  if (!Array.isArray(scores) || scores.length === 0) return null;
  const row = scores.find((s) => s.chainIndex === chainIndex);
  if (!row || typeof row.overallScore !== "number") return null;
  return Math.round(row.overallScore * 100);
}

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
    out.push({ name: seg.authorName, delta: typeof row?.delta === "number" ? row.delta : null });
  }
  return out;
}

function roundLabel(seg) {
  return seg.roundType === "describe" ? "Description" : "Code";
}

export default function RevealPage() {
  const router = useRouter();
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
  const segments = chain?.segments ?? [];
  const originalSegment = originalSegmentOf(chain);
  const reconstructedSegment = reconstructedSegmentOf(chain);
  const chainIndex = chainIndexOf(chains, chain);
  const realScore = chainScorePercent(scores, chainIndex);
  const targetScore = realScore ?? 87;
  const eloPlayers = chain ? eloPlayersForChain(elo, chain) : [];
  const fallbackElo = [
    { name: "Jordan", delta: +8 },
    { name: "Amrita", delta: +12 },
    { name: "Lukas", delta: -4 },
    { name: "Mei", delta: +6 },
  ];
  const eloShown = eloPlayers.length > 0 ? eloPlayers : fallbackElo;

  const [counted, setCounted] = useState(0);
  const [lastTarget, setLastTarget] = useState(targetScore);
  // Compare-in-render: when the target shifts (e.g. real scores arrive),
  // reset the count-up animation back to zero before the effect kicks off.
  if (targetScore !== lastTarget) {
    setLastTarget(targetScore);
    setCounted(0);
  }
  useEffect(() => {
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

  const handlePlayAgain = () => {
    reset().catch((err) => console.error("[reveal] reset failed:", err));
    router.push("/");
  };

  return (
    <Window
      title="Round 1 — Reveal"
      subtitle="Semantic match scored by the AI judge"
      icon={<CTLogoMark size={14} />}
      width={1080}
      height={680}
      centered
      onClose={() => router.push("/")}
    >
      <div className={styles.reveal}>
        <header className={styles.head}>
          <div>
            <h2 className={styles.title}>The chain</h2>
            <p className={styles.sub}>Trace how the function moved through the room</p>
          </div>
          <Pill tone="active">Round 1 of 4</Pill>
        </header>

        <div className={styles.chainRow}>
          {segments.map((seg, i) => (
            <ChainNode key={`seg-${i}`} segment={seg} isLast={i === segments.length - 1} />
          ))}
        </div>

        <div className={styles.body}>
          <div className={styles.panes}>
            <div className={styles.pane}>
              <header className={styles.paneHead}>
                <span className={styles.paneTag} style={{ background: "#7cb6f5" }}>
                  ORIGINAL
                </span>
                <span>{originalSegment?.authorName ?? "—"} · code</span>
              </header>
              <CodeEditor
                value={originalSegment?.content ?? ""}
                language={originalSegment?.language ?? "python"}
                fileName="original"
                readOnly
                showStatusBar={false}
              />
            </div>
            <div className={styles.pane}>
              <header className={styles.paneHead}>
                <span className={styles.paneTag} style={{ background: "#c9a4f5" }}>
                  RECONSTRUCTED
                </span>
                <span>{reconstructedSegment?.authorName ?? "—"} · code</span>
              </header>
              <CodeEditor
                value={reconstructedSegment?.content ?? ""}
                language={reconstructedSegment?.language ?? "python"}
                fileName="reconstructed"
                readOnly
                showStatusBar={false}
              />
            </div>
          </div>

          <aside className={styles.scoreCard} aria-label="Round score">
            <div className={styles.scoreBlock}>
              <div className={styles.scoreLabel}>Semantic match</div>
              <div className={styles.scoreNum}>
                {counted}
                <span>%</span>
              </div>
              <div className={styles.scoreBar} role="progressbar" aria-valuenow={counted} aria-valuemin={0} aria-valuemax={100}>
                <div className={styles.scoreBarFill} style={{ width: counted + "%" }} />
              </div>
              <p className={styles.scoreNote}>
                Behavioural equivalence confirmed on 12 / 12 tests.
              </p>
            </div>

            <div className={styles.elo}>
              <div className={styles.eloLabel}>ELO change</div>
              {eloShown.map((p) => (
                <div className={styles.eloRow} key={p.name}>
                  <PlayerAvatar name={p.name} size={20} />
                  <span>{p.name}</span>
                  <span
                    className={`${styles.eloDelta} ${
                      (p.delta ?? 0) > 0
                        ? styles.eloPos
                        : (p.delta ?? 0) < 0
                          ? styles.eloNeg
                          : ""
                    }`}
                  >
                    {p.delta == null ? "?" : p.delta > 0 ? `+${p.delta}` : String(p.delta)}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </div>

        <div className={styles.actions}>
          <Button variant="ghost">View replay</Button>
          <Button variant="ghost">Share chain</Button>
          <Button variant="primary" onClick={handlePlayAgain}>
            Play again →
          </Button>
        </div>
      </div>
    </Window>
  );
}

function ChainNode({ segment, isLast }) {
  return (
    <>
      <div className={styles.chainNode}>
        <div className={styles.chainNodeHead}>
          <PlayerAvatar name={segment.authorName} size={24} />
          <span className={styles.chainNodeName}>{segment.authorName}</span>
        </div>
        <div className={styles.chainNodeStage}>{roundLabel(segment)}</div>
        <div className={styles.chainNodePreview}>
          {segment.preview ?? (segment.content?.split("\n")[0] ?? "").slice(0, 60)}
        </div>
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
