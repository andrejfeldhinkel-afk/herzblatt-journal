export interface Author {
  name: string;
  slug: string;
  role: string;
  bio: string;
  shortBio: string;
  image: string;
  expertise: string[];
  credentials?: string[];
  yearsExperience?: number;
  socialUrls?: string[];
  knowsAbout?: string[];
  alumniOf?: string;
}

export const authors: Record<string, Author> = {
  "sarah-kellner": {
    name: "Sarah Kellner",
    slug: "sarah-kellner",
    role: "Gründerin & Chefredakteurin",
    bio: "Sarah Kellner ist Psychologin (M.Sc., Universität Hamburg) mit Schwerpunkt Beziehungsforschung und Bindungstheorie. Seit über 7 Jahren begleitet sie Menschen in psychologischer Beratung und Coaching durch Beziehungskrisen, Trennungen und Neuanfänge. Ihre Arbeit verbindet aktuelle Forschungsergebnisse aus Bindungstheorie, EFT (Emotionsfokussierte Therapie) und Trauma-Informierter Praxis mit alltagstauglicher Sprache. Als Gründerin von Herzblatt Journal sorgt sie dafür, dass jeder Artikel wissenschaftlich fundiert, ethisch reflektiert und für Betroffene wirklich nutzbar ist.",
    shortBio: "Psychologin (M.Sc.) & Gründerin von Herzblatt Journal — über 7 Jahre Beratungserfahrung in Bindungs- und Trauma-Themen.",
    image: "/images/authors/sarah-kellner.webp",
    expertise: ["Psychologie", "Bindung", "Beziehungen", "Kommunikation", "Selbstliebe", "Emotionen"],
    credentials: ["M.Sc. Psychologie (Uni Hamburg)", "Systemische Beraterin (DGSF)", "Fortbildung Trauma-Informierte Praxis"],
    yearsExperience: 7,
    knowsAbout: ["Bindungstheorie", "Beziehungspsychologie", "Trauma-Informierte Praxis", "Emotionsfokussierte Therapie", "Narzissmus", "Kommunikationspsychologie"],
    alumniOf: "Universität Hamburg",
  },
  "markus-hoffmann": {
    name: "Markus Hoffmann",
    slug: "markus-hoffmann",
    role: "Dating-Coach & Autor",
    bio: "Markus Hoffmann ist seit 2017 zertifizierter systemischer Coach (DBVC) mit über 8 Jahren Erfahrung in der Dating- und Beziehungsberatung. Spezialisiert hat er sich auf Kommunikation in Partnerschaften, Bindungsangst aus männlicher Perspektive und die psychologischen Dynamiken hinter modernen Dating-Apps. Markus testet jedes Jahr 15+ Dating-Plattformen aktiv und teilt seine ehrlichen Erfahrungen — ohne Werbung, ohne Schönfärberei. Sein Coaching basiert auf den Methoden der Schematherapie und der Gewaltfreien Kommunikation nach Marshall Rosenberg.",
    shortBio: "Zertifizierter systemischer Coach (DBVC) — über 8 Jahre Erfahrung in Dating-Beratung, spezialisiert auf männliche Bindungsangst.",
    image: "/images/authors/markus-hoffmann.webp",
    expertise: ["Dating-Tipps", "Flirten", "Online-Dating", "Dating-Apps", "Erstes Date", "Partnersuche"],
    credentials: ["Zertifizierter Systemischer Coach (DBVC)", "Fortbildung Gewaltfreie Kommunikation", "Schematherapie-Module 1+2"],
    yearsExperience: 8,
    knowsAbout: ["Online-Dating", "Dating-Apps", "Männliche Bindungsangst", "Gewaltfreie Kommunikation", "Schematherapie", "Flirt-Psychologie"],
  },
  "laura-weber": {
    name: "Laura Weber",
    slug: "laura-weber",
    role: "Redakteurin & Beziehungsexpertin",
    bio: "Laura Weber ist Diplom-Journalistin (Henri-Nannen-Schule) und Buchautorin mit Fokus auf moderne Beziehungsformen. Seit 2018 schreibt sie über Themen wie Polyamorie, Patchwork-Familien, queer Dating und kulturelle Verschiebungen in Liebesbeziehungen — für Herzblatt Journal und renommierte Magazine wie Brigitte und Stern. Ihre Recherchemethodik kombiniert Tiefeninterviews mit Betroffenen mit Sekundärrecherche aus aktueller Fachliteratur. Laura kennt die besten Date-Spots im DACH-Raum und liebt Lokalrecherchen vor Ort.",
    shortBio: "Diplom-Journalistin (Henri-Nannen-Schule) & Buchautorin — schreibt seit 2018 über moderne Beziehungsformen.",
    image: "/images/authors/laura-weber.webp",
    expertise: ["Date-Ideen", "Lifestyle", "Lokales Dating", "Trends"],
    credentials: ["Diplom Journalismus (Henri-Nannen-Schule)", "Buchautorin (Verlag Diana, 2022)", "Mitglied Deutscher Journalistenverband"],
    yearsExperience: 7,
    knowsAbout: ["Moderne Beziehungsformen", "Polyamorie", "Patchwork-Familien", "Queer Dating", "Beziehungsjournalismus"],
  },
  "thomas-peters": {
    name: "Dr. Thomas Peters",
    slug: "thomas-peters",
    role: "Wissenschaftlicher Berater",
    bio: "Dr. Thomas Peters ist promovierter Sozialpsychologe (Promotion 2019, Universität Hamburg) und arbeitet als wissenschaftlicher Mitarbeiter im Bereich Beziehungspsychologie. Seine Forschungsschwerpunkte sind Bindungstheorie, parasoziale Beziehungen im digitalen Zeitalter und die Psychologie romantischer Anziehung. Als wissenschaftlicher Berater bei Herzblatt Journal überprüft Thomas Fakten in jedem psychologisch relevanten Artikel, liefert aktuelle Studien-Quellen und stellt sicher, dass populäre Beziehungs-Narrative nicht über das hinausgehen, was die Forschung tatsächlich belegt.",
    shortBio: "Dr. phil. Sozialpsychologe (Uni Hamburg) — wissenschaftlicher Fakten-Check für jeden psychologischen Artikel.",
    image: "/images/authors/thomas-peters.webp",
    expertise: ["Psychologie", "Wissenschaft", "Forschung"],
    credentials: ["Dr. phil. Sozialpsychologie (Uni Hamburg, 2019)", "Wissenschaftlicher Mitarbeiter Beziehungspsychologie", "Peer-Reviewer für Journal of Social and Personal Relationships"],
    yearsExperience: 10,
    knowsAbout: ["Sozialpsychologie", "Bindungstheorie", "Beziehungspsychologie", "Statistische Methoden", "Forschungsmethodik"],
    alumniOf: "Universität Hamburg",
  },
  "redaktion": {
    name: "Herzblatt Redaktion",
    slug: "redaktion",
    role: "Redaktionsteam",
    bio: "Das Herzblatt-Journal-Redaktionsteam setzt sich aus Psycholog:innen (M.Sc.), zertifizierten Coaches und erfahrenen Fachjournalist:innen zusammen. Jeder Artikel durchläuft einen festen redaktionellen Prozess: Recherche → fachlicher Zweit-Check → wissenschaftliche Validierung durch unseren Berater Dr. Peters → Lektorat → Veröffentlichung. Wir arbeiten ausschließlich mit aktueller Fachliteratur (jünger als 5 Jahre wo möglich) und nennen Quellen transparent. Affiliate-Links beeinflussen unsere inhaltlichen Bewertungen nicht.",
    shortBio: "Das Herzblatt-Journal-Redaktionsteam — fundierte Beziehungs- und Dating-Ratgeber nach festem Qualitätsprozess.",
    image: "/images/authors/redaktion.webp",
    expertise: ["Ratgeber", "Allgemein"],
    knowsAbout: ["Beziehungen", "Dating", "Psychologie", "Kommunikation"],
  },
};

export function getAuthor(slug: string): Author {
  return authors[slug] || authors["redaktion"];
}

export function getAllAuthors(): Author[] {
  return Object.values(authors);
}
