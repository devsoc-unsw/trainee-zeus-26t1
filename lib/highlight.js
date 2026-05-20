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
  typescript: new Set([
    "function", "return", "if", "else", "for", "in", "of", "while", "do",
    "switch", "case", "break", "continue", "default", "const", "let", "var",
    "class", "extends", "new", "this", "super", "true", "false", "null",
    "undefined", "typeof", "instanceof", "try", "catch", "finally", "throw",
    "async", "await", "import", "export", "from", "as", "void", "delete",
    "interface", "type", "enum", "readonly", "public", "private", "protected",
    "namespace", "implements", "abstract", "keyof", "infer", "is", "satisfies",
  ]),
  java: new Set([
    "public", "private", "protected", "static", "final", "abstract", "class",
    "interface", "extends", "implements", "return", "if", "else", "for",
    "while", "do", "switch", "case", "break", "continue", "default", "new",
    "this", "super", "true", "false", "null", "void", "int", "long", "short",
    "byte", "float", "double", "boolean", "char", "String", "try", "catch",
    "finally", "throw", "throws", "import", "package", "synchronized",
    "volatile", "transient", "enum",
  ]),
  c: new Set([
    "int", "char", "float", "double", "void", "short", "long", "unsigned",
    "signed", "return", "if", "else", "for", "while", "do", "switch", "case",
    "break", "continue", "struct", "typedef", "enum", "static", "const",
    "sizeof", "include", "define",
  ]),
  cpp: new Set([
    "int", "char", "float", "double", "void", "short", "long", "unsigned",
    "signed", "return", "if", "else", "for", "while", "do", "switch", "case",
    "break", "continue", "struct", "typedef", "enum", "static", "const",
    "sizeof", "class", "public", "private", "protected", "virtual", "override",
    "new", "delete", "this", "nullptr", "true", "false", "namespace", "using",
    "template", "typename", "auto", "include", "define",
  ]),
  csharp: new Set([
    "public", "private", "protected", "class", "interface", "return", "if",
    "else", "for", "while", "new", "null", "true", "false", "using", "namespace",
    "static", "readonly", "void", "int", "double", "float", "string", "bool",
    "var", "this", "base", "virtual", "override", "async", "await", "try",
    "catch", "finally", "throw", "foreach", "in", "switch", "case", "break",
    "continue",
  ]),
  rust: new Set([
    "fn", "let", "mut", "const", "static", "return", "if", "else", "for",
    "while", "loop", "in", "match", "struct", "enum", "trait", "impl", "pub",
    "use", "mod", "ref", "move", "self", "Self", "where", "as", "crate",
    "true", "false", "None", "Some", "Ok", "Err",
  ]),
  go: new Set([
    "func", "return", "if", "else", "for", "switch", "case", "break",
    "continue", "var", "const", "type", "struct", "interface", "package",
    "import", "map", "chan", "range", "defer", "go", "nil", "true", "false",
  ]),
  ruby: new Set([
    "def", "end", "class", "module", "return", "if", "else", "elsif", "unless",
    "do", "while", "until", "for", "in", "then", "case", "when", "begin",
    "rescue", "ensure", "raise", "yield", "nil", "true", "false", "self",
    "super", "require",
  ]),
  swift: new Set([
    "func", "let", "var", "return", "if", "else", "for", "in", "while",
    "guard", "switch", "case", "default", "break", "continue", "class",
    "struct", "enum", "protocol", "extension", "import", "public", "private",
    "internal", "fileprivate", "open", "static", "final", "override", "init",
    "self", "Self", "true", "false", "nil",
  ]),
  kotlin: new Set([
    "fun", "val", "var", "return", "if", "else", "for", "in", "while", "when",
    "class", "object", "interface", "companion", "data", "sealed", "enum",
    "import", "package", "public", "private", "internal", "protected", "open",
    "override", "true", "false", "null", "this",
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
  typescript: new Set([
    "console", "Math", "Array", "Object", "String", "Number", "Boolean",
    "JSON", "Promise", "Map", "Set", "Date", "Error",
  ]),
  java: new Set([
    "System", "Math", "Integer", "Double", "Boolean", "Character",
    "ArrayList", "HashMap", "HashSet", "List", "Map", "Set", "Arrays",
  ]),
  c: new Set(["printf", "scanf", "malloc", "free", "memcpy", "strcpy", "strlen"]),
  cpp: new Set(["cout", "cin", "endl", "vector", "string", "map", "set", "pair"]),
  csharp: new Set(["Console", "WriteLine", "Math", "List", "Dictionary"]),
  rust: new Set(["println", "Vec", "String", "Option", "Result"]),
  go: new Set(["fmt", "Println", "Printf", "make", "len", "cap", "append"]),
  ruby: new Set(["puts", "print", "p", "gets", "require"]),
  swift: new Set(["print", "Array", "Dictionary", "Set", "String"]),
  kotlin: new Set(["println", "print", "listOf", "mapOf", "setOf"]),
};

function buildPatterns(language) {
  const stringPatterns = [
    /^"""[\s\S]*?"""/,
    /^'''[\s\S]*?'''/,
    /^"(?:\\.|[^"\\])*"/,
    /^'(?:\\.|[^'\\])*'/,
    /^`(?:\\.|[^`\\])*`/,
  ];

  const commentPatterns =
    language === "python" || language === "ruby"
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

const escapeHTML = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
