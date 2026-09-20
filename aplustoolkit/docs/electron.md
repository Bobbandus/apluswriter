# Desktop-appen (`aplusdesktop/`)

Ett Electron-skal runt samma webbapp. Det innehåller ingen produktlogik. Det finns
för det en webbläsarflik inte kan:

- **Appen bär med sig hela webbappen.** Den startar en egen Next-server på en
  loopback-port vid start, så den fungerar utan dev-server och utan internet.
- **Ett klick kopplar in Claude Desktop** (Inställningar → Skrivande → Claude Desktop,
  eller menyn *Claude*). Appen frågar först, sparar en säkerhetskopia av
  `claude_desktop_config.json` och rör aldrig andra servrar. Går filen inte att läsa
  rör den den inte alls.
- Ett riktigt fönster med macOS-lika titelrad (riktiga fönsterkontroller, ingen falsk).
- Filer sparas via operativsystemets sparadialog.
- Hittar MCP-bryggan automatiskt via `~/.aplus-write/bridge.json`.
- **Uppdaterar sig själv** från GitHub Releases.

## Köra under utveckling

```bash
npm run dev          # webbappen, port 3000
npm run desktop      # Electron-fönstret (i en annan terminal)
```

`APLUS_URL=https://…` pekar skalet på en annan adress och vinner alltid över den
inbyggda servern. Finns ingen byggd bunt faller skalet tillbaka på `localhost:3000`.

## Bygga installern

```bash
npm run desktop:build   # webbappen + MCP-servern + ikonen -> aplusdesktop/bundle (75 MB)
npm run desktop:dist    # -> aplusdesktop/release/A-Plus-Toolkit-Setup.exe (107 MB)
```

`desktop:build` bygger i en egen mapp (`APLUS_DIST_DIR`), så en dev-server som kör
blir aldrig överskriven. Supabase-nycklarna bakas in vid bygget och läses från
`aplusweb/.env.local` — bygger du utan dem får den färdiga appen ingen inloggning.

Filnamnet är avsiktligt utan versionsnummer, så sajten kan länka till samma adress:

```
https://github.com/Bobbandus/apluswriter/releases/latest/download/A-Plus-Toolkit-Setup.exe
```

**Osignerad.** Windows visar en SmartScreen-varning första gången ("Mer info" →
"Kör ändå"). Det kostar pengar att signera och är okej för internt bruk.

## Hur bunten är byggd

`aplusdesktop/bundle/` innehåller Next-servern, dess beroenden, den byggda MCP-servern
och en liten `aplus-app.json` som säger var varje sak ligger. Två saker är värda att
veta innan du ändrar något:

- Mappen heter **inte** `app`. Electron tolkar `resources/app` som en uppackad
  applikation, och vi skeppar en asar.
- Beroendeträdet heter **inte** `node_modules`. electron-builder plockar bort varje
  mapp med det namnet ur `extraResources`, vilket gjorde att servern inte hittade
  Next och dog direkt. Det heter `modules`, och skalet pekar `NODE_PATH` dit.

Servern startas genom Electrons egen binär med `ELECTRON_RUN_AS_NODE`, så ingen
behöver ha Node installerat.

## Uppdateringar

Appen letar efter uppdateringar vid start och var fjärde timme, laddar ner i
bakgrunden och lägger in dem när du stänger appen. Den avbryter dig aldrig mitt i en
scen. Under *Hjälp* finns versionen och **Sök efter uppdateringar …**, som är det enda
stället där en uppdatering öppnar en dialogruta — för då har du frågat.

### Prova uppdateringen utan att göra en release

`APLUS_UPDATE_URL` pekar uppdateraren på en vanlig statisk mapp i stället för GitHub.
Hela vägen går därför att köra lokalt:

1. Bygg version A, lägg installern åt sidan.
2. Höj `version` i `aplusdesktop/package.json`, bygg version B.
3. Servera B:s `latest.yml` och `.exe` från en statisk server på `127.0.0.1`.
4. Installera A, starta den med `APLUS_UPDATE_URL=http://127.0.0.1:8899`.
   Med `APLUS_UPDATE_TEST=1` startar den om direkt i stället för att vänta på att du
   stänger appen, och skriver `APLUS_UPDATE_DOWNLOADED <version>` till stdout.
5. Kontrollera att den installerade `.exe` har blivit version B.

Det här är gjort och fungerade: 0.1.0 → 0.1.1, tyst, utan att någon klickade.

## Säkerhet

`contextIsolation` på, `nodeIntegration` av, `sandbox` på. Sidan får fyra anrop och
inget mer: `bridgeInfo`, `saveFile`, `setupClaude`, `platform`. Länkar till andra
sajter öppnas i den vanliga webbläsaren, och navigering bort från appens egen adress
stoppas.

## Kvar

- Mac-bygge (kräver en Mac eller GitHub Actions).
- Filsystemsadapter för `.fountain`-filer direkt på disk (lokal lagring ligger i
  IndexedDB tills dess).
- MCPB-tillägg, så att Claude Desktop kopplas in med ett dubbelklick.
