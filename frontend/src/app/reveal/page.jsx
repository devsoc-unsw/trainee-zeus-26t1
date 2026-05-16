"use client";

import Window from "@/components/window/Window";
import Button from "@/components/input/Button";
import CodeEditor from "@/components/game/CodeEditor";
import PlayerAvatar from "@/components/game/PlayerAvatar";
import ScoreNumber from "@/components/game/ScoreNumber";
import { useRound } from "@/lib/socket/useRound";
import styles from "./page.module.css";

/* ──────────────────────────────────────────────────────────────────
   Mock data — used when `useRound()` returns the empty default
   shape (e.g. opening /reveal directly during dev). Real game data
   replaces this once useRound is wired up.
   ────────────────────────────────────────────────────────────────── */
const MOCK_CHAIN = {
  startPlayerId: "p-jordan",
  startPlayerName: "Jordan",
  segments: [
    {
      roundNum: 1,
      roundType: "code",
      authorId: "p-jordan",
      authorName: "Jordan",
      content:
        "def reverse_string(s):\n    return s[::-1]\n",
    },
    {
      roundNum: 2,
      roundType: "describe",
      authorId: "p-amrita",
      authorName: "Amrita",
      content:
        "Takes a string and returns the same string with its characters in reverse order.",
    },
    {
      roundNum: 3,
      roundType: "code",
      authorId: "p-lukas",
      authorName: "Lukas",
      content:
        "def flip(text):\n    return text[::-1]\n",
    },
  ],
};

const MOCK_SCORE_PERCENT = 87;

// TODO: ELO row hydrates from a future protocol field — for now this is
// static placeholder data so the layout is reviewable.
const MOCK_ELO = [
  { name: "Jordan", delta: 8 },
  { name: "Amrita", delta: 12 },
  { name: "Lukas", delta: -4 },
];

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

export default function RevealPage() {
  const { chains, reset } = useRound();

  // Pick the focal chain. Real games: chains[0]. Stub state: mock.
  const chain = chains && chains.length > 0 ? chains[0] : MOCK_CHAIN;
  const usingMock = !(chains && chains.length > 0);

  const segments = chain.segments;
  const originalSegment = segments[0];
  // Reconstructed = the last `code`-type segment (write/reimplement phases).
  const reconstructedSegment =
    [...segments].reverse().find((s) => s.roundType === "code") ?? segments[segments.length - 1];

  const scorePercent = usingMock ? MOCK_SCORE_PERCENT : null;
  const elo = usingMock
    ? MOCK_ELO
    // TODO: hydrate from protocol once subsystem #3 wires ELO into game:reveal.
    : MOCK_ELO.map((p) => ({ name: p.name, delta: null }));

  const handlePlayAgain = () => {
    reset().catch((err) => console.error("[reveal] reset failed:", err));
  };

  const handleReplay = () => {
    // TODO: open the replay subsystem (not yet defined).
    console.log("[reveal] view replay — not implemented");
  };

  return (
    <div className={styles.stage}>
      <Window title="Code Telephone — Round Reveal" width={900} height={700}>
        <div className={styles.body}>
          {/* ── Chain row ──────────────────────────────────────── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>The chain</h2>
            <div className={styles.chain}>
              {segments.map((seg, i) => (
                <ChainNodeFragment key={`seg-${i}`} segment={seg} isFirst={i === 0} />
              ))}
              <span className={styles.chainArrow} aria-hidden>→</span>
              <div className={`${styles.chainNode} ${styles.chainScoreNode}`}>
                <span className={styles.chainStar} aria-hidden>✦</span>
                <span className={styles.chainNodeLabel}>Score</span>
              </div>
            </div>
          </section>

          {/* ── Diff panel ─────────────────────────────────────── */}
          <section className={styles.section}>
            <div className={styles.diff}>
              <div className={styles.diffPanel}>
                <span className={styles.diffHeader}>
                  Original<strong>({originalSegment.authorName})</strong>
                </span>
                <CodeEditor
                  initialCode={originalSegment.content}
                  language="python"
                  fileName="original"
                  readOnly
                  height={220}
                  showStatusBar={false}
                />
              </div>
              <div className={styles.diffPanel}>
                <span className={styles.diffHeader}>
                  Reconstructed<strong>({reconstructedSegment.authorName})</strong>
                </span>
                <CodeEditor
                  initialCode={reconstructedSegment.content}
                  language="python"
                  fileName="reconstructed"
                  readOnly
                  height={220}
                  showStatusBar={false}
                />
              </div>
            </div>
          </section>

          {/* ── Score ──────────────────────────────────────────── */}
          <section className={styles.section}>
            <div className={styles.scoreWrap}>
              <ScoreNumber value={scorePercent} suffix="%" subLabel="semantic match" />
            </div>
          </section>

          {/* ── ELO row ────────────────────────────────────────── */}
          <section className={styles.section}>
            <div className={styles.eloRow}>
              <span className={styles.eloLabel}>ELO</span>
              {elo.map((p) => (
                <span key={p.name} className={styles.eloItem}>
                  <span className={styles.eloName}>{p.name}</span>
                  <span className={eloClassOf(p.delta, styles)}>{eloFormatOf(p.delta)}</span>
                </span>
              ))}
            </div>
          </section>

          {/* ── Footer ─────────────────────────────────────────── */}
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

/* ── Inline helper: render one chain node + its trailing arrow ─────────── */
function ChainNodeFragment({ segment }) {
  return (
    <>
      <div className={styles.chainNode}>
        <PlayerAvatar
          initials={initialsOf(segment.authorName)}
          seed={segment.authorName}
        />
        <span className={styles.chainNodeName}>{segment.authorName}</span>
        <span className={styles.chainNodeLabel}>{roleLabelOf(segment.roundType)}</span>
      </div>
      <span className={styles.chainArrow} aria-hidden>→</span>
    </>
  );
}
