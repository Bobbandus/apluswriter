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

Alla skript går att köra om. Om något går fel halvvägs kan du rätta och köra
samma fil igen.

> Skripten testas mot en riktig Postgres i `supabase/sql.test.ts` (med
> PGlite). Testerna kontrollerar bland annat att en främling inte kan se ditt
> projekt, att en läsare inte kan ändra, och att en sparning från en gammal
> kopia vägras i stället för att skriva över.

## 3. Inloggning

**Authentication → Sign In / Providers**

- **Email** — på som standard. Magic link (inloggningslänk på mejl) fungerar
  direkt, inget lösenord behövs.
- **Google** (valfritt):
  1. I [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
     *Create credentials → OAuth client ID → Web application*.
  2. Under *Authorized redirect URIs*, lägg till
     `https://<ditt-projekt>.supabase.co/auth/v1/callback`
     (exakt adress står i Supabase på Google-sidan).
  3. Klistra in Client ID och Client Secret i Supabase och slå på Google.

**Authentication → URL Configuration**

- **Site URL**: din riktiga adress, t.ex. `https://write.aplusfilm.se`
  (lokalt: `http://localhost:3000`).
- **Redirect URLs**: lägg till alla ställen appen körs från:
  - `http://localhost:3000/auth/callback`
  - `https://<din-vercel-adress>/auth/callback`

## 4. Nycklarna

**Project Settings → API**. Kopiera:

- **Project URL**
- **Publishable key** (heter *anon key* i äldre projekt)

Skapa filen **`aplusweb/.env.local`** — observera: i `aplusweb/`, inte i
repots rot, eftersom det är där Next.js letar:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
```

Starta om `npm run dev`. På projektsidan dyker **Logga in** upp.

På Vercel lägger du in samma två variabler under
*Project → Settings → Environment Variables*.

> Den publika nyckeln är gjord för att ligga i webbläsaren. Det är
> radsäkerheten i `02_rls.sql` som skyddar datan, inte att nyckeln är hemlig.
> Lägg **aldrig** in `service_role`-nyckeln i appen.

## 5. Prova

1. Logga in på projektsidan.
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
