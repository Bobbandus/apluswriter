# Överlämning till ny chatt

Skriven 2026-09-20. Uppdateras när en fas är klar. Klistra in prompten nedan i en ny chatt som öppnas i samma mapp.

## Prompt att klistra in

```
Du fortsätter på A+ Toolkit (mappen aplustoolkit/). Jag skriver svenska, svara på svenska.

Gör så här innan du gör något annat:
1. Läs aplustoolkit/docs/handoff.md, aplustoolkit/PLAN.md och aplustoolkit/ideas.txt. Föreslå aldrig något som redan står där.
2. Kör `git status`, `git log --oneline -10` och `npm run check` (i aplustoolkit/) och berätta kort vad som är grönt eller rött. Det kan ligga halvfärdigt arbete från andra AI-verktyg i trädet.
3. Ta första delfas som inte är ikryssad i listan "Faser" i handoff.md. Bygg en delfas i taget: tester först, sedan koden, sedan `npm run check` (och `npm run build` om webben rörts), commit, push till main. En push till main deployar toolkit.aplusfilm.se, så håll bygget grönt.
4. Innan nytt större arbete: ställ många ja/nej-frågor i omgångar (max fyra per omgång, kryssrutor för funktionslistor, rekommenderat val först). Hellre för många än för få. Du får överklaga ett avslag, men bara en gång och med en konkret anledning.
5. Håll det minimalistiskt: extra funktioner är av som standard bakom en knapp. Inga taggar eller releaser utan att jag säger till.

Claude får skriva om min text bara när jag ber om det, alltid som diff-kort jag måste godkänna, och aldrig med typiska AI-klyschor (se "Craft-regler" i handoff.md).
```

## Recap (kort)

**Vad det är.** A+ Toolkit är A+ Studios verktygslåda: **Plan** (Write finns, Shotlist/Casting är Kommer-sidor), **Shoot** och **Live** (inget byggt). Allt ligger i `aplustoolkit/`. Next.js-webbapp i `aplusweb/`, delad logik i `packages/`, MCP-server för Claude Desktop i `mcp/`, Electron-skal i `aplusdesktop/`, Supabase-SQL i `supabase/`. Sajten: https://toolkit.aplusfilm.se (Vercel ← GitHub `Bobbandus/apluswriter`). **En push till `main` deployar.**

**Grundprinciper (PLAN.md).** Texten är sanningen (ren Fountain). Förlora aldrig ett ord. Tangentbord först. Export ska funka i Highland/Beat/Final Draft. Svenska är förstaspråk. Nytt: **minimalism**, extra är av som standard.

**Läget vid överlämningen.**
- Gemini lämnade halvfärdigt: `suggest_rewrite` (MCP + protocol + apply + kort), en buggig ordboks-effekt, och `sections` i `indexes.ts` som inte kompilerade.
- `.env.local` låg i fel mapp. Next läser env från `aplusweb/`, inte `aplustoolkit/`. Därför syntes ingen inloggning.
- MCP-serverns instruktioner sa fortfarande "skriv aldrig om", vilket är varför Claude vägrade skriva om dialog.
- Desktop-skalet laddar bara `http://localhost:3000` och saknar installer.

**Beslut.**
- Claude får skriva om/skriva nytt **på begäran**, alltid som diff-kort; inget ändras före **Använd**, Ctrl+Z tar tillbaka.
- Ordlistan sparar en roll/plats **först när den är färdig**: roll = färdig replik under + markören har lämnat raden; plats = rubrik med tid på dygnet + markören har lämnat raden. "E" som halvskriven plats ska aldrig hänga kvar.
- Installer: Windows `.exe` (NSIS), Next-servern bundlad, **auto-uppdatering som bevisas** (lokalt test + riktig release), nedladdning via GitHub Releases, knapp/banner på sajten (dold i desktop).
- Claude-koppling via **MCPB-tillägg** (dubbelklick, Claude Desktops egen Node), config-metoden kvar som reserv.
- Konton: magic link, konto-knapp på alla sidor, **nyregistrering stängd** i Supabase, inbjudan manuellt.
- Med i screenwriting: kommandopalett, stavningskontroll, sök & ersätt, Att göra-panel, auto-ögonblicksbilder, synk av shotlists/profiler/ordlista, spegling till `.fountain`-filer, skrivpass, import FDX/Highland/Word, export FDX/HTML/rapporter, titelsidesformulär, delning + kommentarer + roller, scenalternativ (A/B), rollrelationskarta, story-dagar, ton- & energikurva (dold), M7 (indexkort, sektioner), M8 (revisioner).
- Efter screenwriting: **Plan → Produktion** (shotlist, stripboard, callsheet, rekvisita). Shoot behåller on-set-verktyg.
- Senare, endast i `ideas.txt`: bordsläsning/replikträning, pitch-PDF, Discord-bot/webhook, filmklappa, Casting, Live, realtidsskrivning.
- Avslagna: inline-diff i texten, beat-tavla, Fråga-Claude-meny, Google Kalender.

**Craft-regler (Claude ska följa vid omskrivning).** Lever i `mcp/src/craft.ts` och vaktas av `mcp/src/craft.test.ts`. Lägg till rader där om du ser något som skaver.
- Skriv i skribentens röst, ordförråd och genre. Komedi förblir komedi. Gör inte en lätt scen mörkare eller "djupare" om det inte efterfrågats.
- Ingen olycksbådande förkänsla eller mörker utan upplösning som standard. En scen ska landa.
- Förbjudet: "Han vet mer än han ska", "De borde inte vara så här stora", "Något är fel", "Det är aldrig bara X", "Tystnad." som utfyllnad, karaktärer som deklarerar sina känslor, samma putsade terapispråk hos alla, snygga tretal, "inte X utan Y", scenslut på en tyst blick eller en sensmoral.
- Föredra subtext, konkreta saker och avbrott framför abstraktioner. Behåll namn, handling, kontinuitet.
- Läs projektets "Stil & ton" innan varje omskrivning.

## Faser

Ta en delfas i taget. Markera `[x]` här när den är pushad.

**Fas 0 — Lås upp**
- [x] 0.0 Minne, `handoff.md`, `ideas.txt`, `PLAN.md`
- [x] 0.1 Bygget grönt (`sections` i `Script`)
- [x] 0.2 Inloggning (env-mapp, konto-knapp på alla sidor, Supabase-guide)
- [x] 0.3 Ordboken: spara först när färdig (E-buggen)
- [x] 0.4 MCP-instruktioner + craft-regler (`mcp/src/craft.ts`)

**Fas 1 — Claude får skriva**
- [x] 1.1 `suggest_rewrite` med flera ändringar per kort
- [x] 1.2 `suggest_alternatives`
- [x] 1.3 `suggest_insert` (ny scen, visas som grönt block)
- [x] 1.4 Stil & ton per projekt
- [x] 1.5 Nya kommandon i Claude Desktop (`rewrite`, `alternatives`, `new_scene`, `polish_dialogue`)

**Fas 2 — Installer + auto-uppdatering**
- [x] 2.1 Bygg-kedja (Next standalone)
- [x] 2.2 Desktop startar inbyggd server
- [x] 2.3 electron-builder, ikon, NSIS — `npm run desktop:build` sedan `npm run desktop:dist`, ger `aplusdesktop/release/A-Plus-Toolkit-Setup.exe` (107 MB)
- [x] 2.4 Auto-uppdatering + bevis A (lokalt, 0.1.0 → 0.1.1 bevisat)
- [~] 2.5 GitHub Actions klar (`.github/workflows/release.yml`). Kvar: bevis B — kräver att du lägger in secrets och taggar. Se "Släppa en version".
- [x] 2.6 MCPB-tillägget (`scripts/build-mcpb.mjs`, validerat och uppackat + kört) och nedladdningsbannern. Ej verifierat: Claude Desktops installationsruta, och flera mappar i mappväljaren.

**Fas 3 — M7 Struktur:** [x] 3.1 sektioner i navigator (`packages/fountain/outline.ts`) · [x] 3.2 `reorderScenes` (`packages/fountain/structure.ts`) · [x] 3.3 indexkort med drag (`components/cards/`) · [x] 3.4 roll-/platspaneler + relationskarta (`components/cast/`, `packages/fountain/relations.ts`) · [x] 3.5 Att göra-panel (`components/todos/`, `packages/fountain/todos.ts`)

**Fas 4 — M8 Revisioner:** [x] 4.1 lagring (`packages/fountain/revisions.ts`, store i `local.ts`; molnsynk av revisioner kvar) · [x] 4.2 versionsmeny + auto-ögonblicksbilder (`components/revisions/`, `lib/storage/useRevisions.ts`) · [x] 4.3 PDF-asterisker (`packages/export/revisionMarks.ts`) · [x] 4.4 scenalternativ (`packages/fountain/alternatives.ts`, `components/alternatives/`) · [ ] 4.5 MCP-läsverktyg (kräver request/response i bryggan: revisionerna bor i webbläsaren, inte i MCP-servern)

**Fas 5 — M9 Import/export:** [~] FDX ut klar (`packages/export/fdx.ts`, betoning fet/kursiv/understruken som stilade körningar, både ut och in) · [x] HTML ut (`html.ts`) · [x] rapporter CSV (`reports.ts`: scener, roller, platser) · [x] rollsidor som PDF (`serializeSides(..., {numbered:true})` i exportens "Bara en roll"; manusets egna scennummer, ingen titelsida/ändringsmarkering) · [x] FDX in (`packages/fountain/importFdx.ts`, via Importera fil; ingen förhandsgranskning eftersom det alltid blir ett nytt projekt; rundtur mot exporten testad på Big Fish) · [x] Highland + Word in (`packages/fountain/importZip.ts`, `fflate`; Highland är säker, Word är gissningar från versaler/indrag, ger alltid nytt projekt; verifierat i webbläsaren) · [x] titelsidesformulär (`packages/fountain/titlePage.ts`, `TitlePageSheet`, öppnas från exportarket; okända nycklar som Revision lämnas orörda)

**Fas 6 — M10 Polish:** [x] kommandopalett (`lib/commands.ts`, `CommandPalette`, Ctrl+K: scener, sektioner, ark, vyer) · [x] sök & ersätt (`packages/fountain/findReplace.ts`, `FindReplace`, Ctrl+F/Ctrl+H; omfång hela/scen/rolls repliker; versal träff förblir versal så en replikrubrik förblir en) · [x] stavningskontroll (inställning, av som standard; bara dialog/beskrivning via radattribut; Electron: sv + en-US och högerklicksmeny med förslag i `main.cjs`, ej provkört i skalet, namn ur ordlistan läggs inte in ännu) · [ ] **▶ NÄSTA:** datasynk · [x] spegling till filer (`aplusdesktop/mirror.cjs` + IPC i `main.cjs`/`preload.cjs`, `useMirror`, Inställningar; modulen testad mot temp-mapp och webbsidan mot en låtsasbrygga, själva IPC:n ej provkörd i skalet; skriver aldrig över filer appen inte äger) · [x] skrivpass + dagens ord (`lib/writing.ts`, `useWritingStats`, `WritingPill`; av som standard, slås på via Ctrl+K "ordräknare"/"skrivpass"; fokusläge fanns redan) · [ ] delning/kommentarer/roller · [x] story-dagar + energikurva (`[[day: N]]`, `[[energy: N]]`; `packages/fountain/timeline.ts`, `TimelineSheet` via Ctrl+K "tidslinje"; Claude kan föreslå dag/energi via `suggest_metadata`-kort, aldrig utan Använd)

**Fas 7 — Putsning** efter varje fas (skärmdumpar Ljust/Mörkt/Midnatt, desktop + mobil).
  - Gjort: accent himmelsblå (`--brand-blue` i `styles/tokens.css`), vinröd för Shoot/Live via `data-tool`; titelraden utan fokusknapp (Ctrl+Skift+F finns kvar) och utan versionspill tills en version finns (Ctrl+K → versioner); sparstatus bara en prick när allt är sparat; inspektorn utan rollknapp och med en rad i stället för faktarutan; dashboardens inloggningsrad kan stängas.
  - Lock-in (användaren godkände alla förslagen): klart = fokusläget (Ctrl+Skift+F) dämpar allt utom stycket, håller markörraden mitt i bild (typewriter) och tonar ut titelraden tills musen når övre kanten; Ctrl+Skift+↑/↓ flyttar scenen markören står i. Också klart: Ctrl+Skift+N snabbanteckning (`[[todo:]]` sist på raden), "Fortsätt skriva" på dashboarden, och i Ctrl+K: fokusläge, dämpning (stycke/scen/av), typewriter (fokus/alltid/av), öppna alltid i fokusläge (`lib/focusPrefs.ts`). Ren text-läge klart (Ctrl+K "ren text", `data-plain`). Kvar: (ren text-tema klart) utan pappersyta, Claude-fliken utan avbrott (redan bara en prick), Tab mellan elementtyper (kolla att elementFlow gör det).
  - Kvar (användarens val: mellan måttligt och hårt, aldrig för mycket på skärmen): skärmdumpsgenomgång i Ljust/Midnatt och mobil, ark (samma layout i export/titelsida/sök/tidslinje/inställningar), navigatorn, elementraden över sidan (överlappar sidan i smal bredd), Gemini-rester av inline-stilar.

**Därefter:** Plan → Produktion, Casting, Live, realtid. Beredskapsanalysen ("Are we ready?") står i `PLAN.md` §5c.

## Nästa gång, först

1. **Starta om dev-servern** om den står och svarar 500 (`Ctrl+C`, sedan `npm run dev`). Det händer om ett bygge har skrivit över `.next` medan servern kört. Kör alltid bygge och kontroll med `APLUS_DIST_DIR=.next-verify npm run build` så delar de aldrig mapp med en dev-server.
2. **Ögna i webbläsaren när du är vid datorn** (inget av det blockerar arbetet):
   - konto-knappen uppe till höger på `/`, `/plan`, `/plan/write` och att `/login` renderar formuläret;
   - ordboken: skriv en ny roll bokstav för bokstav, radera, och kontrollera att inga halva namn ligger kvar i Manusordlistan (Inspektorn → ikonen Rollfigurer).
3. **Starta om Claude Desktop** en gång — MCP-servern är ombyggd, och det är omstarten som gör att Claude börjar skriva om när du ber om det. Skriv in din stil under Inställningar → Skrivande → Stil & ton, så läser Claude den före varje omskrivning. Prova sedan /rewrite, /alternatives, /new_scene, /polish_dialogue, eller "skriv om dialogen i scen 1 så den blir vassare" (ett kort med en ändring per rad, kryssa i det du vill ha) och "ge mig tre varianter av Vildes sista replik".
4. Kör `npm run check`, ta sedan nästa delfas. Det som är kvar är av den sorten som kräver dig vid datorn: **datasynk** (molnsynk av projektdata/ordlista, kräver att Supabase-stegen ovan är gjorda), **delning/kommentarer/roller** (samma), **4.5 MCP-läsare för revisioner** (revisioner ligger i webbläsarens IndexedDB, så det kräver en fråga/svar-runda över bryggan) och **Fas 7 putsning** (skärmdumpar i Ljust/Mörkt/Midnatt, desktop och mobil).
5. Provkör det jag inte kunnat: Ctrl+K, Ctrl+F/Ctrl+H, Stavningskontroll (Inställningar → Skrivande) och "Spegla manus till filer" i den installerade appen; öppna en riktig `.fdx`, `.docx` (gissar) och `.highland`; skriv ut rollsidor för en skådespelare (Exportera → Bara en roll).

## Släppa en version (fas 2.5, kräver dig)

1. Lägg in repo-secrets på GitHub (se nedan). Utan dem stoppar bygget med ett tydligt fel i stället för att skeppa en app utan inloggning.
2. Höj `version` i `aplustoolkit/aplusdesktop/package.json`, committa.
3. `git tag v0.1.0 && git push origin v0.1.0`. Taggen måste stämma med versionen — workflowen vägrar annars.
4. Actions bygger installern och lägger den som en release. Länken blir densamma varje gång:
   `https://github.com/Bobbandus/apluswriter/releases/latest/download/A-Plus-Toolkit-Setup.exe`
5. Installera, höj versionen igen, tagga igen — appen ska uppdatera sig själv. Det är bevis B.

## Det du måste göra själv

- **Supabase** (Authentication): URL Configuration → Site URL `https://toolkit.aplusfilm.se`, Redirect URLs `http://localhost:3000/auth/callback` och `https://toolkit.aplusfilm.se/auth/callback`. Sign In / Providers → stäng av *Allow new users to sign up*. Users → *Invite user* för varje kollega.
- **Vercel** → Project → Settings → Environment Variables: `NEXT_PUBLIC_SUPABASE_URL` och `NEXT_PUBLIC_SUPABASE_ANON_KEY`, sedan redeploy (värdena bakas in vid bygge).
- **GitHub** → Settings → Secrets and variables → Actions → *New repository secret*: `NEXT_PUBLIC_SUPABASE_URL` och `NEXT_PUBLIC_SUPABASE_ANON_KEY` (samma värden som i `aplusweb/.env.local`). Behövs för att installern ska ha inloggning.
- Starta om Claude Desktop efter att MCP-servern byggts om. Installationsrutan för `.mcpb` bekräftar du själv.

## Fällor

- Env-filer läses från `aplusweb/`. `aplusweb/.env.local` är rätt plats.
- `gh` finns inte på datorn. Releaser byggs av GitHub Actions på en `v*`-tagg.
- Windows Developer Mode är av. Om electron-builder klagar på symlänkar: slå på det (Inställningar → System → För utvecklare) eller sätt `signAndEditExecutable: false`.
- Osignerad installer ger en SmartScreen-varning första gången ("Mer info" → "Kör ändå"). Okej för internt bruk.

## Beslutat 2026-09-20 (frågeomgång, gör i den här ordningen när usage finns)

Ordning: **skrivupplevelsen först**, sedan Shoot/Live, molnet (datasynk, delning) sist.

- **Claude (bara kort, aldrig ändring före Använd; klart 2026-09-20 som kommandon i Claude Desktop: `read_aloud`, `scene_goals`, `ask_selection` i `mcp/src/assistant.ts`, bygg om med `npm run mcp:build` och starta om Claude Desktop):** läs högt-feedback (stela repliker, alla låter lika), scenmål-koll (mål, hinder, förändring per scen), fråga-Claude på markering (markera, tangent, skriv fråga, svar som kort). Nej till: kontinuitetskoll, autouse för småsaker (reglerna i ideas.txt står fast).
- **Skriva:** dubbel dialog (`^`, med sidvisning och export), minnesbubblor (taggar i noter, listade i inspektorn). Nej till: snabbtecken `//`, parkeringsruta.
- **UI:** ren text-tema (läge oberoende av färgtema), mobil skrivvy (klart: under 900 px startar panelerna stängda och öppnas med sina knappar utan att ändra desktop-valet; snabbanteckning finns i Ctrl+K), splittvy, egna genvägar (klart: Ctrl+K "genvägar", `lib/shortcuts.ts`, krockskydd och reserverade tangenter; dubbel dialog klar: Ctrl+Skift+D + FDX). **Teman: Ljust, Mörkt, System (auto). Midnatt är borttaget och System finns (klart 2026-09-20; `lib/theme.ts`, `data-theme-pref`).**
- **Shoot:** klappa och logga tagningar (scen, tagning, anteckning, per dag, export). **Live:** overlay för OBS (webbsida som lager, operatörsvy). Nej för nu: dagens inspelningslista, bordsläsning.
- **Release:** jag får tagga v0.1.0 själv när nästa större del är klar och checklistan ovan är grön; be då bara användaren provköra installern.

## Läge 2026-09-20: v0.1.0

Allt som är planerat för skrivvyn är byggt: import/export (FDX, Highland, Word, rollsidor, titelsida), kommandopalett, sök och ersätt, stavningskontroll, ordräknare, story-dagar och energi, spegling till .fountain (desktop), fokusläge (dämpning, typewriter), snabbanteckning, dubbel dialog, egna genvägar, teman Ljust/Mörkt/System, ren text-läge, telefonbredd, Claude-kommandon (kort, aldrig ändring före Använd).

Medvetet inte gjort (ur "färdigt nu", inte för många features): splittvy, minnesbubblor, Shoot (klappa/logga), Live (OBS-overlay), datasynk och delning/kommentarer/roller, MCP-läsare för revisioner. De ligger kvar i listorna ovan.

**Taggad v0.1.0.** Release-flödet (`.github/workflows/release.yml`) stannar med ett tydligt fel om repo-secrets `NEXT_PUBLIC_SUPABASE_URL` och `NEXT_PUBLIC_SUPABASE_ANON_KEY` saknas, och publicerar Windows-installern om de finns. Det som kräver användaren: lägg in de två secrets (och kör om workflowen), Supabase-stegen, starta om Claude Desktop, provköra installern och punkterna i steg 5 ovan.

## Minecraft-anpassning (2026-09-20)

Bakgrund: scriptade SMP:er (som Unstable Universe) spelas in en gång i spelet och klipps efteråt med Flashback (fri kamera med keyframes, följa entitet, hastighet, tid på dygnet, ljud, block-överskrivningar). Byggt:
- Scennoter `[[time: 13000]]` (speltid i ticks, 0 soluppgång, 6000 middag, 12000 solnedgång, 18000 midnatt), `[[server:]]`, `[[recording:]]`, `[[take:]]`, `[[at: 12:30]]` (startpunkt i inspelningen), `[[pov:]]`. Svenska alias: tid, inspelning, tagning, start.
- Ctrl+K "inspelning": ark med en rad per scen, inspelningslogg (grupperad per inspelning, ej inspelade sist) och vem-spelar-rollen (sparas per projekt). Tid föreslås från rubriken (KVÄLL = 12500).
- Ctrl+K "repliklista": CSV med varje replik, roll, spelare och en kolumn att bocka av (för röstinspelning som görs separat).
- Shotlistan har fälten camera, follow, path, speed. Claude-kommandot `minecraft_shotlist` (Kameraplan) lämnar objektiv i mm och planerar kameran på inspelningen. Starta om Claude Desktop efter mcp:build.
- Logik och tester i `packages/production/minecraft.ts`.

Okänt: om flera spelare spelar in samma scen från olika klienter (då behöver en scen flera inspelningar). Inte byggt: breakdown-kategorin för block-överskrivningar, exportförval (upplösning/fps).
