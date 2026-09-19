/**
 * Line diff.
 *
 * Used wherever the writer has to see two versions of their text side by side
 * and choose: the sync conflict sheet, the assistant's formatting fixes, and
 * revision compare. It is the `+` / `-` view a code review shows, because it
 * answers the only question that matters in those moments — what exactly
 * would change.
 *
 * A plain longest-common-subsequence over lines. Screenplays are a few
 * thousand lines at most, and the common prefix and suffix are trimmed first,
 * so the quadratic core only ever runs on the part that actually differs.
 */

export type DiffOp = 'same' | 'add' | 'remove';

export interface DiffLine {
  op: DiffOp;
  text: string;
  /** 1-based line number in the old text (for `same` and `remove`). */
  oldLine?: number;
  /** 1-based line number in the new text (for `same` and `add`). */
  newLine?: number;
}

/** Beyond this many differing lines, fall back to "all removed, all added". */
const MAX_CELLS = 4_000_000;

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;

  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }

  const out: DiffLine[] = [];
  for (let i = 0; i < start; i += 1) out.push({ op: 'same', text: a[i] ?? '', oldLine: i + 1, newLine: i + 1 });

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  if (midA.length * midB.length > MAX_CELLS) {
    midA.forEach((text, i) => out.push({ op: 'remove', text, oldLine: start + i + 1 }));
    midB.forEach((text, i) => out.push({ op: 'add', text, newLine: start + i + 1 }));
  } else {
    // LCS table, filled from the end so the walk below can go forwards.
    const rows = midA.length + 1;
    const cols = midB.length + 1;
    const table = new Uint32Array(rows * cols);
    for (let i = midA.length - 1; i >= 0; i -= 1) {
      for (let j = midB.length - 1; j >= 0; j -= 1) {
        table[i * cols + j] =
          midA[i] === midB[j]
            ? (table[(i + 1) * cols + j + 1] ?? 0) + 1
            : Math.max(table[(i + 1) * cols + j] ?? 0, table[i * cols + j + 1] ?? 0);
      }
    }

    let i = 0;
    let j = 0;
    while (i < midA.length || j < midB.length) {
      if (i < midA.length && j < midB.length && midA[i] === midB[j]) {
        out.push({ op: 'same', text: midA[i] ?? '', oldLine: start + i + 1, newLine: start + j + 1 });
        i += 1;
        j += 1;
      } else if (j < midB.length && (i >= midA.length || (table[i * cols + j + 1] ?? 0) > (table[(i + 1) * cols + j] ?? 0))) {
        // Ties go to removal, so a changed line reads '-old' then '+new'.
        out.push({ op: 'add', text: midB[j] ?? '', newLine: start + j + 1 });
        j += 1;
      } else {
        out.push({ op: 'remove', text: midA[i] ?? '', oldLine: start + i + 1 });
        i += 1;
      }
    }
  }

  for (let k = 0; k < a.length - endA; k += 1) {
    out.push({ op: 'same', text: a[endA + k] ?? '', oldLine: endA + k + 1, newLine: endB + k + 1 });
  }

  return out;
}

export interface DiffHunk {
  lines: DiffLine[];
}

/**
 * Groups a diff into hunks with a little context, dropping long unchanged
 * stretches — nobody needs to scroll past forty identical pages to find the
 * three lines that differ.
 */
export function hunks(diff: DiffLine[], context = 2): DiffHunk[] {
  const changed = diff.map((line) => line.op !== 'same');
  const keep = changed.map((_, i) => {
    for (let k = Math.max(0, i - context); k <= Math.min(diff.length - 1, i + context); k += 1) {
      if (changed[k]) return true;
    }
    return false;
  });

  const out: DiffHunk[] = [];
  let current: DiffLine[] | null = null;
  diff.forEach((line, i) => {
    if (keep[i]) {
      current ??= [];
      current.push(line);
    } else if (current) {
      out.push({ lines: current });
      current = null;
    }
  });
  if (current) out.push({ lines: current });
  return out;
}

/** How many lines were added and removed. */
export function diffStats(diff: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff) {
    if (line.op === 'add') added += 1;
    else if (line.op === 'remove') removed += 1;
  }
  return { added, removed };
}
