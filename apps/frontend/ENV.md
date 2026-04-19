# Frontend Environment Variables

Astro-Frontend erwartet die folgenden `PUBLIC_*`-Variablen zur Build-Zeit
(Vite inlined alle `PUBLIC_*`-Vars in das Client-Bundle).

Secrets werden **niemals** in Frontend-Variablen gepackt — alles was hier steht
ist öffentlich sichtbar im ausgelieferten HTML/JS.

---

## Analytics

| Variable | Pflicht | Default | Zweck |
| --- | --- | --- | --- |
| `PUBLIC_PLAUSIBLE_ENABLED` | Nein | *(leer = off)* | `1` aktiviert den Plausible-Analytics-Snippet in `BaseLayout.astro`. Ohne Wert wird das Script NICHT eingebunden. Plausible ist DSGVO-konform (keine Cookies, keine PII), benötigt also keine Consent-Abfrage. Domain ist im Snippet fest auf `herzblatt-journal.com` gesetzt. |

### Aktivierung

```bash
# Railway → Frontend-Service → Variables
PUBLIC_PLAUSIBLE_ENABLED=1
```

Nach dem Setzen neuen Deploy triggern (Vite baked die Variable in das Bundle).

### Deaktivierung

Variable entfernen oder auf beliebigen anderen Wert setzen (nur `'1'` aktiviert).

---

## Regeln

- **Niemals committen:** `.env`, `.env.local`, `.env.production` — `.gitignore`
  deckt das ab.
- **`PUBLIC_*`-Prefix ist Pflicht** für alle Werte, die im Client verfügbar sein
  sollen. Variablen ohne Prefix sind nur zur Build-Zeit verfügbar.
- **Keine Secrets ins Frontend** — alles `PUBLIC_*` landet im ausgelieferten
  HTML und ist für jeden Browser-User lesbar.
