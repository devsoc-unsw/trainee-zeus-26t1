/* Shared language metadata — used by LanguagePicker, CodeEditor, and any
   route that needs a starter snippet or display label. */

export const LANGS = [
  { value: "python", label: "Python", glyph: "Py", color: "#3776ab", ext: "py", starter: "def " },
  { value: "javascript", label: "JavaScript", glyph: "JS", color: "#b9a000", ext: "js", starter: "function " },
  { value: "typescript", label: "TypeScript", glyph: "TS", color: "#2f74c0", ext: "ts", starter: "function " },
  { value: "java", label: "Java", glyph: "Jv", color: "#b3361f", ext: "java", starter: "public class Solution {\n    \n}" },
  { value: "c", label: "C", glyph: "C", color: "#5687b0", ext: "c", starter: "#include <stdio.h>\n\n" },
  { value: "cpp", label: "C++", glyph: "C++", color: "#00599c", ext: "cpp", starter: "#include <iostream>\n\nint main() {\n    \n    return 0;\n}" },
  { value: "csharp", label: "C#", glyph: "C#", color: "#6c1aa0", ext: "cs", starter: "using System;\n\npublic class Solution {\n    \n}" },
  { value: "rust", label: "Rust", glyph: "Rs", color: "#b7410e", ext: "rs", starter: "fn " },
  { value: "go", label: "Go", glyph: "Go", color: "#00add8", ext: "go", starter: "package main\n\nfunc " },
  { value: "ruby", label: "Ruby", glyph: "Rb", color: "#b32134", ext: "rb", starter: "def \nend" },
  { value: "swift", label: "Swift", glyph: "Sw", color: "#f05138", ext: "swift", starter: "func " },
  { value: "kotlin", label: "Kotlin", glyph: "Kt", color: "#7f52ff", ext: "kt", starter: "fun " },
];

export const LANG_BY = Object.fromEntries(LANGS.map((l) => [l.value, l]));

export function langByAlias(value) {
  if (!value) return LANG_BY.python;
  const direct = LANG_BY[value];
  if (direct) return direct;
  const aliases = { js: "javascript", ts: "typescript", cs: "csharp" };
  return LANG_BY[aliases[value]] ?? LANG_BY.python;
}
