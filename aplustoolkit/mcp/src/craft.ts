/**
 * The rules that travel with every tool that can put words in the script.
 *
 * Asked to make a scene "deeper", a model reaches for the same handful of
 * moves every time: it darkens the tone, has someone hint at a secret, and
 * ends on a silent look. The writer here works in Swedish and often in
 * comedy, and none of that is what they asked for. Saying so once in a system
 * prompt is not enough — the reminder has to be in front of the model at the
 * moment it decides what to call, which is why this text is repeated into the
 * tool descriptions rather than only into the server instructions.
 *
 * One place, three audiences: the server instructions, the ready-made
 * commands, and the tool descriptions.
 */

/** The full list. Long on purpose: each line is a habit worth naming. */
export const CRAFT = [
  'Craft rules — they apply to every rewrite, alternative and new scene:',
  "(1) Write in the writer's own voice, vocabulary and genre. Comedy stays comedy. Never make a light scene darker, " +
    'heavier or "deeper" unless that is exactly what was asked for.',
  '(2) No ominous foreshadowing, and no darkness without resolution as a default setting. A scene should land: ' +
    'a decision, a laugh, a change, an answer.',
  '(3) Banned moves, in Swedish and in English: "Han vet mer än han ska" / "He knows more than he should"; ' +
    '"De borde inte vara så här stora" / "They should not be this big"; "Något är fel" / "Something is wrong"; ' +
    '"Det är aldrig bara X" / "It is never just X"; "Det här är större än vi tror" / "This is bigger than we think"; ' +
    '"Tystnad." as filler action; characters announcing their own feelings ("Jag är rädd att …" / "I am afraid that …"); ' +
    'every character speaking the same polished therapy language; neat rule-of-three lists; ' +
    '"inte X utan Y" / "not X but Y"; ending a scene on a silent look or a small moral.',
  '(4) Prefer subtext, concrete things, interruptions and evasions over abstractions. ' +
    'Keep the facts: names, plot, continuity, who knows what.',
].join(' ');

/** The same thing in one breath, for a tool description that must stay short. */
export const CRAFT_SHORT =
  "Craft rules apply: the writer's own voice and genre, no added darkness or ominous foreshadowing, no stock AI lines " +
  '("Han vet mer än han ska", "Något är fel", a scene ending on a silent look), subtext over abstractions, facts kept.';

/** What every ready-made command repeats, so a long conversation cannot drift out of it. */
export const RULES =
  "Rules: never rewrite the writer's dialogue or action on your own initiative, and never \"improve\" something they did " +
  'not ask about. When they do ask for a rewrite, use suggest_rewrite — it arrives as a diff card they must accept, and ' +
  'nothing changes until they do. Everything else goes through the other suggest_* tools, or is answered in the chat. ' +
  'Answer in the language the writer uses. Be concrete and brief; give reasons, not just verdicts.';

/** For the commands that do put words on the page. */
export const WRITING_RULES = `${RULES} ${CRAFT}`;

/**
 * The tools that can change the writer's words.
 *
 * `craft.test.ts` checks that each one exists and carries the reminder, so a
 * tool added later cannot quietly ship without it.
 */
export const WRITING_TOOLS = ['suggest_rewrite', 'suggest_alternatives', 'suggest_insert'] as const;
