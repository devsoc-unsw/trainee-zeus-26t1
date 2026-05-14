import Window from "@/components/window/Window";
import GlassPanel from "@/components/glass/GlassPanel";
import Button from "@/components/input/Button";
import Checkbox from "@/components/input/Checkbox";
import Radio from "@/components/input/Radio";
import PlayerAvatar from "@/components/game/PlayerAvatar";
import styles from "./page.module.css";

/* ──────────────────────────────────────────────────────────────────────
   Static mock data for the lobby. Wired up later.
   ────────────────────────────────────────────────────────────────────── */
const ROOM_CODE = "ROOM-4829";
const MAX_PLAYERS = 6;

const players = [
  { id: 1, name: "Jordan",  initials: "JS", ready: true,  host: true  },
  { id: 2, name: "Amrita",  initials: "AM", ready: true,  host: false },
  { id: 3, name: "Lukas",   initials: "LK", ready: false, host: false },
];

const languages = [
  { id: "python",     label: "Python" },
  { id: "javascript", label: "JavaScript" },
  { id: "java",       label: "Java" },
];

const SELECTED_LANG = "python";

export default function Home() {
  const emptySlots = MAX_PLAYERS - players.length;

  return (
    <div className={styles.lobbyStage}>
      <Window
        title={`Code Telephone — ${ROOM_CODE}`}
        width={580}
        menubar={
          <div className={styles.menuItems}>
            <span>File</span>
            <span>Edit</span>
            <span>View</span>
            <span>Help</span>
          </div>
        }
      >
        <div className={styles.lobbyBody}>
          <header className={styles.header}>
            <div className={styles.roomLabel}>Room Code</div>
            <div className={styles.roomCode}>{ROOM_CODE}</div>
          </header>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>
                Players <span className={styles.muted}>({players.length}/{MAX_PLAYERS})</span>
              </h2>
            </div>

            <GlassPanel className={styles.playerList}>
              <ul className={styles.playerUl}>
                {players.map((p) => (
                  <li key={p.id} className={styles.playerRow}>
                    <PlayerAvatar initials={p.initials} seed={p.name} />
                    <span className={styles.playerName}>{p.name}</span>
                    {p.host && <span className={styles.hostTag}>host</span>}
                    <span className={styles.spacer} />
                    <Checkbox
                      state={p.ready ? "checked" : "none"}
                      label={p.ready ? "Ready" : "Not ready"}
                    />
                  </li>
                ))}
                {Array.from({ length: emptySlots }).map((_, i) => (
                  <li
                    key={`empty-${i}`}
                    className={`${styles.playerRow} ${styles.empty}`}
                  >
                    <span className={styles.emptyAvatar} />
                    <span className={styles.emptyText}>Empty slot</span>
                  </li>
                ))}
              </ul>
            </GlassPanel>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Language</h2>
            </div>
            <div className={styles.langRow}>
              {languages.map((l) => (
                <Radio
                  key={l.id}
                  name="language"
                  value={l.id}
                  checked={l.id === SELECTED_LANG}
                  label={l.label}
                />
              ))}
            </div>
          </section>

          <footer className={styles.actions}>
            <Button>Leave</Button>
            <span className={styles.flex} />
            <span className={styles.readyCount}>
              {players.filter((p) => p.ready).length} of {players.length} ready
            </span>
            <Button variant="primary">Start Game</Button>
          </footer>
        </div>
      </Window>
    </div>
  );
}
