# 🌿 Exilium — Medical Cannabis Strain Tracker

Ein persönlicher Tracker für medizinische Cannabis-Sorten. Verwalte, bewerte und durchsuche deine Sorten.

**[Live Demo →](https://cryZuX.github.io/exilium-weed-site/)**

## Features

- 📋 **Sortenliste** — Alle Sorten auf einen Blick mit THC/CBD, Bewertung, Wirkung
- 🔍 **Suche & Filter** — Nach Name, Typ (Indica/Sativa/Hybrid), Bewertung filtern
- ⭐ **Bewertungen** — 5-Sterne Bewertungssystem
- 🔒 **Passwort-Schutz** — Nur mit Admin-Passwort neue Sorten hinzufügen
- 📊 **Statistiken** — Durchschnittliche Bewertung, THC, beliebtester Typ
- 🌙 **Dark Mode** — Premium Dark Theme

## Setup

### 1. Supabase Projekt erstellen

1. Gehe zu [supabase.com](https://supabase.com) und erstelle einen Account (kostenlos)
2. Erstelle ein neues Projekt
3. Gehe zu **SQL Editor** und führe folgendes SQL aus:

```sql
-- Strains Tabelle erstellen
CREATE TABLE strains (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Indica', 'Sativa', 'Hybrid')),
  thc_content DECIMAL,
  cbd_content DECIMAL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  effects TEXT,
  taste TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security aktivieren
ALTER TABLE strains ENABLE ROW LEVEL SECURITY;

-- Öffentliches Lesen erlauben
CREATE POLICY "Öffentliches Lesen" ON strains
  FOR SELECT USING (true);

-- Einfügen mit anon key erlauben
CREATE POLICY "Einfügen erlauben" ON strains
  FOR INSERT WITH CHECK (true);

-- Aktualisieren mit anon key erlauben
CREATE POLICY "Aktualisieren erlauben" ON strains
  FOR UPDATE USING (true);

-- Löschen mit anon key erlauben
CREATE POLICY "Löschen erlauben" ON strains
  FOR DELETE USING (true);
```

### 2. Supabase Credentials eintragen

1. Gehe in deinem Supabase Projekt zu **Settings → API**
2. Kopiere **Project URL** und **anon public key**
3. Trage diese in `js/supabase-config.js` ein:

```js
const SUPABASE_URL = 'https://DEIN-PROJEKT.supabase.co';
const SUPABASE_ANON_KEY = 'dein-anon-key-hier';
```

### 3. Admin-Passwort setzen

1. Öffne die Browser-Konsole (F12) und führe aus:

```js
crypto.subtle.digest('SHA-256', new TextEncoder().encode('DEIN_PASSWORT')).then(h => console.log(Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('')))
```

2. Kopiere den ausgegebenen Hash und trage ihn in `js/supabase-config.js` ein:

```js
const ADMIN_PASSWORD_HASH = 'dein-hash-hier';
```

### 4. GitHub Pages aktivieren

1. Gehe zu **Settings → Pages** im GitHub Repo
2. Unter **Source** wähle **GitHub Actions**
3. Push den Code und die Seite wird automatisch deployed

## Tech Stack

- HTML / CSS / JavaScript (kein Framework, kein Build)
- [Supabase](https://supabase.com) (Free PostgreSQL Database)
- GitHub Pages (Hosting)
