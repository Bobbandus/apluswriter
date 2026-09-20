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

**Fas 5 — M9 Import/export:** [ ] FDX/HTML/sidor/rapporter ut · [ ] FDX/Highland/Word in · [ ] titelsidesformulär

**Fas 6 — M10 Polish:** [ ] kommandopalett · [ ] sök & ersätt · [ ] stavningskontroll · [ ] datasynk · [ ] spegling till filer · [ ] skrivpass + fokus · [ ] delning/kommentarer/roller · [ ] story-dagar + energikurva

**Fas 7 — Putsning** efter varje fas (skärmdumpar Ljust/Mörkt/Midnatt, desktop + mobil).

**Därefter:** Plan → Produktion, Casting, Live, realtid. Beredskapsanalysen ("Are we ready?") står i `PLAN.md` §5c.

## Nästa gång, först

1. **Starta om dev-servern** om den står och svarar 500 (`Ctrl+C`, sedan `npm run dev`). Det händer om ett bygge har skrivit över `.next` medan servern kört. Kör alltid bygge och kontroll med `APLUS_DIST_DIR=.next-verify npm run build` så delar de aldrig mapp med en dev-server.
2. **Ögna i webbläsaren när du är vid datorn** (inget av det blockerar arbetet):
   - konto-knappen uppe till höger på `/`, `/plan`, `/plan/write` och att `/login` renderar formuläret;
   - ordboken: skriv en ny roll bokstav för bokstav, radera, och kontrollera att inga halva namn ligger kvar i Manusordlistan (Inspektorn → ikonen Rollfigurer).
3. **Starta om Claude Desktop** en gång — MCP-servern är ombyggd, och det är omstarten som gör att Claude börjar skriva om när du ber om det. Skriv in din stil under Inställningar → Skrivande → Stil & ton, så läser Claude den före varje omskrivning. Prova sedan /rewrite, /alternatives, /new_scene, /polish_dialogue, eller "skriv om dialogen i scen 1 så den blir vassare" (ett kort med en ändring per rad, kryssa i det du vill ha) och "ge mig tre varianter av Vildes sista replik".
4. Kör `npm run check`, ta sedan nästa delfas.

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
