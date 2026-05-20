"use client";

import { useEffect, useState } from "react";
import styles from "./Clock.module.css";

function formatTime(d) {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function formatDate(d) {
  const dd = d.getDate().toString().padStart(2, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export default function Clock() {
  /* Render a stable initial value on the server so hydration doesn't mismatch,
     then swap to the real time once mounted. */
  const [now, setNow] = useState(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    /* Update every 15s — accurate enough for a clock that only shows minutes */
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={styles.clock} suppressHydrationWarning>
      <div className={styles.time}>{now ? formatTime(now) : "—:—"}</div>
      <div className={styles.date}>{now ? formatDate(now) : "—/—/—"}</div>
    </div>
  );
}
