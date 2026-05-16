# CodeEditor + Notepad Value Lift — Design

**Date:** 2026-05-17
**Status:** Approved, ready for implementation
**Branch:** `critical-path`
**Scope:** Lift internal state out of `CodeEditor` and `Notepad` so the three round pages can read the user's content and pass it into `submit(value)`. Without this, every Submit button sends an empty string and the game has no content to score.

## Goal

Make Submit actually submit. After this work:
- `/editor` Submit sends the code the player typed.
- `/describe` Submit sends the description the player typed.
- `/reimplement` Submit sends the reconstructed code.

## Current state

- `frontend/src/components/game/CodeEditor.jsx` keeps its content in `const [code, setCode] = useState(initialCode)` and never exposes it.
- `frontend/src/components/notepad/Notepad.jsx` has the same pattern.
- The three round pages all do `submit("")` with a TODO comment acknowledging the gap.

## Approach

**Always-controlled.** The round pages own state with `useState`. `CodeEditor` and `Notepad` accept `value` + `onChange` props (no internal state at all). Drop the `initialCode` / `initialValue` props — the parent's initial useState value replaces them.

This is the simpler of the two options. The alternative (controlled-or-uncontrolled dual mode) adds branching for no benefit in this codebase: every consumer already lives in a page that can hold state.

## Scope

**In:**
- `CodeEditor.jsx`: remove `useState`; accept `value: string`, `onChange: (newValue: string) => void`. Read-only mode still works (the `readOnly` prop already disables typing).
- `Notepad.jsx`: same change. The component still owns visual chrome (window title, menubar, status bar).
- `app/editor/page.jsx`: hold `useState(starterCode)`, pass `value` + `onChange` to `CodeEditor`, pass `value` to `submit`.
- `app/describe/page.jsx`: same with the Notepad's description text.
- `app/reimplement/page.jsx`: same with the CodeEditor's reconstructed code.

**Out (deferred):**
- Save-on-blur / autosave: not needed; submissions are explicit.
- Undo/redo history: not needed for v1.
- Multi-cursor / collaborative editing: way out of scope.

## File-level changes

### `CodeEditor.jsx`

Replace:
```jsx
export default function CodeEditor({
  initialCode = "",
  language = "python",
  // ...
}) {
  const [code, setCode] = useState(initialCode);
  // ...
  <textarea
    value={code}
    onChange={(e) => {
      // tab/indent logic
      setCode(/* new value */);
    }}
  />
}
```

With:
```jsx
export default function CodeEditor({
  value = "",
  onChange,
  language = "python",
  // ...
}) {
  const handleChange = (e) => {
    // tab/indent logic stays the same — produces a new string
    const next = /* computed */;
    onChange?.(next);
  };
  // ...
  <textarea value={value} onChange={handleChange} />
}
```

Keep the existing Tab-inserts-4-spaces and Enter-auto-indent logic — it just operates on `value` instead of `code`.

### `Notepad.jsx`

Mirror change: replace internal `useState(initialValue)` with `value` + `onChange` props.

### Round pages

Each page reads the relevant `seed.*` for the initial value and hosts the state:

```jsx
// editor/page.jsx
const { seed, submit, hasSubmitted, ... } = useRound();
const [editorValue, setEditorValue] = useState("");

useEffect(() => {
  // Hydrate from seed when round begins
  setEditorValue(seed?.starterLine ?? "");
}, [seed?.starterLine]);

const handleSubmit = () => {
  submit(editorValue).catch((err) => console.error("[editor] submit failed:", err));
};

<CodeEditor value={editorValue} onChange={setEditorValue} language="python" />
```

Identical pattern for `describe/page.jsx` (Notepad value) and `reimplement/page.jsx` (CodeEditor value). The Describe page's read-only CodeEditor stays read-only — pass `value={seed?.receivedContent ?? ""}` with no `onChange`.

## Read-only call sites

The Describe and Reimplement pages both render a **read-only** `CodeEditor` or `Notepad` to display the previous player's content. After this change, read-only means: pass `value={seed?.receivedContent}` and `readOnly`, and either omit `onChange` (component handles undefined safely via `onChange?.()`) or pass a no-op. The optional-chained call in the new component handles both.

The `/reveal` page also uses read-only `CodeEditor`s — already passes `initialCode` today. Update to `value` everywhere.

## Acceptance

- Typing in the editor on `/editor` updates a piece of state held by the page (verifiable: React DevTools shows the state, or `console.log(editorValue)`).
- Clicking Submit sends the typed content over the WebSocket — confirmed in browser devtools Network tab: outbound `{event: "round:submit", data: {content: "<typed text>"}}`.
- Tab and Enter auto-indent still work in the editor.
- The `[Read Only]` Describe-phase code panel still shows the previous player's code with no caret and no editability.
- The Reveal page's two side-by-side code panels still render their `chains[0].segments[*].content` correctly.
- `npm run dev` boots clean; all 6 routes return HTTP 200.

## Open items

- The Notepad's "save indicator" status bar text (if any) is not in scope.
- A future pass might add Ctrl-Enter to submit. Not in v1.
