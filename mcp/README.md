# A+ Write — MCP server

Plug your screenplays into a Claude Desktop session.

It runs the same parser the app does, so Claude sees exactly what the editor
sees: the same scene boundaries, the same character tables, the same Fountain+
metadata. No copy-pasting a 150 KB script into a chat.

---

## Setup

**1. Build it.** Once, from the repository root:

```bash
npm install && npm run mcp:build
```

That produces `mcp/dist/server.mjs` — a single bundled file with no runtime
dependencies beyond Node 20+.

**2. Point Claude Desktop at it.** Open the config file:

| Platform | Path |
|---|---|
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |

Add the server, with one or more directories holding your `.fountain` files:

```json
{
  "mcpServers": {
    "aplus-write": {
      "command": "node",
      "args": [
        "C:\\Users\\you\\apluswrite\\mcp\\dist\\server.mjs",
        "C:\\Users\\you\\Documents\\Manus"
      ]
    }
  }
}
```

Pass several directories by adding more arguments. Paths must be absolute.

**3. Restart Claude Desktop.** Ask it to list your scripts.

---

## What it can do

### Reading

| Tool | What it gives you |
|---|---|
| `list_scripts` | Every screenplay in the configured directories |
| `get_outline` | Scene-by-scene: heading, location, time of day, synopsis, who speaks, estimated pages |
| `get_scene` | One scene's full text, elements and metadata |
| `read_script` | The whole Fountain source |
| `get_characters` | Cue counts, spoken word counts, scenes present, extensions used |
| `get_locations` | Locations merged across INT/EXT and times of day |
| `get_stats` | Counts, runtime estimate, dialogue-to-action ratio per scene |
| `get_todos` | Every unresolved `[[todo: …]]` |
| `search_script` | Find text, scoped to an element type or one character's dialogue |
| `get_character_sides` | Only the scenes a character appears in |

Start with `get_outline`. A feature is 150 KB, and reading all of it to answer
a question about one scene wastes most of the context window.

### Writing

| Tool | What it changes |
|---|---|
| `set_scene_synopsis` | The `= synopsis` line under a heading |
| `set_scene_metadata` | Colour, status, beat, cast — written as Fountain notes |
| `add_note` | A `[[note]]` or `[[todo:]]` under a heading |
| `reformat_script` | Blank lines between elements. Element text is never touched |

---

## What it deliberately cannot do

**Nothing here can modify a line of action or dialogue.** Not behind a flag,
not with a confirmation prompt. The write tools reach synopses, metadata notes
and whitespace, and that is the whole surface.

This is the rule the product was built around: a writer's prose is theirs. A
tool that can quietly rewrite it is a tool you cannot leave running, and the
moment you have to audit every session the tool has stopped saving you time.
Structural work — outlining, tagging, breaking down, reporting — is genuinely
useful and carries none of that risk.

If you want Claude to rewrite a scene, ask it in the chat and paste the result
in yourself. That keeps the decision where it belongs.

**Paths are sandboxed** to the directories you configure. A request for
anything outside them is refused rather than resolved — the server is driven by
a model reading paths out of a conversation, so it does not assume the caller
is being careful.

---

## Things to ask it

- "What's the outline of Jonathan II?"
- "Which scenes has Vilde got, and how many lines does she have compared to Noa-Li?"
- "Which locations do we shoot at night? Group them for scheduling."
- "Find every scene with more than 80% dialogue."
- "Write a one-line synopsis for each scene in act two and save them."
- "Tag scene 14 as locked and mark it the midpoint."
- "Give me Vilde's sides."
