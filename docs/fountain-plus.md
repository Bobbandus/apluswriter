# Fountain+

A+ Write reads and writes **100% valid Fountain 1.1**. Every file it saves
opens correctly in Highland, Beat, Slugline or Final Draft.

Everything A+ Write knows beyond the screenplay itself — which scene is locked,
who is in it, what props it needs — lives inside Fountain **notes**, `[[ … ]]`.
Other apps understand notes and ignore them. So a file written here loses
nothing when someone else opens it, and nothing in it changes how the script
reads on the page.

That is the whole design rule: **if an extension would change what an actor
reads, it does not go in.**

---

## Scene metadata

Written on the heading line, or on their own lines directly underneath it.

```fountain
INT. SKOLMATSAL - DAG [[id: s_8f2k]]
[[CAST: Vilde, Noa-Li]]
[[LOCATION: Skolmatsal. Statister i orange overaller.]]
[[color: blue]]
[[status: locked]]
[[beat: Midpoint]]
[[#prop Revolver]]
[[#wardrobe Orange overall]]

Vilde ställer sig upp.
```

| Extension | Purpose | Values |
|---|---|---|
| `[[id: s_8f2k]]` | Stable scene identity | Auto-inserted, hidden in the editor |
| `[[CAST: …]]` | Non-speaking cast present | Comma-separated |
| `[[LOCATION: …]]` | Location note for the breakdown | Free text |
| `[[color: …]]` | Scene colour | `none` `red` `orange` `yellow` `green` `blue` `purple` `gray` |
| `[[status: …]]` | Draft state | `draft` `revised` `locked` |
| `[[beat: …]]` | Story-structure marker | Free text, e.g. `Midpoint` |
| `[[todo: …]]` | Writer to-do | Free text. Collected in the to-do panel; warned about before export |
| `[[#kind value]]` | Production tag | `#prop` `#sfx` `#wardrobe`, or any kind you invent |

**Why scene ids.** Scenes get renamed, reordered and renumbered constantly. An
id means a note, a colour or a revision mark stays attached to *that scene*
rather than to "the fourth one", which stops being true the moment an act gets
restructured.

Anything in `[[ … ]]` that isn't one of these stays an ordinary writer's note
and shows in the margin. `[[remember to call the location scout]]` is not a
malformed extension; it is a note, and it is treated as one.

---

## Swedish sluglines

A+ Studios writes in Swedish, so Swedish reads as a first-class language rather
than as something to be translated first.

**Times of day.** Recognised alongside the English ones:

> DAG · NATT · KVÄLL · MORGON · FÖRMIDDAG · EFTERMIDDAG · SKYMNING · GRYNING ·
> SENARE · SAMMA · KONTINUERLIGT · SOLNEDGÅNG · SOLUPPGÅNG · MIDNATT

```fountain
INT. MATSAL - DAG
EXT. SKOLGÅRD – KVÄLL
INT. BIL - KONTINUERLIGT
```

En dashes and em dashes work as separators too, because Swedish keyboards
produce them freely and Word inserts them silently.

**This matters more than it looks.** A+ Write only splits a time of day off
when it recognises the word. The usual shortcut — split on the last dash —
turns `INT. HOUSE - KITCHEN` into a scene at "HOUSE" at a time of day of
"KITCHEN", and every location report built on that is wrong.

**Numbered headings.** Swedish drafts are often numbered in the text:

```fountain
2. INT. MATSAL - DAG
```

The leading number is lifted out and kept as the scene number, exactly as if it
had been written `INT. MATSAL - DAG #2#`. A leading number on a line that is
*not* a heading is left alone.

---

## Character bible and locations

Character profiles — age, description, arc notes, colour — and location notes
live in the database, not in the script. A screenplay is not the place for them
and other apps would have nowhere to put them.

They can optionally be exported as a trailing boneyard block so a single
`.fountain` file round-trips everything:

```fountain
/* aplus:meta {"characters":[…],"locations":[…]} */
```

The boneyard is invisible in every Fountain app, including this one. Export
without it if the file is going to a collaborator who does not need it.

---

## What happens in other apps

| In A+ Write | In Highland / Beat / Final Draft |
|---|---|
| Scene colour chip | A note (or nothing) |
| Cast chips under the slugline | A note |
| Production tag pills | A note |
| To-do panel entry | A note |
| Hidden scene id | A note |
| Beat marker | A note |
| Swedish slugline | An ordinary slugline |
| Numbered heading | A slugline with a scene number |

Nothing is lost, nothing is corrupted, and nothing reaches the page.

---

## Compatibility testing

Every extension is covered by parser tests in `lib/fountain/parse.test.ts`, and
the round-trip suite in `lib/fountain/serialize.test.ts` asserts that parsing a
file, writing it out and reading it back produces the identical script —
verified against Brick & Steel, Big Fish and The Last Birthday Card.
