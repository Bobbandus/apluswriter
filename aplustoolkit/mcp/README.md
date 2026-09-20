# A+ Write — MCP-server

Koppla dina manus till Claude Desktop. Servern kör samma parser som appen, så
Claude ser exakt det du ser: samma scener, samma rollfigurer, samma metadata.

## Koppla in

**Desktop-appen (enklast):** Inställningar → Skrivande → *Claude Desktop* →
**Koppla in …**. Välj din manusmapp, bekräfta, starta om Claude Desktop.

**För hand:**

1. `npm install && npm run mcp:build` (ger `mcp/dist/server.mjs`).
2. Lägg till i `%APPDATA%\Claude\claude_desktop_config.json` (Windows) eller
   `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac):

```json
{
  "mcpServers": {
    "aplus-write": {
      "command": "node",
      "args": [
        "C:\\Users\\du\\...\\apluswrite\\aplustoolkit\\mcp\\dist\\server.mjs",
        "C:\\Users\\du\\Documents\\Manus"
      ]
    }
  }
}
```

3. Starta om Claude Desktop helt. Flera manusmappar: lägg till fler sökvägar.

## Live med appen

Servern lyssnar också lokalt (127.0.0.1) och den öppna appen kopplar upp sig
automatiskt. Då ser Claude vad du har öppet och markerat, och förslag dyker upp
som **kort** i fliken *Förslag* i appen. Inget ändras i manuset förrän du klickar
**Använd**. Webbappen måste köra på `localhost`. Den hostade versionen når inte
din dator.

## Färdiga kommandon (skriv `/` i Claude Desktop)

shotlist · whats_next · breakdown · structure · voice_check · logline · schedule ·
continuity · difficulty · casting_call · format_check

## Regeln

**Claude skriver aldrig om ditt manus på eget initiativ**, och "förbättrar" aldrig
något du inte frågat om.

Ber du om en omskrivning kommer den som ett **kort med diff** — gammal text i rött,
ny i grönt. Ingenting ändras förrän du klickar **Använd**, och Ctrl+Z tar tillbaka
det. Gränsen går alltså inte vid *att* Claude kan skriva, utan vid att ingenting
når sidan utan ett klick från dig.

Resten står kvar: förslag är data som appen ritar, formatfix kontrolleras två
gånger och avvisas om ett enda ord ändras, och de verktyg som skriver rakt ner i
en fil når bara synopsis, scenmetadata, anteckningar och blankrader. Sökvägar är
låsta till dina manusmappar.

**Hantverksreglerna.** Claude följer en fast lista när den skriver: din röst och
din genre, ingen pålagd dystrare ton, inga AI-klyschor ("Han vet mer än han ska",
"Något är fel", scener som slutar i en tyst blick). Listan står i
[`src/craft.ts`](src/craft.ts) och följer med både serverns instruktioner och de
verktyg som kan ändra ord — lägg till nya rader där om du ser något som skaver.
