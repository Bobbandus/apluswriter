# Desktop-appen (`aplusdesktop/`)

Ett Electron-skal runt samma webbapp. Det innehåller ingen produktlogik. Det finns
för det en webbläsarflik inte kan:

- **Appen bär med sig hela webbappen.** Den startar en egen Next-server på en
  loopback-port vid start, så den fungerar utan dev-server och utan internet.
- **Dubbelklick på en `.fountain`-fil** öppnar den. Installationen registrerar
  filtypen, avinstallationen tar bort den.
- **Ett klick kopplar in Claude Desktop** (Inställningar → Skrivande → Claude Desktop,
  eller menyn *Claude*). Appen öppnar ett **tillägg** (`.mcpb`) och Claude Desktop visar
  sin egen installationsruta, där du väljer manusmappen. Se "Claude-tillägget" nedan.
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

**Porten måste vara densamma i morgon.** Allt som inte ligger i molnet bor i
IndexedDB, och webbläsaren knyter det lagret till origin — alltså till porten.
Fram till 0.2.0 bad skalet OS:et om vilken ledig port som helst, vilket gav
varje start ett nytt origin och en tom app: gårdagens projekt låg kvar på disk
och gick aldrig att nå igen. Nu används 43117 (sedan 43118 …), den som
fungerade sparas i `port.json` i användarmappen, och porten byts bara om något
annat har tagit den.

## Uppdateringar

Appen letar efter uppdateringar vid start och var fjärde timme, laddar ner i
bakgrunden och lägger in dem när du stänger appen. Den avbryter dig aldrig mitt i en
scen. Under *Hjälp* finns versionen och **Sök efter uppdateringar …**, som är det enda
stället där en uppdatering öppnar en dialogruta — för då har du frågat.

När en version är nedladdad dyker en rad upp på projektsidan med en knapp som
startar om (`components/desktop/UpdatePill.tsx`). Den avbryter ingenting: låter
du den vara läggs uppdateringen in när du stänger appen ändå. Fram till 0.2.0
var hela kedjan tyst, vilket gjorde det omöjligt att se att den fungerade.
Versionen står också under Inställningar.

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

`contextIsolation` på, `nodeIntegration` av, `sandbox` på. Sidan får tretton anrop och
inget mer: `platform`, `bridgeInfo`, `saveFile`, `setupClaude`, `mirrorFolder`,
`mirrorChoose`, `mirrorClear`, `mirrorWrite`, `appInfo`, `restartToUpdate`,
`onUpdateReady`, `takeOpenFiles`, `onOpenFiles`. Länkar till andra
sajter öppnas i den vanliga webbläsaren, och navigering bort från appens egen adress
stoppas.

## Claude-tillägget

`npm run mcpb` (och `desktop:build`) packar MCP-servern som ett Claude Desktop-tillägg:
`aplusdesktop/release/aplus-toolkit.mcpb`, 283 kB. Det ligger också i appens bunt, så
"Koppla in" kan öppna det utan nedladdning, och publiceras på varje release.

Varför ett tillägg och inte en post i `claude_desktop_config.json`: Claude Desktop kör
tillägg med sin egen inbyggda Node, så ingen behöver ha Node installerat. Den visar sin
egen ruta med mappväljare, och det finns ingen konfigfil att sätta ett kommatecken fel i.

Manifestet valideras av `@anthropic-ai/mcpb` vid varje bygge.

**Reserv:** menyn *Claude → Koppla in via konfigurationsfil* gör som förut — frågar först,
sparar en säkerhetskopia och rör aldrig andra servrar. Har du en gammal manuell post
erbjuder installationen att ta bort just den (med säkerhetskopia), annars startar två
kopior av servern.

**Ej verifierat:** att flera manusmappar i mappväljaren skickas som flera argument. En
mapp fungerar. Prova med två när du kan, och säg till om den andra saknas.

## Publicera

En tagg `v*` bygger och publicerar via `.github/workflows/release.yml`. Publiceringen är
satt till `releaseType: release`. electron-builders standard är *utkast*, och ett utkast
syns varken för uppdateraren eller på den fasta nedladdningslänken.

## Kvar

- Mac-bygge (kräver en Mac eller GitHub Actions).
- Filsystemsadapter för `.fountain`-filer direkt på disk (lokal lagring ligger i
  IndexedDB tills dess).
