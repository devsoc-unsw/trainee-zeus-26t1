import Notepad from "@/components/notepad/Notepad";
import Window from "@/components/window/Window";
import CodeEditor from "@/components/game/CodeEditor";
import PhaseHUD from "@/components/game/PhaseHUD";
import styles from "./page.module.css";

/* What Player B (the describer) actually wrote, after staring at the
   obfuscated `def f(a, t)`. Slightly imprecise on purpose — that ambiguity
   is what makes the Telephone chain produce interesting reconstructions. */
const RECEIVED_DESCRIPTION = `Looks for two numbers in the input list that sum to a given target.

It uses a dictionary to keep track of which numbers we've already looked at and their positions. As it walks through the list, it checks whether the number we'd need to reach the target has already been seen — if yes, return where the matching pair lives in the list.

Nothing found = nothing returned.`;

/* Fresh editor — Player C hasn't started yet. The blank slate invites typing. */
const STARTER_CODE = `# write code here
`;

export default function ReimplementDemo() {
  return (
    <div className={styles.stage}>
      <PhaseHUD
        phaseIndex={3}
        phaseTotal={4}
        title="Re-implement the function"
        timer="2:08"
        readyCount="0 of 4 submitted"
        submitLabel="Submit code"
      />

      {/* Left: the description (read-only Notepad). */}
      <div className={styles.descWindow}>
        <Notepad
          fileName="received"
          initialValue={RECEIVED_DESCRIPTION}
          readOnly
          x={56}
          y={88}
          width={440}
          height={460}
        />
      </div>

      {/* Right: the editor where Player C writes their reconstruction. */}
      <div className={styles.codeWindow}>
        <Window
          title="solution.py — Code Telephone"
          x={520}
          y={88}
          width={580}
          height={460}
        >
          <CodeEditor
            initialCode={STARTER_CODE}
            language="python"
            fileName="solution"
            height={428}
            showStatusBar
          />
        </Window>
      </div>
    </div>
  );
}
