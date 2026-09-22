# Ändringar

Texten under varje version blir release-anteckningen på GitHub. Skriv den för
någon som ska bestämma om de vill uppdatera, inte för den som skrev koden.

## 0.2.1

**Inloggning.** Supabase-nycklarna är nu på plats, både på sajten och i det
här bygget. Skapa konton genom att bjuda in i Supabase-panelen — logga in med
en länk på mejlen, inget lösenord. Projekt du flyttar till molnet syns på alla
enheter du loggar in på.

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
