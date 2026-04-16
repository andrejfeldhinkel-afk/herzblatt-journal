# Scripts

## `pull-subscribers.sh`

Holt die aktuelle `subscribers.csv` vom Live-Server und schreibt sie nach `data/subscribers.csv`.

### Setup (einmalig)

**1. ADMIN_TOKEN + IP_SALT auf Railway setzen**

Railway Dashboard → Projekt Herzblatt-Journal → Variables → Add:

```
ADMIN_TOKEN=<zufallsstring mit min. 32 Zeichen>
IP_SALT=<anderer zufallsstring mit min. 16 Zeichen>
```

Token generieren:

```bash
openssl rand -hex 32   # ADMIN_TOKEN
openssl rand -hex 16   # IP_SALT
```

Nach dem Setzen triggert Railway automatisch einen Redeploy. Warte ~3 Min.

**2. Token lokal hinterlegen**

In deiner `~/.zshrc` (oder `~/.bashrc`):

```bash
export HERZBLATT_ADMIN_TOKEN="derselbe-token-wie-auf-railway"
```

Dann Terminal neustarten oder `source ~/.zshrc`.

### Benutzung

```bash
# Ersetzt lokale data/subscribers.csv durch Server-Version
./scripts/pull-subscribers.sh

# Merged Server-Daten mit lokaler CSV (dedupliziert nach email)
./scripts/pull-subscribers.sh --merge

# Macht vorher Backup der lokalen Datei
./scripts/pull-subscribers.sh --backup --merge
```

### Warum das Script nötig ist

Railway hat **ephemeres Filesystem**: Bei jedem Git-Push wird alles gelöscht, was der Server zur Laufzeit geschrieben hat. Die CSV auf dem Server überlebt keinen Deploy.

Daher: **Vor jedem Deploy einmal pullen mit `--merge --backup`**, sonst gehen neue Anmeldungen verloren.

Langfristig lohnt sich eine stabile Lösung:
- Railway Volume (persistent disk)
- Supabase / PostgreSQL
- Google Sheets via Sheets-API
- Mailchimp / ConvertKit / ActiveCampaign (empfohlen)

### Fehlerdiagnose

| Exit-Code | Bedeutung | Lösung |
|---|---|---|
| `401 Unauthorized` | Token stimmt nicht zwischen lokal und Railway | Token auf beiden Seiten neu setzen |
| `503` | `ADMIN_TOKEN` ist auf Railway nicht gesetzt / zu kurz | Railway Variables prüfen, min. 20 Zeichen |
| Download hängt | Railway-Deploy läuft noch | 3 Min warten, nochmal versuchen |
