# Ändringar

Texten under varje version blir release-anteckningen på GitHub. Skriv den för
någon som ska bestämma om de vill uppdatera, inte för den som skrev koden.

## 0.2.3

**0.2.2 hade fortfarande ingen inloggning i installern.** Bygget letade efter
en secret vid namn `NEXT_PUBLIC_SUPABASE_ANON_KEY`, men den som faktiskt
lades in i GitHub hette (rätt, enligt den nyare namngivningen) `..._PUBLISHABLE_KEY`
— så varningen "inga nycklar" kom igen trots att nyckeln fanns. Bygget läser
nu båda namnen. Samma funktioner som 0.2.2 skulle ha haft.

## 0.2.2

**Inloggning och moln i själva appen.** De två Supabase-nycklarna saknades i
GitHub när 0.2.1 byggdes, så installern gick i rent lokalt läge trots att
webbsidan redan hade dem — ingen inloggning, inget moln, och A+ Live sa
"Supabase är inte konfigurerat". Nycklarna finns nu på plats; det här bygget
har samma inloggning, molnprojekt och delning som webbsidan.

## 0.2.1

**Inloggning.** Supabase-nycklarna är nu på plats, både på sajten och i det
här bygget. Skapa konton genom att bjuda in i Supabase-panelen. **Lösenord**
är förstahandsvalet — en länk på mejlen finns kvar för en inbjuden persons
första inloggning och "Glömt lösenordet?".

**Flera enheter.** Loggar du in på en dator med projekt sparade sedan innan
flyttar en knapp allt till kontot i ett klick. Projekt i molnet syns på alla
enheter du loggar in på.

**Namn.** Förnamn och efternamn under Inställningar → Konto, så andra ser vem
du är i stället för en e-postadress.

**Dela.** Bjud in en medarbetare till ett projekt med en roll — kan läsa, kan
kommentera, kan skriva — eller skapa en anonym länk som inte kräver
inloggning alls, med valfritt utgångsdatum.

## 0.2.0

**A+ Live.** Grafik för livesändning, som en browser source i OBS eller vMix:
poängtavla, bordtennis med ITTF-regler, handboll med klocka och utvisningar,
namnskylt och poängtabell för jurypoäng. Elva designer och 35 teman, ett galleri
på `/live/themes`, och en operatörssida med tangentgenvägar. Knapparna går också
att trycka över HTTP, så en Stream Deck kan styra tavlan.

**Minecraft-inspelning.** Scennoter för speltid, server, inspelning och tagning,
ett inspelningsark per scen, repliklista som CSV för separat röstinspelning, och
en kameraplan som Claude kan föreslå.

**Appen säger till när den uppdaterat sig.** Tidigare hämtades nya versioner helt
tyst. Nu dyker en rad upp när en version är nedladdad, med en knapp som startar
om. Versionsnumret står under Inställningar.

**Dubbelklicka på en `.fountain`-fil** så öppnas den i A+ Toolkit. Installationen
registrerar filtypen; avinstallationen tar bort den igen.

**En riktig nedladdningssida** på `/ladda-ner`, med version, datum och filstorlek
hämtade från den faktiska releasen — och en förklaring av SmartScreen-varningen
som en osignerad installer ger.

**Att veta:** den här versionen är byggd utan Supabase-nycklar, så den har ingen
inloggning och ingen molnsynk. Allt sparas lokalt på datorn och fungerar utan
internet. Läggs nycklarna in får nästa version inloggning.

## 0.1.0

Första versionen. Hela skrivdelen: Fountain-redigerare med levande formatering,
sidbrytning och PDF, import från FDX, Highland och Word, export till FDX, HTML,
rollsidor och rapporter, kommandopalett, sök och ersätt, revisioner, indexkort,
fokusläge och Claude-koppling via MCP.
