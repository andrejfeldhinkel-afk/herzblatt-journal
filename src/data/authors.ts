export interface Author {
  name: string;
  slug: string;
  role: string;
  bio: string;
  shortBio: string;
  image: string;
  expertise: string[];
}

export const authors: Record<string, Author> = {
  "sarah-kellner": {
    name: "Sarah Kellner",
    slug: "sarah-kellner",
    role: "Gründerin & Chefredakteurin",
    bio: "Psychologin (M.Sc.) mit Schwerpunkt Beziehungsforschung. Sarah hat selbst das Auf und Ab der modernen Datingwelt durchlebt und bringt Fachkenntnis mit persönlicher Erfahrung zusammen. Als Gründerin von Herzblatt Journal verbindet sie wissenschaftliche Erkenntnisse mit alltagstauglichen Tipps für bessere Beziehungen.",
    shortBio: "Psychologin (M.Sc.) & Gründerin von Herzblatt Journal — verbindet Forschung mit persönlicher Dating-Erfahrung.",
    image: "/images/authors/sarah-kellner.webp",
    expertise: ["Psychologie", "Bindung", "Beziehungen", "Kommunikation", "Selbstliebe", "Emotionen"],
  },
  "markus-hoffmann": {
    name: "Markus Hoffmann",
    slug: "markus-hoffmann",
    role: "Dating-Coach & Autor",
    bio: "Zertifizierter systemischer Coach mit über 8 Jahren Erfahrung. Markus spezialisiert sich auf Kommunikation, Bindungsangst und die männliche Perspektive beim Dating. Er testet regelmäßig Dating-Apps und -Plattformen und teilt seine ehrlichen Erfahrungen mit praxisnahen Tipps.",
    shortBio: "Systemischer Coach — spezialisiert auf Kommunikation, Bindungsangst und die männliche Perspektive beim Dating.",
    image: "/images/authors/markus-hoffmann.webp",
    expertise: ["Dating-Tipps", "Flirten", "Online-Dating", "Dating-Apps", "Erstes Date", "Partnersuche"],
  },
  "laura-weber": {
    name: "Laura Weber",
    slug: "laura-weber",
    role: "Redakteurin & Beziehungsexpertin",
    bio: "Journalistin und Buchautorin mit Fokus auf moderne Beziehungsformen. Laura schreibt über alles von Polyamorie bis Patchwork-Familien — immer mit einem offenen Blick. Sie kennt die besten Date-Spots im DACH-Raum und liebt es, neue Orte zu entdecken.",
    shortBio: "Journalistin & Buchautorin — schreibt über moderne Beziehungsformen, Lifestyle und die besten Date-Spots.",
    image: "/images/authors/laura-weber.webp",
    expertise: ["Date-Ideen", "Lifestyle", "Lokales Dating", "Trends"],
  },
  "thomas-peters": {
    name: "Dr. Thomas Peters",
    slug: "thomas-peters",
    role: "Wissenschaftlicher Berater",
    bio: "Promovierter Sozialpsychologe und Forscher an der Universität Hamburg. Thomas sorgt dafür, dass unsere Inhalte auf dem neuesten Stand der Wissenschaft basieren. Er überprüft Fakten, liefert Hintergrundwissen und schreibt selbst über die Wissenschaft hinter Liebe und Anziehung.",
    shortBio: "Sozialpsychologe & Forscher — sorgt für wissenschaftlich fundierte Inhalte bei Herzblatt Journal.",
    image: "/images/authors/thomas-peters.webp",
    expertise: ["Psychologie", "Wissenschaft", "Forschung"],
  },
  "redaktion": {
    name: "Herzblatt Redaktion",
    slug: "redaktion",
    role: "Redaktionsteam",
    bio: "Das Redaktionsteam von Herzblatt Journal besteht aus erfahrenen Autoren, Psychologen und Dating-Experten. Gemeinsam recherchieren und schreiben wir fundierte Ratgeber rund um die Themen Liebe, Dating und Beziehungen.",
    shortBio: "Das Herzblatt Journal Redaktionsteam — fundierte Ratgeber rund um Liebe und Dating.",
    image: "/images/authors/redaktion.webp",
    expertise: ["Ratgeber", "Allgemein"],
  },
};

export function getAuthor(slug: string): Author {
  return authors[slug] || authors["redaktion"];
}

export function getAllAuthors(): Author[] {
  return Object.values(authors);
}
