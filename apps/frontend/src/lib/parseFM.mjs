// Client-side YAML frontmatter parser for the article editor.
// Intentionally minimal — only supports the subset our blog posts use:
//   scalar, quoted scalar, boolean, ISO date, block list ("  - item"),
//   flow list (["a", "b"]), and the nested `faq:` block with question/answer.

export function unquote(s) {
  return String(s).replace(/^"|"$/g, '').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

// Parse a YAML flow-style array (e.g. `["a", "b"]` or `['a', 'b']` or `[a, b]`).
// Tries JSON.parse first (covers double-quoted canonical form), falls back to a
// hand-rolled parser that handles single-quoted and bare values.
export function parseInlineArray(raw) {
  const s = String(raw).trim();
  try {
    const j = JSON.parse(s);
    if (Array.isArray(j)) return j.map((x) => String(x));
  } catch { /* fall through */ }

  const inner = s.replace(/^\[\s*|\s*\]\s*$/g, '');
  if (!inner) return [];
  const items = [];
  let cur = '';
  let quote = null;
  let escape = false;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (escape) { cur += c; escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (quote) {
      if (c === quote) { quote = null; continue; }
      cur += c;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === ',') { items.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  const tail = cur.trim();
  if (tail) items.push(tail);
  return items;
}

export function parseFM(raw) {
  const fm = {};
  const lines = String(raw).split('\n');
  let inArr = null;
  const arrBuf = [];
  let inFaq = false;
  const faqBuf = [];
  let currentFaq = null;

  for (const line of lines) {
    if (inFaq) {
      const qm = line.match(/^\s{2}-\s+question:\s*(.*)$/);
      const am = line.match(/^\s{4}answer:\s*(.*)$/);
      if (qm) {
        if (currentFaq) faqBuf.push(currentFaq);
        currentFaq = { question: unquote(qm[1]), answer: '' };
        continue;
      }
      if (am && currentFaq) {
        currentFaq.answer = unquote(am[1]);
        continue;
      }
      if (/^[a-zA-Z]/.test(line)) {
        if (currentFaq) { faqBuf.push(currentFaq); currentFaq = null; }
        inFaq = false;
      } else {
        continue;
      }
    }

    const m = line.match(/^([a-zA-Z]+):\s*(.*)$/);
    if (m) {
      if (inArr) { fm[inArr] = arrBuf.slice(); arrBuf.length = 0; }
      inArr = null;
      const k = m[1];
      const v = m[2].trim();
      if (k === 'faq' && v === '') { inFaq = true; continue; }
      if (v === '') { inArr = k; continue; }
      if (v === 'true') fm[k] = true;
      else if (v === 'false') fm[k] = false;
      else if (/^\d{4}-\d{2}-\d{2}/.test(v)) fm[k] = v.slice(0, 10);
      else if (v.startsWith('[')) fm[k] = parseInlineArray(v);
      else if (v.startsWith('"')) fm[k] = unquote(v);
      else fm[k] = v;
    } else if (inArr && /^\s*-\s*/.test(line)) {
      const v = line.replace(/^\s*-\s*/, '').trim();
      arrBuf.push(v.startsWith('"') ? unquote(v) : v);
    }
  }

  if (inArr) fm[inArr] = arrBuf.slice();
  if (currentFaq) faqBuf.push(currentFaq);
  if (faqBuf.length > 0) fm.faq = faqBuf;
  return fm;
}
