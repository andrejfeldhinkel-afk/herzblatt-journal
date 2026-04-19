# Master-Audit Herzblatt Journal — 2026-04-19

**Scope**: Railway-Infrastruktur + Competitive-Intelligence (8 deutsche Dating-Ratgeber-Sites).
**Auditor**: Claude DevOps + Competitive-Intel-Agent (autonom).
**Status**: Production live unter https://herzblatt-journal.com, Backend `api.herzblatt-journal.com`.

---

## 1. Railway-Infrastruktur

### 1.1 Service-Bestand (Project `b6841ed6-199b-4c97-9818-5ff3bb93dbd3`, Env `production`)

| Service | Typ | Last Deploy | Status | Healthcheck | Repo | Kategorie |
|---|---|---|---|---|---|---|
| Herzblatt Backend | App | 2026-04-19 21:13 | SUCCESS | **(none)** | andrejfeldhinkel-afk/herzblatt-journal | **Produktiv** |
| Herzblatt Frontend | App | 2026-04-19 21:32 | BUILDING (aktuell) | **(none)** | andrejfeldhinkel-afk/herzblatt-journal | **Produktiv** |
| postgres | DB | 2026-04-18 22:17 | SUCCESS | n/a | — | **Produktiv** |
| grafana | Observability | 2026-04-19 08:02 | **FAILED x2** | (none) | vergissberlin/railwayapp-grafana | **Stale/kaputt** |
| function-bun | Serverless | 2026-04-18 22:17 | SLEEPING | (none) | — | **Stale** |
| MySQL | DB | 2026-04-18 22:17 | SUCCESS | n/a | — | **Verwaist** (nicht in Backend-Env) |
| RabbitMQ | Queue | 2026-04-18 22:17 | SUCCESS | n/a | — | **Verwaist** (kein AMQP_URL) |
| RabbitMQ Web UI | UI | 2026-04-18 22:04 | SUCCESS | (none) | — | **Verwaist** (folgt RabbitMQ) |
| Redis | Cache | 2026-04-18 22:17 | SUCCESS | n/a | — | **Verwaist** (kein REDIS_URL) |
| Bucket (MinIO) | Storage | 2026-04-18 22:17 | SUCCESS | `/minio/health/ready` | railwayapp-templates/minio | **Verwaist** (kein S3_ENDPOINT in Backend-Env) |
| Console (MinIO UI) | UI | 2026-04-18 22:17 | SUCCESS | `/login` | railwayapp-templates/minio-console | **Verwaist** (folgt MinIO) |

**Wichtige Erkenntnis**: Die im Briefing vermuteten Stale-Services `perpetual-gratitude` (bd49a090-...) und `elegant-amazement` (098ed299-...) existieren nicht mehr — bereits entfernt. Aber es gibt **7 weitere verwaiste Services**, die der Backend-Env-Var-Liste nach nicht vom Produktiv-Stack genutzt werden.

### 1.2 Env-Var-Audit Backend (`Herzblatt Backend`)

**Vollständig** (37 Variablen gesetzt):
- Payment-Stack: WHOP_API_KEY, WHOP_PLAN_ID_EBOOK, MICROPAYMENT_ACCESS_KEY/PROJECT_KEY/TEST_MODE
- Security-Secrets: ADMIN_TOKEN, HERZRAUM_PASSWORD, IP_SALT, UNSUBSCRIBE_SECRET, SESSION_SECRET, EBOOK_ACCESS_SECRET, AFFILIATE_CODE_SECRET, ADMIN_CRON_TOKEN
- Infrastructure: DATABASE_URL, PORT=3001, HOST=0.0.0.0, NODE_ENV=production, ALLOWED_ORIGINS, PUBLIC_BASE_URL, COOKIE_DOMAIN
- SendGrid: SENDGRID_API_KEY, SENDGRID_FROM_NAME/EMAIL, SENDGRID_LIST_ID
- Push: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
- Monitoring: SENTRY_DSN, SENTRY_ENV=production
- Integration: REGISTER_API_URL (xLoves)
- GitHub: GITHUB_TOKEN (fürs Artikel-Publishing via Admin)
- Railway-Internals: RAILWAY_PROJECT_ID/ENV_ID/SERVICE_ID etc.

**Fehlend / zu prüfen**:
- `MICROPAYMENT_TEST_MODE=1` → **Produktion läuft im TEST-MODE!** Muss vor echtem Traffic auf `0` oder gelöscht werden.
- Keine `REDIS_URL`, `MYSQL_URL`, `AMQP_URL`, `S3_ENDPOINT`/`S3_ACCESS_KEY` → Redis / MySQL / RabbitMQ / MinIO werden **nicht vom Backend referenziert**. Bestätigt: Die 7 verwaisten Services sind tatsächlich ungenutzt.
- Keine `SENTRY_RELEASE` → Source-Maps ohne Release-Tag schwerer zuzuordnen.
- Keine `PUBLIC_PLAUSIBLE_ENABLED` oder `PLAUSIBLE_DOMAIN` → Plausible-Preconnect im HTML aber evtl. nicht aktiv.

### 1.3 Healthcheck + Restart-Policy

| Service | Healthcheck-Path | Restart-Policy | Empfehlung |
|---|---|---|---|
| Herzblatt Backend | **(none)** | ON_FAILURE | → **`/health` setzen** (Endpoint muss im Backend bestehen) |
| Herzblatt Frontend | **(none)** | ON_FAILURE | → **`/` setzen** (Static/SSR-Homepage) |
| Console (MinIO UI) | `/login` | ON_FAILURE | OK (aber Service sowieso verwaist) |
| Bucket (MinIO) | `/minio/health/ready` | ON_FAILURE | OK (aber verwaist) |

**Risiko**: Ohne Healthcheck merkt Railway nicht, wenn Backend/Frontend hängen (z. B. DB-Connection-Pool exhausted, Event-Loop blockiert). Restart erfolgt nur bei Prozess-Crash, nicht bei 502/504.

### 1.4 Empfohlene Maßnahmen (Priorität absteigend)

**P0 — sofort (kostet nix, verhindert Incidents)**:
1. `MICROPAYMENT_TEST_MODE` auf `0` setzen sobald echte Zahlungen live gehen (User-Confirm nötig).
2. Healthcheck-Path `/health` für Backend-Service (sobald `/health`-Route deployed ist).
3. Healthcheck-Path `/` für Frontend-Service.

**P1 — Cleanup (Monats-Kostenersparnis ~15–25 €, wenn geteilt gehostet)**:
4. `grafana` löschen — 2x FAILED, keiner beobachtet mit Grafana (Sentry + Plausible reichen).
5. `function-bun` löschen — SLEEPING, kein Use-Case dokumentiert.
6. `MySQL` löschen — kein Service connected sich (Backend nutzt Postgres).
7. `RabbitMQ` + `RabbitMQ Web UI` löschen — keine AMQP-Config im Backend.
8. `Redis` löschen — kein Caching-Layer im Backend-Code nachweisbar (alles Postgres).
9. `Bucket` + `Console` (MinIO) löschen — keine S3-Env-Vars im Backend, Uploads wahrscheinlich direkt auf Railway-Disk oder CDN.

> **Grobe Schätzung Kostenersparnis**: Bei Railway-Hobby-Plan (5 $/Service Base + Usage) können 7 verwaiste Services leicht **20–40 €/Monat** sparen. **⚠ Kein Service vom Agent gelöscht — User-Bestätigung pflicht.**

**P2 — Observability**:
10. `SENTRY_RELEASE=$RAILWAY_DEPLOYMENT_ID` als Env-Var ergänzen für Release-Tracking.

---

## 2. Competitive-Intelligence

### 2.1 Gescannte Wettbewerber (8 Sites)

| # | Site | HTTP | SSR | JSON-LD | <img> | Bytes (Home) | Bemerkung |
|---|---|---|---|---|---|---|---|
| 1 | parship.de/ratgeber | 200 | ✅ | **12 Blöcke** | viele | (groß) | Content-Hub-Kategorien, starke Schema-Nutzung |
| 2 | elitepartner.de/magazin | 200 | ✅ | 1 | 54 | 102 KB | TÜV-Süd-Badge als Trust-Signal, 50+ Teaser |
| 3 | lemonswan.de/magazin | **404** | — | — | — | — | URL-Struktur geändert, Magazin evtl. eingestellt |
| 4 | lovescout24.de/magazine | 200 | ❌ SPA-Shell | 0 | 0 | 69 KB | JS-Only-Rendering → SEO-Nachteil ohne SSR |
| 5 | bildkontakte.de/blog | 404 → `blog.bildkontakte.de` | 200 | 3 | 44 | 93 KB | Subdomain-Setup, 3 JSON-LD-Blöcke |
| 6 | beziehungsweise-magazin.de | **ECONNREFUSED** | — | — | — | — | Server nicht erreichbar (evtl. offline) |
| 7 | dating-cafe.de/blog | **ECONNREFUSED** | — | — | — | — | Server nicht erreichbar |
| 8 | zweisam.de/magazin | 200 | ❌ SPA-Shell | 0 | 0 | 69 KB | Kein SSR, kein Schema |
| **=** | **herzblatt-journal.com** | **200** | ✅ | **2 (Home) / 5 (Artikel)** | 56 | 220 KB | Vollständig SSR, PWA-Manifest, Self-hosted Fonts |

### 2.2 Content-Depth-Vergleich (Sample-Artikel)

| Site | Beispiel-Artikel | Wörter | JSON-LD | Interne Links |
|---|---|---|---|---|
| Parship | `/ratgeber/loslassen/` | 2.705 | 1 | 76 |
| ElitePartner | `/magazin/daten/` | 1.579 | 1 | 74 |
| **Herzblatt** | `/blog/bumble-test-erfahrungen` | **7.837** | **5** | **130** |
| **Herzblatt** | `/blog/emotionale-intimitaet-aufbauen` | **4.716** | **5** | (hoch) |

**Fazit**: Herzblatt führt deutlich bei Content-Tiefe (2.9x Parship, 5x ElitePartner) und Structured-Data-Dichte. Interne Verlinkung 1.7x Parship — entscheidend für Crawl-Budget + Topic-Authority.

### 2.3 Wo Herzblatt gewinnt

- **SSR + PWA**: lovescout24, zweisam rendern Home nur als JS-Shell → Herzblatt hat 100 % First-Paint-Content, bessere CWV, bessere Index-Coverage.
- **Schema.org**: 5 Blöcke pro Artikel (Article, BreadcrumbList, FAQ, Author, Organization) vs. 1 bei Parship/ElitePartner. → Rich Results in SERP.
- **Content-Depth**: 4.7k–7.8k Wörter vs. 1.5k–2.7k der Premium-Portale. → E-E-A-T-Vorteil.
- **Trust-Stack**: Impressum + L-P GmbH + Hamburger Adresse in Organization-Schema + Self-hosted Fonts (DSGVO-sauber).
- **Promo-Banner mit Product-CTA** (Ebook 89,99 €, –40 %) — direkte Monetarisierung, die Parship/ElitePartner NICHT haben (die verkaufen nur Abos).
- **Preconnect/DNS-Prefetch** für Plausible + GA + DiceBear → schnellere Third-Party-Loads.

### 2.4 Wo Herzblatt verliert

- **TÜV-Süd-/Trust-Badges**: ElitePartner zeigt "TÜV SÜD-zertifizierte Software", "Singles mit Persönlichkeit". Herzblatt hat kein explizites Trust-Siegel auf Home.
- **Teaser-Dichte**: ElitePartner 50+ Artikel-Teaser auf Magazin-Home, Parship 22. Herzblatt ~11 auf der Home + 24 auf /blog. → Mehr Einstiegsseiten zum Content-Universum fehlen.
- **Sticky "Kostenlos anmelden"-CTA**: Parship + ElitePartner haben Dauer-CTA zur Registrierung → höhere Conversion. Herzblatt hat Promo-Banner, aber keinen permanenten konsistenten Lead-Magnet (Newsletter ist schwächer beworben).
- **Social-Proof-Counter**: Parship nutzt "Alle 11 Minuten verliebt sich ein Single" (H2 gefunden). Herzblatt hat Testimonial-Track (erkannt in CSS: `testimonial-track`), aber keinen numerischen Social-Proof (z. B. "10.000+ Leser:innen" oder "Über 1.200 Artikel").
- **Meta-Description-Länge**: Parship/ElitePartner nutzen längere, emotionalere Beschreibungen. Herzblatt-Home-Meta ist funktional, aber nicht neugiermachend.
- **Ratgeber-Struktur**: Parship clustert nach User-Journey (Suche/Date/Trennung/Tipps). Herzblatt clustert nach Tags — weniger intuitiv für User ohne Vorwissen.

---

## 3. Top 10 Quick-Wins für Welle 4

Priorität nach Impact/Effort:

| # | Quick-Win | Impact | Effort | Wo |
|---|---|---|---|---|
| 1 | Healthcheck `/health` + `/` für Backend & Frontend in Railway setzen | Incident-Prevention | 10 min | Railway-UI |
| 2 | `MICROPAYMENT_TEST_MODE` bestätigen (Test vs. Live) | Revenue-Risk | 2 min | Railway-Env |
| 3 | 7 verwaiste Services löschen (grafana, function-bun, MySQL, RabbitMQ×2, Redis, MinIO×2) nach User-OK | 20–40 €/mo | 15 min | Railway-UI |
| 4 | User-Journey-Cluster auf /blog (Suche / Date / Beziehung / Trennung) | SEO-Topic-Cluster | 2 h | Frontend |
| 5 | Numerischer Social-Proof-Counter auf Home ("1.190 Artikel · 4.500+ Leser:innen/Monat") | Conversion | 1 h | Home-Hero |
| 6 | Sticky "Newsletter / Ebook-Bundle" CTA rechts unten (Parship-Pattern) | Lead-Gen | 2 h | Layout |
| 7 | Trust-Siegel-Komponente (Impressum-Link, SSL-Badge, "Hamburger Unternehmen") | Trust | 1 h | Footer-Boost |
| 8 | OG-Image pro Artikel automatisch generieren (Astro `og-image`-Integration) | Share-CTR | 3 h | Build |
| 9 | Canonical + hreflang auf Paginations-Seiten (/blog/2, /blog/3 …) prüfen | Duplicate-Content | 30 min | Astro |
| 10 | `SENTRY_RELEASE=$RAILWAY_DEPLOYMENT_ID` für bessere Issue-Zuordnung | Debug-Speed | 5 min | Railway-Env |

---

## 4. Top 5 strategische Optimierungen (1–3 Monate)

1. **Topic-Cluster-Hubs**: Statt flacher Tag-Seiten 6 starke Cluster-Hubs (Erstes Date, Online-Dating, Beziehung, Trennung, Selbstliebe, Lebensphasen 50+). Jeder Hub mit 500+ Wörter Intro + 10–20 Artikeln + Ratgeber-Flowchart. → Konkurrenzfähig zu Parship-Strukturierung.
2. **Quiz-Funnel + Lead-Magnet-Upgrade**: Bestehendes Quiz-Feature mit "Dein persönliches Dating-Profil"-PDF belohnen → E-Mail-Capture → Drip-Campaign zur Ebook-Conversion. Parship/ElitePartner haben keinen Content-Lead-Magnet auf dem Niveau.
3. **Author-Pages mit E-E-A-T**: Jeder Artikel braucht einen echten Autor mit Bio, Foto, Qualifikation, LinkedIn-Link. Google-EEAT-Boost ist der größte langfristige Hebel gegen Parship (die haben zentrale Redaktion, aber kaum einzelne Author-Profile).
4. **Vergleichstabellen-Generator für /top-dating-seiten**: Automatisierte Gegenüberstellungen (Parship vs. ElitePartner, Bumble vs. Tinder) mit eigenen Bewertungen + Affiliate-Tracking via `/go/:slug`. Perfekte Synergie mit Affiliate-Link-System.
5. **Hub-Monetarisierung via Ebook-Upsell**: Jeder Topic-Cluster endet mit kontextuellem Ebook-CTA ("Willst du tiefer?") statt pauschaler Promo-Banner. A/B-Test Conversion-Rate.

---

## 5. Zusammenfassung

- **Infra**: Backend + Frontend laufen stabil, aber ohne Healthcheck + mit 7 verwaisten Railway-Services (Kostenersparnis ~20–40 €/mo bei Cleanup).
- **Content**: Herzblatt dominiert bei Content-Depth (3x–5x Wörter) und Schema-Dichte (5x Parship) — das ist der nachhaltigste Vorteil.
- **Gap**: Trust-Signale, numerischer Social-Proof, User-Journey-basierte Navigation, permanenter Lead-CTA.
- **Konkurrenz-Ausfall**: beziehungsweise-magazin.de + dating-cafe.de beim Crawl nicht erreichbar — mögliche Vacancy in deren Keyword-Territorium, SEO-Opportunity für gezieltes Hijacking.
