import Window from "@/components/window/Window";
import CodeEditor from "@/components/game/CodeEditor";
import Button from "@/components/input/Button";
import styles from "./page.module.css";

const PROMPT = `Write a function that takes a list of integers and a target sum, and returns the indices of two numbers that add up to the target. Assume exactly one solution exists.`;

const STARTER_CODE = `def two_sum(nums, target):
    # Your code here
    seen = {}
    for i, x in enumerate(nums):
        complement = target - x
        if complement in seen:
            return [seen[complement], i]
        seen[x] = i
    return None
`;

export default function EditorDemo() {
  return (
    <div className={styles.stage}>
      <Window
        title="Code Telephone — Round 1 — Write Phase"
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
              <div className={styles.phaseLabel}>Phase 1 of 4</div>
              <div className={styles.phaseTitle}>Write the function</div>
            </div>
            <div className={styles.timer}>
              <span className={styles.timerLabel}>Time left</span>
              <span className={styles.timerValue}>2:34</span>
            </div>
          </header>

          <section className={styles.prompt}>
            <div className={styles.promptLabel}>Prompt</div>
            <p className={styles.promptText}>{PROMPT}</p>
          </section>

          <div className={styles.editorWrap}>
            <CodeEditor
              initialCode={STARTER_CODE}
              language="python"
              fileName="two_sum"
              height={380}
            />
          </div>

          <footer className={styles.actions}>
            <Button>Skip</Button>
            <span className={styles.flex} />
            <span className={styles.readyCount}>1 of 4 submitted</span>
            <Button variant="primary">Submit</Button>
          </footer>
        </div>
      </Window>
    </div>
  );
}
