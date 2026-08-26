// Lightweight regex tokenizer for code highlight — deliberately no shiki /
// prism / monaco: the bundle ships inside the SPA <Player> (T-02).
// Returns ordered spans covering the whole input; unknown text is "plain".

export type SpanKind =
  | "plain"
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "function";

export interface HighlightSpan {
  kind: SpanKind;
  text: string;
}

const KEYWORDS = new Set([
  "abstract", "any", "as", "async", "await", "boolean", "break", "case",
  "catch", "class", "const", "continue", "declare", "default", "delete",
  "do", "else", "enum", "export", "extends", "false", "finally", "for",
  "from", "function", "get", "if", "implements", "import", "in", "instanceof",
  "interface", "keyof", "let", "new", "null", "number", "of", "private",
  "protected", "public", "readonly", "return", "satisfies", "set", "static",
  "string", "super", "switch", "this", "throw", "true", "try", "type",
  "typeof", "undefined", "unknown", "var", "void", "while", "with", "yield",
]);

// Order matters: comments first so their content is not re-tokenized, then
// strings, then identifiers/numbers.
const TOKEN_RE =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#(?!\{)[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|([A-Za-z_$][A-Za-z0-9_$]*!?)|(\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?n?)|([\s\S])/gi;

export function tokenize(code: string): HighlightSpan[] {
  const spans: HighlightSpan[] = [];
  let lastIndex = 0;

  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(code)) !== null) {
    if (match.index > lastIndex) {
      // Safety net: regex covers everything, but never drop characters.
      spans.push({ kind: "plain", text: code.slice(lastIndex, match.index) });
    }
    const [full, comment, str, ident, num] = match;
    if (comment !== undefined) {
      spans.push({ kind: "comment", text: full });
    } else if (str !== undefined) {
      spans.push({ kind: "string", text: full });
    } else if (ident !== undefined) {
      const word = ident.endsWith("!") ? ident.slice(0, -1) : ident;
      const isCall =
        code[match.index + ident.length] === "(" &&
        !KEYWORDS.has(word.toLowerCase());
      if (KEYWORDS.has(word.toLowerCase())) {
        spans.push({ kind: "keyword", text: full });
      } else if (isCall) {
        spans.push({ kind: "function", text: full });
      } else {
        spans.push({ kind: "plain", text: full });
      }
    } else if (num !== undefined) {
      spans.push({ kind: "number", text: full });
    } else {
      spans.push({ kind: "plain", text: full });
    }
    lastIndex = match.index + full.length;
  }
  if (lastIndex < code.length) {
    spans.push({ kind: "plain", text: code.slice(lastIndex) });
  }
  return mergeAdjacent(spans);
}

function mergeAdjacent(spans: HighlightSpan[]): HighlightSpan[] {
  const out: HighlightSpan[] = [];
  for (const span of spans) {
    const last = out[out.length - 1];
    if (last && last.kind === span.kind) {
      last.text += span.text;
    } else {
      out.push({ ...span });
    }
  }
  return out;
}

/** Highlights only the first `visibleChars` characters (typing effect). */
export function tokenizeVisible(code: string, visibleChars: number): HighlightSpan[] {
  const visible = visibleChars >= code.length ? code : code.slice(0, Math.max(0, visibleChars));
  return tokenize(visible);
}
