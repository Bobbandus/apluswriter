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

**Inget verktyg kan skriva om din beskrivning eller dialog.** Förslag är data som
appen visar. Det enda som redigerar text, formatfix, kontrolleras två gånger och
avvisas om ett enda ord ändras. Sökvägar är låsta till dina manusmappar.
