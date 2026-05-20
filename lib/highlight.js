/* ──────────────────────────────────────────────────────────────────────
   Tiny syntax highlighter.
   Not a full parser — a regex token stream. Good enough for displaying
   short game snippets with VSCode-like colours. Swap for Monaco / Prism
   when we need real IDE features (autocomplete, error checking).
   ────────────────────────────────────────────────────────────────────── */

const KEYWORDS = {
  python: new Set([
    "def", "return", "if", "else", "elif", "for", "in", "while", "import",
    "from", "as", "class", "lambda", "True", "False", "None", "and", "or",
    "not", "is", "with", "try", "except", "finally", "raise", "pass",
    "break", "continue", "yield", "global", "nonlocal", "assert", "del",
    "async", "await",
  ]),
  javascript: new Set([
    "function", "return", "if", "else", "for", "in", "of", "while", "do",
    "switch", "case", "break", "continue", "default", "const", "let", "var",
    "class", "extends", "new", "this", "super", "true", "false", "null",
    "undefined", "typeof", "instanceof", "try", "catch", "finally", "throw",
    "async", "await", "import", "export", "from", "as", "void", "delete",
  ]),
  java: new Set([
    "public", "private", "protected", "static", "final", "abstract", "class",
    "interface", "extends", "implements", "return", "if", "else", "for",
    "while", "do", "switch", "case", "break", "continue", "default", "new",
    "this", "super", "true", "false", "null", "void", "int", "long", "short",
    "byte", "float", "double", "boolean", "char", "String", "try", "catch",
    "finally", "throw", "throws", "import", "package",
  ]),
};

const BUILTINS = {
  python: new Set([
    "print", "len", "range", "enumerate", "map", "filter", "list", "dict",
    "tuple", "set", "str", "int", "float", "bool", "type", "isinstance",
    "abs", "min", "max", "sum", "sorted", "reversed", "zip", "input", "open",
  ]),
  javascript: new Set([
    "console", "Math", "Array", "Object", "String", "Number", "Boolean",
    "JSON", "Promise", "Map", "Set", "Date", "Error", "parseInt", "parseFloat",
  ]),
  java: new Set([
    "System", "Math", "Integer", "Double", "Boolean", "Character",
    "ArrayList", "HashMap", "HashSet", "List", "Map", "Set", "Arrays",
  ]),
};

/* Token patterns are tried IN ORDER for each position. First match wins.
   Each entry: [tokenType, regex]. Regexes must be anchored to the start. */
function buildPatterns(language) {
  const stringPatterns = [
    /^"""[\s\S]*?"""/,            // python triple double
    /^'''[\s\S]*?'''/,            // python triple single
    /^"(?:\\.|[^"\\])*"/,         // double-quoted
    /^'(?:\\.|[^'\\])*'/,         // single-quoted
  ];

  const commentPatterns = language === "python"
    ? [/^#[^\n]*/]
    : [/^\/\/[^\n]*/, /^\/\*[\s\S]*?\*\//];

  return [
    ["comment", commentPatterns],
    ["string", stringPatterns],
    ["number", [/^0x[\da-fA-F]+|^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/]],
    ["function", [/^[a-zA-Z_][\w]*(?=\s*\()/]],
    ["identifier", [/^[a-zA-Z_][\w]*/]],
    ["operator", [/^(===|!==|==|!=|<=|>=|=>|->|&&|\|\||\+\+|--|\+=|-=|\*=|\/=|\*\*|\/\/|[+\-*/%=<>!&|^~?:])/]],
    ["punctuation", [/^[\(\)\[\]\{\},;\.]/]],
    ["whitespace", [/^\s+/]],
  ];
}

export function tokenize(code, language = "python") {
  const patterns = buildPatterns(language);
  const keywords = KEYWORDS[language] ?? new Set();
  const builtins = BUILTINS[language] ?? new Set();

  const out = [];
  let rest = code;

  while (rest.length > 0) {
    let matched = false;

    for (const [type, regexes] of patterns) {
      for (const re of regexes) {
        const m = rest.match(re);
        if (m) {
          let actualType = type;
          /* Re-classify identifiers as keyword / builtin where applicable */
          if (type === "identifier") {
            if (keywords.has(m[0])) actualType = "keyword";
            else if (builtins.has(m[0])) actualType = "builtin";
          }
          out.push({ type: actualType, value: m[0] });
          rest = rest.slice(m[0].length);
          matched = true;
          break;
        }
      }
      if (matched) break;
    }

    if (!matched) {
      out.push({ type: "text", value: rest[0] });
      rest = rest.slice(1);
    }
  }

  return out;
}

/* Produce raw HTML string from tokens. Used for the highlight overlay
   behind the textarea. Escapes content so user-typed `<` doesn't break out. */
const escapeHTML = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export function highlightToHtml(code, language) {
  const tokens = tokenize(code, language);
  return tokens
    .map((t) => {
      if (t.type === "whitespace" || t.type === "text") {
        return escapeHTML(t.value);
      }
      return `<span class="tok-${t.type}">${escapeHTML(t.value)}</span>`;
    })
    .join("");
}
