// frontend/lib/search.ts
// Tiny inline fuzzy matcher. No dependency — we want the palette to weigh
// less than 3kB after gzip. Scoring: all query chars must appear in order;
// prefer early matches, runs of consecutive matches, and word boundaries.

export interface FuzzyMatch {
  score: number;
  positions: number[];
}

export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, positions: [] };
  const t = target.toLowerCase();
  if (!t.includes(q[0])) {
    // fast path: if first char isn't in target, bail
    let anyMatch = false;
    for (const c of q) if (t.includes(c)) { anyMatch = true; break; }
    if (!anyMatch) return null;
  }
  const positions: number[] = [];
  let qi = 0;
  let lastMatch = -2;
  let score = 0;
  let runLength = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      // word-boundary bonus (start of string or after a separator)
      const isBoundary = i === 0 || /[\s\-_./\\]/.test(t[i - 1]);
      if (isBoundary) score += 6;
      if (i === lastMatch + 1) {
        runLength += 1;
        score += 4 + runLength; // consecutive is strong
      } else {
        runLength = 0;
        score += 1;
      }
      if (i < 4) score += 2; // earlier is better
      lastMatch = i;
      positions.push(i);
      qi++;
    }
  }
  if (qi < q.length) return null;
  // Penalty for how spread out the matches are
  const spread = (positions[positions.length - 1] - positions[0]) - (positions.length - 1);
  score -= spread * 0.5;
  // Prefer shorter targets when score ties
  score -= Math.log(t.length + 1) * 0.4;
  return { score, positions };
}

export function highlight(target: string, positions: number[]): { text: string; hit: boolean }[] {
  if (!positions.length) return [{ text: target, hit: false }];
  const set = new Set(positions);
  const out: { text: string; hit: boolean }[] = [];
  let buf = "";
  let curHit = set.has(0);
  for (let i = 0; i < target.length; i++) {
    const hit = set.has(i);
    if (hit !== curHit && buf) {
      out.push({ text: buf, hit: curHit });
      buf = "";
    }
    curHit = hit;
    buf += target[i];
  }
  if (buf) out.push({ text: buf, hit: curHit });
  return out;
}
