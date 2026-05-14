import StartOrb from "./StartOrb";
import Clock from "./Clock";
import TaskbarItem from "./TaskbarItem";
import styles from "./Superbar.module.css";

const pinnedApps = [
  { id: "code-telephone", label: "Code Telephone", active: true, icon: "ct" },
  { id: "explorer",       label: "Windows Explorer", active: false, icon: "folder" },
  { id: "ie",             label: "Internet Explorer", active: false, icon: "ie" },
];

export default function Superbar() {
  return (
    <div className={styles.superbar}>
      <div className={styles.glare} aria-hidden />
      <StartOrb />
      <div className={styles.divider} aria-hidden />
      <div className={styles.tasks}>
        {pinnedApps.map((app) => (
          <TaskbarItem key={app.id} {...app} />
        ))}
      </div>
      <div className={styles.tray}>
        <Clock />
      </div>
      <button className={styles.peek} aria-label="Show desktop" />
    </div>
  );
}
