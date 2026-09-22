# Supabase — sätta upp molnet

A+ Write fungerar fullt ut **utan** Supabase. Projekt sparas då på datorn du
skriver på. Med Supabase får du konto, molnsynk mellan datorer, och senare
delning och kommentarer.

Räkna med ungefär 10 minuter.

---

## 1. Skapa projektet

1. Gå till [supabase.com](https://supabase.com) → **New project**.
2. Välj en region nära dig (t.ex. *North EU (Stockholm)*).
3. Spara databaslösenordet någonstans säkert. Appen behöver det inte, men du
   behöver det om du någon gång vill koppla in dig direkt.

## 2. Kör SQL-skripten — i den här ordningen

Öppna **SQL Editor** → **New query**, klistra in hela filen och tryck **Run**.
Gör så för varje fil, i ordning:

| # | Fil | Vad den gör |
|---|---|---|
| 1 | `01_schema.sql` | Tabeller, index och triggers |
| 2 | `02_rls.sql` | Radsäkerhet — vem får se och ändra vad |
| 3 | `03_functions.sql` | `save_script`, `create_revision`, `get_shared_script`, `duplicate_project` |
| 4 | `04_storage.sql` | Två privata buckets: `exports` och `media` |
| 5 | `05_live.sql` | A+ Live: poängtavlor och overlays (`live_boards`, `get_live_board`, `update_live_state`) |
| 6 | `06_collaboration.sql` | Förnamn/efternamn på profilen, och att bjuda in en person till ett projekt (`invite_project_member`, `remove_project_member`) |

Alla skript går att köra om. Om något går fel halvvägs kan du rätta och köra
samma fil igen.

> Skripten testas mot en riktig Postgres i `supabase/sql.test.ts` (med
> PGlite). Testerna kontrollerar bland annat att en främling inte kan se ditt
> projekt, att en läsare inte kan ändra, och att en sparning från en gammal
> kopia vägras i stället för att skriva över.

## 3. Inloggning

Man loggar in med **lösenord** som förstahandsval, med en **magic link**
(inloggningslänk på mejl) som reserv — den behövs ändå för en inbjuden
persons första inloggning (innan de satt ett lösenord under Inställningar)
och för "Glömt lösenordet?". Knappen **Logga in** sitter uppe till höger på
alla sidor, och den syns först när nycklarna i steg 4 är inlästa.

Lösenord finns för att Supabases egen mejlutskickare är hårt begränsad —
några mejl i timmen utan en egen SMTP-koppling. Ett lösenord betyder att de
flesta inloggningar inte skickar något mejl alls.

**Authentication → Sign In / Providers**

- **Email** — på som standard. Både lösenord och magic link går via den här,
  ingen extra strömbrytare behövs.
- **User Signups → stäng av *Allow new users to sign up*.** Sajten är för
  A+ Studios eget bruk. Med den här avstängd kan ingen främling skapa ett
  konto och fylla din databas. Appen ber dessutom aldrig Supabase att skapa
  konton (`shouldCreateUser: false`), men det är den här strömbrytaren som är
  själva låset.
- **Google** (valfritt, kan vänta):
  1. I [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
     *Create credentials → OAuth client ID → Web application*.
  2. Under *Authorized redirect URIs*, lägg till
     `https://<ditt-projekt>.supabase.co/auth/v1/callback`
     (exakt adress står i Supabase på Google-sidan).
  3. Klistra in Client ID och Client Secret i Supabase och slå på Google.
  4. Sätt `NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN=1` (steg 4). Utan den visas ingen
     Google-knapp.

**Authentication → Users → Add user → Send invitation** (heter *Invite user* i
äldre gränssnitt): bjud in varje kollega med e-postadress. Det är så nya
personer får ett konto när nyregistrering är avstängd. Den inbjudne klickar
länken i mejlet, är då inloggad, och sätter ett lösenord under
**Inställningar → Konto** om de vill slippa mejl-länken nästa gång.

**Authentication → URL Configuration**

- **Site URL**: `https://toolkit.aplusfilm.se`
  (lokalt: `http://localhost:3000`).
- **Redirect URLs**: lägg till alla ställen appen körs från, **både** `/auth/callback`
  (magic link, Google) **och** `/auth/reset-password` (glömt lösenordet) — saknas en
  adress här faller Supabase tyst tillbaka på Site URL i stället för att neka, vilket
  ser ut som att länken går till fel sida i stället för ett tydligt fel:
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/auth/reset-password`
  - `https://toolkit.aplusfilm.se/auth/callback`
  - `https://toolkit.aplusfilm.se/auth/reset-password`

## 3b. Dela ett projekt

Två skilda sätt, båda i projektets **Dela …**-meny i appen — ingenting att slå på
i Supabase utöver `06_collaboration.sql`.

- **Bjud in en person.** Kräver att adressen redan har ett A+ Toolkit-konto (se
  ovan). Ägaren väljer en roll — kan läsa, kan kommentera, kan skriva — och
  personen ser projektet i sin egen instrumentpanel nästa gång de loggar in.
  Namnet som visas för andra kommer från **Inställningar → Konto**; ett konto
  utan förnamn/efternamn visas med sin e-postadress lokala del i stället.
- **Skapa en länk.** Ingen inloggning behövs alls — vem som helst med länken
  kan läsa, tills länken återkallas eller går ut. Sidan är `/delad/<token>`,
  medvetet inte indexerad av sökmotorer. Permissionen `comment` går att välja
  och sparas, men kommentering via en anonym länk är **inte byggt än** — den
  kräver ett eget skrivvägs-API (`comments`-tabellen är låst till inloggade
  medlemmar), så en "kan kommentera"-länk gör idag exakt detsamma som en
  "kan läsa"-länk.

## 4. Nycklarna

**Project Settings → API**. Kopiera:

- **Project URL**
- **Publishable key** (heter *anon key* i äldre projekt)

Skapa filen **`aplusweb/.env.local`** — observera: i `aplusweb/`, inte i
`aplustoolkit/` eller repots rot. `npm run dev` kör `next dev aplusweb`, och
Next.js läser bara env-filer från den mappen. (Det var därför ingen Logga
in-knapp syntes när filen låg fel.)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
```

Namnet `NEXT_PUBLIC_SUPABASE_ANON_KEY` fungerar också. Starta om `npm run dev`
(env-filer läses bara vid start). **Logga in** dyker upp uppe till höger.

På Vercel lägger du in samma variabler under
*Project → Settings → Environment Variables* och gör sedan en **redeploy**.
`NEXT_PUBLIC_*` bakas in när sajten byggs, så en ny variabel gör ingenting
förrän nästa bygge.

> Den publika nyckeln är gjord för att ligga i webbläsaren. Det är
> radsäkerheten i `02_rls.sql` som skyddar datan, inte att nyckeln är hemlig.
> Lägg **aldrig** in `service_role`-nyckeln i appen.

## 5. Prova

1. Klicka **Logga in** uppe till höger och skriv en adress du har bjudit in.
2. **Nytt projekt** → välj **I molnet**.
3. Skriv något. Statusen i titelraden går från *Sparar …* till *Sparat*.
4. Öppna samma adress i ett annat webbläsarfönster och skriv i båda. Det andra
   fönstret får en ruta som visar båda versionerna och låter dig välja.
   Ingenting skrivs över tyst.

Ett projekt som redan finns på datorn flyttar du upp med **… → Flytta till
molnet** på projektkortet. Det behåller sin adress.

---

## Hur sparningen fungerar

- Varje tangenttryck sparas först på datorn (IndexedDB) inom en kvarts sekund.
- Molnet uppdateras en stund efter att du slutat skriva, via `save_script`,
  som vägrar om någon annan hunnit spara emellan (felkod `P0409`).
- Offline fortsätter allt att fungera. Statusen säger *Offline — sparat
  lokalt*, och synken tar vid när nätet är tillbaka.
- Borttagna molnprojekt ligger kvar i databasen med `deleted_at` satt och kan
  återställas därifrån.
