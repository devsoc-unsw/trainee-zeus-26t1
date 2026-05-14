"use client";

import { forwardRef } from "react";
import styles from "./TextField.module.css";

/* Single-line Aero text input. Matches text-field.svg — recessed white
   surface, thin border, focus picks up the blue glow. */
const TextField = forwardRef(function TextField(
  { className = "", ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      type="text"
      className={`${styles.input} ${className}`}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      {...rest}
    />
  );
});

export default TextField;
