import Window from "@/components/window/Window";
import CodeEditor from "@/components/game/CodeEditor";
import Notepad from "@/components/notepad/Notepad";
import PhaseHUD from "@/components/game/PhaseHUD";
import styles from "./page.module.css";

/* The "obfuscated" two_sum — same logic Player A wrote, but Player B now
   sees it stripped of meaningful names. They have to infer the intent. */
const RECEIVED_CODE = `def f(a, t):
    s = {}
    for i, x in enumerate(a):
        c = t - x
        if c in s:
            return [s[c], i]
        s[x] = i
    return None
`;

const NOTEPAD_PLACEHOLDER = `In a sentence or two, describe what this function does.

The clearer your description, the more accurate the next player's reconstruction will be — but you can also describe it badly on purpose.`;

export default function DescribeDemo() {
  return (
    <div className={styles.stage}>
      <PhaseHUD
        phaseIndex={2}
        phaseTotal={4}
        title="Describe the function"
        timer="1:47"
        readyCount="2 of 4 submitted"
        submitLabel="Submit description"
      />

      {/* Left: the received code, in our IDE (read-only) */}
      <div className={styles.codeWindow}>
        <Window
          title="mystery.py — Code Telephone"
          x={56}
          y={88}
          width={560}
          height={460}
        >
          <CodeEditor
            initialCode={RECEIVED_CODE}
            language="python"
            fileName="mystery"
            readOnly
            height={428}
            showStatusBar
          />
        </Window>
      </div>

      {/* Right: a Notepad to write the description in */}
      <div className={styles.notepadWindow}>
        <Notepad
          fileName="Untitled"
          placeholder={NOTEPAD_PLACEHOLDER}
          x={640}
          y={88}
          width={440}
          height={460}
        />
      </div>
    </div>
  );
}
