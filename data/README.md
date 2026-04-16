# User-Daten (DSGVO-relevant)

Dieser Ordner enthält gesammelte Nutzer-Daten. **Nichts hier kommt in Git.**
Siehe `.gitignore` — alles in `data/` außer README, .gitkeep und .example-Dateien ist ausgeschlossen.

## Was wird hier gesammelt?

- **`subscribers.csv`** — E-Mail-Abonnenten aus dem Newsletter-Form (Footer), der Warteliste (/ebook) und weiteren Formularen.

## CSV-Format

```csv
timestamp,email,source,user_agent,ip_hash
2026-04-16T14:32:11.123Z,max@example.de,ebook-waitlist,"Mozilla/5.0...",a3f7...
```

### Spalten

| Spalte | Bedeutung | Beispiel |
|---|---|---|
| `timestamp` | ISO-8601 UTC, Zeitpunkt der Anmeldung | `2026-04-16T14:32:11.123Z` |
| `email` | E-Mail-Adresse (lowercase, trimmed) | `max@example.de` |
| `source` | Wo wurde eingetragen | `newsletter-footer`, `ebook-waitlist`, `quiz-result`, … |
| `user_agent` | Browser-User-Agent (gekürzt auf 200 Zeichen) | `Mozilla/5.0 ...` |
| `ip_hash` | SHA-256 der IP + Salt (nicht die IP selbst — DSGVO-konform) | `a3f7b2c...` |

## Wichtig: Railway-Filesystem ist flüchtig

Railway löscht bei jedem Deploy alle Runtime-Dateien auf dem Server. Das heißt:
- Die CSV auf dem Server wird bei jedem `git push` auf main **gelöscht**
- Du musst die Daten regelmäßig mit `scripts/pull-subscribers.sh` lokal abholen
- Langfristige Lösungen: Railway Volume, Supabase, Google Sheets — in einer späteren Session bauen

## So holst du die aktuelle CSV

```bash
# Einmalig: ADMIN_TOKEN in ~/.zshrc oder .env eintragen
export HERZBLATT_ADMIN_TOKEN="dein-token-aus-railway-env"

# Dann:
./scripts/pull-subscribers.sh
```

Das Script schreibt die aktuelle Server-CSV nach `data/subscribers.csv` (überschreibt lokal).

## Admin-Token setzen

Auf Railway → Project → Variables:

```
ADMIN_TOKEN=<generiere-einen-langen-zufallsstring>
IP_SALT=<anderer-zufallsstring>
```

Beispiel generieren: `openssl rand -hex 32`

## DSGVO-Hinweise

- Die Rohdaten-IP wird **nicht** gespeichert, nur ein gesalzener SHA-256-Hash
- Mit Double-Opt-In sollte das später abgesichert werden (aktuell nicht implementiert)
- Bei Lösch-Anfragen: E-Mail-Zeile manuell aus `subscribers.csv` entfernen
- Die Datei darf **nie** nach Git committed werden (siehe `.gitignore`)
