/**
 * The command palette's model: what a command is, and how a typed query picks
 * and orders them. No React here, so the ranking can be tested on its own.
 */

export interface Command {
  id: string;
  label: string;
  /** Heading it is listed under when nothing is typed. */
  group: string;
  /** Extra words that should find it ("pdf" for Export). Not shown. */
  keywords?: string;
  /** Shortcut hint, in the same notation as tooltips (`mod+e`). */
  shortcut?: string;
  run: () => void;
}

const normalise = (text: string) => text.toLowerCase().normalize('NFC');

/**
 * Commands that match every word of the query, best first.
 *
 * A word scores highest at the start of the label, next at the start of any
 * word in it, then anywhere in the label, and lowest in the hidden keywords.
 * Ties keep the order the commands were given in, which is the order the
 * writer sees them listed without a query.
 */
export function rankCommands(commands: readonly Command[], query: string): Command[] {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...commands];

  const scored: { command: Command; score: number; order: number }[] = [];

  commands.forEach((command, order) => {
    const label = normalise(command.label);
    const keywords = normalise(command.keywords ?? '');
    let total = 0;

    for (const word of words) {
      let score = 0;
      if (label.startsWith(word)) score = 4;
      else if (label.split(/[\s.\-–—/:]+/).some((part) => part.startsWith(word))) score = 3;
      else if (label.includes(word)) score = 2;
      else if (keywords.includes(word)) score = 1;
      if (score === 0) return; // every word has to match something
      total += score;
    }

    scored.push({ command, score: total, order });
  });

  return scored.sort((a, b) => b.score - a.score || a.order - b.order).map((entry) => entry.command);
}
