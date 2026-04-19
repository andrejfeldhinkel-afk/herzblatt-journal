# Audit der bestehenden Kapitel 00-03

**Audit-Autor:** Content-Agent (feat/ebook-content-chapters-04-15)
**Datum:** 19.04.2026
**Scope:** Kapitel 00 (Vorwort), 01, 02, 03 — Lesequalität, Konsistenz, inhaltliche Tiefe

**Hinweis:** Dies ist ein Befundbericht — die genannten Punkte wurden bewusst NICHT gefixt, da in einem separaten Agent-Lauf behandelt.

---

## A · Inkonsistenzen in der Anrede

**Schwere: mittel-hoch** (betrifft die gesamte Buch-Wahrnehmung)

Das Buch ist in der Tonalität inkonsistent:

- **Titelzeilen von Kapiteln 01-03** nutzen **„du"** („Wer bist du — und was willst du wirklich?", „Dein Bindungsstil", „Altlasten loslassen")
- **Fließtext aller Kapitel** nutzt durchgängig **„Sie"** („Wenn Sie dieses Buch in den Händen halten…")
- Inhaltsverzeichnis im Vorwort wechselt: einige Titel „du", andere neutral
- Ebook-Landingpage (ebook.astro) bewirbt die Kapitel durchgängig mit **„du"** („Wer bist du — und was willst du wirklich?", „den Schlüssel, den er dir gibt")

**Empfehlung:** Ein Lektorat-Pass, der eine Richtung festlegt. Die Zielgruppe (25-55 Jahre) toleriert beides, aber Inkonsistenz innerhalb eines einzelnen Produkts wirkt unprofessionell. Wir empfehlen **durchgängig „Sie"** im Fließtext (Fachbuch-Charakter, hoher Preis = Seriositätserwartung) und die Marketing-Titel auf der Landingpage anzugleichen.

---

## B · Falsche Wortzahl-Angaben am Kapitelende

**Schwere: niedrig-mittel** (Vertrauensbruch wenn Käufer nachzählen)

Jedes Kapitel endet mit einer Zeile wie:
> *Wortanzahl: ~5.400 · Durchschnittliche Lesezeit: 22 Minuten …*

Die tatsächlichen Wortzahlen (via `wc -w`):

| Kapitel | Angegeben | Tatsächlich | Differenz |
|---|---|---|---|
| 01 Selbstkenntnis | ~5.400 | 3.456 | −36 % |
| 02 Bindungsstil | ~6.300 | 3.399 | −46 % |
| 03 Altlasten | ~6.700 | 3.786 | −44 % |

**Empfehlung:** Entweder die Angaben herausnehmen (sicherste Variante), oder korrigieren. Käufer, die die Angabe überprüfen, werden die Diskrepanz bemerken — das untergräbt Vertrauen in den Rest des Buches.

---

## C · Landingpage verspricht „200+ Seiten Hauptbuch"

**Schwere: mittel** (rechtlich relevant)

Die ebook.astro bewirbt das Buch mit „200+ Seiten Hauptbuch". Aktuell:

- 4 Kapitel × ~3.500 Wörter = ~14.000 Wörter
- Bei einer typischen Layout-Dichte von 300-350 Wörtern pro Taschenbuchseite ergibt das 40-47 Seiten
- Selbst nach Ergänzung aller 15 Kapitel + Vorwort bei identischer Länge landen wir bei ~55.000 Wörtern ≈ 160-180 Seiten

**Empfehlung:** Entweder mehr Text pro Kapitel (schwieriger — Qualität zählt mehr als Seitenzahl), oder die 200+-Angabe relativieren („200+ Seiten inkl. Workbook und Anhänge" ist korrekter, da 80 Seiten Workbook + Anhänge A-D dazukommen). Die aktuelle Version von Kapitel 04-15 (dieser PR) hält die durchschnittliche Länge der existierenden Kapitel.

---

## D · Vorwort nennt „Anhang D" — der nicht existiert

**Schwere: niedrig**

Kapitel 01 verweist auf eine „Liste geeigneter Stellen am Ende dieses Buches zusammengestellt (Anhang D)". Das Inhaltsverzeichnis im Vorwort nennt nur Anhänge A-C. Es gibt keinen Anhang D.

**Empfehlung:** Entweder Anhang D erstellen (Liste von Therapie-Suchmaschinen, Krisenhotlines, Bundesverbänden) oder den Verweis entfernen.

---

## E · Tippfehler / Grammatik-Ausrutscher

**Schwere: niedrig** (punktuell)

Auszug aus 01-selbstkenntnis.md:

- Zeile 210: *„Manches werden Sie anders beantworten würde Sie es heute wieder gefragt."* — fehlt „wenn" vor „Sie es heute". Sollte lauten: *„…würden Sie es heute wieder gefragt"* oder *„wenn Sie es heute wieder gefragt würden"*.
- Zeile 241: *„attractieren"* — denglish, sollte „anziehen" sein.
- Zeile 90: *„Sind ein unendlich zuverlässigerer Kompass"* — „unendlich" vor Komparativ stilistisch holprig, besser „sehr viel zuverlässiger".

Aus 02-bindungsstil.md:

- Zeile 38-41: Die Prozentangaben summieren sich auf 100 % (60+20+15+5), aber die Begleittexte sprechen an anderer Stelle von „55-60 %" (Zeile 63). Konsistent halten.

**Empfehlung:** Lektoratsdurchgang mit zweitem Pair-of-Eyes. Keine dramatischen Fehler, aber ein 89,99-€-Produkt verträgt keine Denglish-Ausrutscher.

---

## F · Zitat-Attribution fehlt partiell

**Schwere: mittel** (Wissenschaftlichkeit)

Das Vorwort nennt Bowlby, Ainsworth, Sue Johnson, John & Julie Gottman als Grundlage. Im Text der Kapitel:

- Kapitel 02 attributiert Bowlby und Ainsworth korrekt (sogar mit Lebensdaten und Jahreszahlen).
- **Keine einzige Gottman-Zitierung** trotz Ankündigung im Vorwort. Die „vier apokalyptischen Reiter" (Kritik, Verachtung, Abwehr, Mauern) sind ein Kernkonzept, das zwingend im Kommunikations-Teil (Kap. 12) erscheinen muss — sonst bricht das Vorwort-Versprechen.
- **Keine Sue-Johnson-/EFT-Zitierung** in den ersten 3 Kapiteln. Sollte spätestens in den Beziehungs-Kapiteln kommen.

**Empfehlung:** Die neuen Kapitel (04-15, besonders 10-15) müssen diese Autoren integrieren. Ich habe das beim Verfassen von Kapitel 04-15 berücksichtigt.

---

## G · Keine konkrete Zahlenangabe hat eine Quelle

**Schwere: mittel** (Beweiswürdigung bei kritischem Leser)

Das Buch behauptet unter anderem:
- „In den ersten Wochen waren die Partner plötzlich 40 % weniger…"
- „Drei Jahre spätere Studien zeigten eine Halbierung der Trennungsrate"
- „80 % aller Beziehungskonflikte werden erklärbar"

**Keine dieser Zahlen hat eine Fußnote oder Quellenangabe.** Die Vorbemerkung „Mit Quellenangaben" am Ende des Vorworts (im Abschnitt „Wie wir dieses Buch geschrieben haben") setzt eine Erwartung, die der Haupttext nicht einhält.

**Empfehlung:** Entweder die Zahlen mit Fußnoten versehen (Gold-Standard), oder weich formulieren („Studien zeigen…", „Die Forschung deutet darauf hin, dass…"). Die neuen Kapitel 04-15 halten sich an die weichere Variante (keine erfundenen exakten Zahlen).

---

## H · Struktur-Promise im Vorwort wird nicht immer gehalten

**Schwere: niedrig-mittel** (Erwartungsmanagement)

Das Vorwort kündigt für jedes Kapitel fünf feste Sektionen an:

1. Das Problem
2. Die Psychologie dahinter
3. Selbstprüfung
4. Die ersten Schritte
5. Wann professionelle Hilfe nötig ist

In den bestehenden Kapiteln:
- **Kapitel 01**: enthält „Selbstprüfung" (Sektion „die fünf Fragen zum Abschluss") und „Wann professionelle Hilfe sinnvoll wäre" — die anderen drei sind thematisch verwoben, aber nicht als benannte Sektionen.
- **Kapitel 02 & 03**: noch freier strukturiert.

**Empfehlung:** Entweder die Vorwort-Versprechung weicher formulieren („Jedes Kapitel enthält Selbstprüfungen und Hinweise zu professioneller Hilfe") oder in den bestehenden Kapiteln klare Sektionsüberschriften ergänzen. Die neuen Kapitel 04-15 enthalten die fünf Sektionen explizit als H3-Überschriften.

---

## I · „Probonus"-Materialien werden im Haupttext genannt, aber nicht ausgeliefert

**Schwere: hoch** (Käufer-Rechte)

Das Vorwort verweist auf:
- „Workbook: 80 Seiten Arbeitsblätter"
- „Anhang A · 30 Nachrichten-Vorlagen"
- „Anhang B · Red-Flag-Checkliste"
- „Anhang C · Der Bindungsstil-Test Premium (60 Fragen)"

Die Ebook-Landingpage wirbt mit diesen als „5 Bonus-Produkte mit Wertangaben" (39€, 29€, 19€, 49€, 49€).

**Status der Boni im Repository:** Keine Dateien existieren für diese Materialien. Wer heute das Buch kauft, bekommt nur die 4 vorhandenen Kapitel — keine Workbooks, keine Nachrichten-Vorlagen, keine Checkliste, keinen Premium-Test.

**Empfehlung:** DRINGEND. Entweder die Materialien erstellen, oder die Bewerbung temporär zurückfahren, bis sie existieren. Dies ist der rechtlich kritischste Punkt — bei 89,99 € und konkreter Auflistung in Checkout-Seite besteht Lieferschuld.

---

## J · Inhaltliche Redundanzen

**Schwere: niedrig**

Kapitel 01 und 02 thematisieren beide „das Nervensystem sucht das Vertraute" (in 01 als Nina-Beispiel, in 02 als Teil der Bindungstheorie). Die Erklärung in 02 ist tiefer, aber Kapitel 01 wirkt dadurch wie ein Vorgriff. Könnte gestrafft werden, indem 01 nur auf das Phänomen verweist und 02 es erklärt.

**Empfehlung:** Optional — wenn Lektoratsbudget vorhanden. Nicht dringend.

---

## Fazit

Die vier bestehenden Kapitel sind **inhaltlich stark und der Preis rechtfertigt sie** — aber das Produkt hat drei strukturelle Probleme, die vor dem Verkauf an weitere Kunden gelöst werden sollten:

1. **Du-vs-Sie-Inkonsistenz** (B) — kosmetisch aber sichtbar
2. **Falsche Wortzahlen / 200+-Seiten-Versprechen** (B, C) — Vertrauensbruch-Potenzial
3. **Nicht existierende Bonus-Materialien** (I) — Lieferschuld

Die neuen Kapitel 04-15 (in diesem PR) sind so geschrieben, dass sie zu den bestehenden passen, die oben genannten Probleme aber nicht verstärken.
