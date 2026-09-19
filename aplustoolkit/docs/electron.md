# Desktop-appen (`aplusdesktop/`)

Ett tunt Electron-skal runt samma webbapp. Det innehåller ingen produktlogik. Det
finns för det en webbläsarflik inte kan:

- **Ett klick kopplar in Claude Desktop** (Inställningar → Skrivande → Claude Desktop,
  eller menyn *Claude*). Appen frågar först, sparar en säkerhetskopia av
  `claude_desktop_config.json` och rör aldrig andra servrar. Går filen inte att läsa
  rör den den inte alls.
- Ett riktigt fönster med macOS-lika titelrad (riktiga fönsterkontroller, ingen falsk).
- Filer sparas via operativsystemets sparadialog.
- Hittar MCP-bryggan automatiskt via `~/.aplus-write/bridge.json`.

## Köra

```bash
npm run dev          # webbappen, port 3000
npm run desktop      # Electron-fönstret (i en annan terminal)
```

`APLUS_URL=https://…` pekar skalet på en annan adress.

## Säkerhet

`contextIsolation` på, `nodeIntegration` av, `sandbox` på. Sidan får fyra anrop och
inget mer: `bridgeInfo`, `saveFile`, `setupClaude`, `platform`. Länkar till andra
sajter öppnas i den vanliga webbläsaren.

## Kvar innan ett installationsprogram

- Paketera webbappen (`next build` standalone) och MCP-servern som resurser, så att
  fönstret inte behöver en dev-server.
- `electron-builder` för .exe / .dmg.
- Filsystemsadapter för `.fountain`-filer direkt på disk (lokal lagring ligger i
  IndexedDB tills dess).
