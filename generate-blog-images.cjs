const sharp = require('sharp');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'public/images/photos');

// SVG icon paths (24x24 viewBox)
const ICONS = {
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="white" opacity="0.9"/>',
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="none" stroke="white" stroke-width="1.5"/><polyline points="9 22 9 12 15 12 15 22" fill="none" stroke="white" stroke-width="1.5"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill="none" stroke="white" stroke-width="1.5"/><line x1="12" y1="9" x2="12" y2="13" stroke="white" stroke-width="1.5"/><line x1="12" y1="17" x2="12.01" y2="17" stroke="white" stroke-width="2"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" fill="none" stroke="white" stroke-width="1.5"/><circle cx="9" cy="7" r="4" fill="none" stroke="white" stroke-width="1.5"/><path d="M23 21v-2a4 4 0 0 0-3-3.87" fill="none" stroke="white" stroke-width="1.5"/><path d="M16 3.13a4 4 0 0 1 0 7.75" fill="none" stroke="white" stroke-width="1.5"/>',
  phone: '<rect x="5" y="2" width="14" height="20" rx="2" ry="2" fill="none" stroke="white" stroke-width="1.5"/><line x1="12" y1="18" x2="12.01" y2="18" stroke="white" stroke-width="2"/>',
  butterfly: '<path d="M12 22c0-8-8-8-8-14a6 6 0 0 1 8-5" fill="none" stroke="white" stroke-width="1.5"/><path d="M12 22c0-8 8-8 8-14a6 6 0 0 0-8-5" fill="none" stroke="white" stroke-width="1.5"/>',
  strong: '<path d="M18 8h1a4 4 0 0 1 0 8h-1" fill="none" stroke="white" stroke-width="1.5"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" fill="none" stroke="white" stroke-width="1.5"/><line x1="6" y1="1" x2="6" y2="4" stroke="white" stroke-width="1.5"/><line x1="10" y1="1" x2="10" y2="4" stroke="white" stroke-width="1.5"/><line x1="14" y1="1" x2="14" y2="4" stroke="white" stroke-width="1.5"/>',
  sunrise: '<path d="M17 18a5 5 0 0 0-10 0" fill="none" stroke="white" stroke-width="1.5"/><line x1="12" y1="2" x2="12" y2="9" stroke="white" stroke-width="1.5"/><line x1="4.22" y1="10.22" x2="5.64" y2="11.64" stroke="white" stroke-width="1.5"/><line x1="1" y1="18" x2="3" y2="18" stroke="white" stroke-width="1.5"/><line x1="21" y1="18" x2="23" y2="18" stroke="white" stroke-width="1.5"/><line x1="18.36" y1="11.64" x2="19.78" y2="10.22" stroke="white" stroke-width="1.5"/><line x1="23" y1="22" x2="1" y2="22" stroke="white" stroke-width="1.5"/><polyline points="8 6 12 2 16 6" fill="none" stroke="white" stroke-width="1.5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" fill="none" stroke="white" stroke-width="1.5"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" fill="none" stroke="white" stroke-width="1.5"/>',
  coffee: '<path d="M18 8h1a4 4 0 0 1 0 8h-1" fill="none" stroke="white" stroke-width="1.5"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" fill="none" stroke="white" stroke-width="1.5"/>',
  flower: '<circle cx="12" cy="12" r="3" fill="white" opacity="0.9"/><path d="M12 2a4 4 0 0 0 0 8 4 4 0 0 0 0-8z" fill="none" stroke="white" stroke-width="1"/><path d="M19 5a4 4 0 0 0-7 3.5" fill="none" stroke="white" stroke-width="1"/><path d="M22 12a4 4 0 0 0-8 0" fill="none" stroke="white" stroke-width="1"/><path d="M19 19a4 4 0 0 0-3.5-7" fill="none" stroke="white" stroke-width="1"/><path d="M12 22a4 4 0 0 0 0-8" fill="none" stroke="white" stroke-width="1"/><path d="M5 19a4 4 0 0 0 7-3.5" fill="none" stroke="white" stroke-width="1"/><path d="M2 12a4 4 0 0 0 8 0" fill="none" stroke="white" stroke-width="1"/><path d="M5 5a4 4 0 0 0 3.5 7" fill="none" stroke="white" stroke-width="1"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="none" stroke="white" stroke-width="1.5"/><path d="M12 8v1" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M8 11h8" stroke="white" stroke-width="1.5"/><path d="M8 14h5" stroke="white" stroke-width="1.5"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="white" opacity="0.9"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2" fill="none" stroke="white" stroke-width="1.5"/><path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke="white" stroke-width="1.5"/>',
  brain: '<path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93" fill="none" stroke="white" stroke-width="1.5"/><path d="M8 6a4 4 0 0 1 8 0" fill="none" stroke="white" stroke-width="1.5"/><path d="M18 10a3 3 0 0 1 0 6" fill="none" stroke="white" stroke-width="1.5"/><path d="M6 10a3 3 0 0 0 0 6" fill="none" stroke="white" stroke-width="1.5"/><path d="M15 19a4 4 0 0 1-6 0" fill="none" stroke="white" stroke-width="1.5"/><circle cx="12" cy="12" r="9" fill="none" stroke="white" stroke-width="1.5"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" fill="none" stroke="white" stroke-width="1.5"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" fill="none" stroke="white" stroke-width="1.5"/>',
  dollar: '<line x1="12" y1="1" x2="12" y2="23" stroke="white" stroke-width="1.5"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" fill="none" stroke="white" stroke-width="1.5"/>',
  plane: '<path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.3c.4-.3.6-.7.5-1.1z" fill="white" opacity="0.9"/>',
  bomb: '<circle cx="11" cy="13" r="9" fill="none" stroke="white" stroke-width="1.5"/><path d="M14.35 4.65l2.3-2.3" stroke="white" stroke-width="1.5"/><path d="M16.65 6.35l1.5-1.5" stroke="white" stroke-width="1.5"/><path d="M19 2l2 2" stroke="white" stroke-width="2"/>',
  clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" fill="none" stroke="white" stroke-width="1.5"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1" fill="none" stroke="white" stroke-width="1.5"/>',
  babykids: '<circle cx="9" cy="7" r="4" fill="none" stroke="white" stroke-width="1.5"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" fill="none" stroke="white" stroke-width="1.5"/><circle cx="18" cy="10" r="2.5" fill="none" stroke="white" stroke-width="1.5"/><path d="M21 21v-1a3 3 0 0 0-3-3" fill="none" stroke="white" stroke-width="1.5"/>',
  sprout: '<path d="M7 20h10" stroke="white" stroke-width="1.5"/><path d="M10 20c5.5-2.5.8-6.4 3-10" fill="none" stroke="white" stroke-width="1.5"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" fill="white" opacity="0.8"/><path d="M14.1 6a7 7 0 0 0-1.5 4.3c1.6.5 2.6.5 3.4.2.8-.3 1.6-1.1 2.4-2.7-2-.8-3.3-.8-4.3-.5z" fill="white" opacity="0.8"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" fill="white" opacity="0.8"/><line x1="4" y1="22" x2="4" y2="15" stroke="white" stroke-width="1.5"/><line x1="4" y1="15" x2="4" y2="3" stroke="white" stroke-width="1.5"/>',
  mirror: '<circle cx="12" cy="10" r="7" fill="none" stroke="white" stroke-width="1.5"/><line x1="12" y1="17" x2="12" y2="22" stroke="white" stroke-width="2"/><line x1="8" y1="22" x2="16" y2="22" stroke="white" stroke-width="1.5"/>',
  mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" fill="none" stroke="white" stroke-width="1.5"/><polyline points="22,6 12,13 2,6" fill="none" stroke="white" stroke-width="1.5"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1.5" fill="white"/><circle cx="17.5" cy="10.5" r="1.5" fill="white"/><circle cx="8.5" cy="7.5" r="1.5" fill="white"/><circle cx="6.5" cy="12" r="1.5" fill="white"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.04-.23-.29-.38-.63-.38-1.04 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-5.52-4.48-9-10-9z" fill="none" stroke="white" stroke-width="1.5"/>',
  ghost: '<path d="M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" fill="none" stroke="white" stroke-width="1.5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="none" stroke="white" stroke-width="1.5"/>',
  wink: '<circle cx="12" cy="12" r="10" fill="none" stroke="white" stroke-width="1.5"/><path d="M8 14s1.5 2 4 2 4-2 4-2" fill="none" stroke="white" stroke-width="1.5"/><line x1="9" y1="9" x2="9.01" y2="9" stroke="white" stroke-width="2.5"/><path d="M16 9c-.5-1-1.5-1-2 0" fill="none" stroke="white" stroke-width="1.5"/>',
  target: '<circle cx="12" cy="12" r="10" fill="none" stroke="white" stroke-width="1.5"/><circle cx="12" cy="12" r="6" fill="none" stroke="white" stroke-width="1.5"/><circle cx="12" cy="12" r="2" fill="white"/>',
  ban: '<circle cx="12" cy="12" r="10" fill="none" stroke="white" stroke-width="1.5"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" stroke="white" stroke-width="1.5"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" fill="none" stroke="white" stroke-width="1.5"/><circle cx="12" cy="13" r="4" fill="none" stroke="white" stroke-width="1.5"/>',
  hearts: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="none" stroke="white" stroke-width="1.5"/><path d="M16 8l2-2" stroke="white" stroke-width="1" opacity="0.6"/><path d="M18 6l1.5 1.5" stroke="white" stroke-width="1" opacity="0.6"/>',
  clock: '<circle cx="12" cy="12" r="10" fill="none" stroke="white" stroke-width="1.5"/><polyline points="12 6 12 12 16 14" fill="none" stroke="white" stroke-width="1.5"/>',
  fire: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" fill="white" opacity="0.85"/>',
  wine: '<line x1="8" y1="22" x2="16" y2="22" stroke="white" stroke-width="1.5"/><line x1="12" y1="11" x2="12" y2="22" stroke="white" stroke-width="1.5"/><path d="M18 7c0 5-3 7-6 7s-6-2-6-7" fill="none" stroke="white" stroke-width="1.5"/><line x1="6" y1="2" x2="18" y2="2" stroke="white" stroke-width="1.5"/><line x1="6" y1="2" x2="6" y2="7" stroke="white" stroke-width="1.5"/><line x1="18" y1="2" x2="18" y2="7" stroke="white" stroke-width="1.5"/>',
  userx: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" fill="none" stroke="white" stroke-width="1.5"/><circle cx="8.5" cy="7" r="4" fill="none" stroke="white" stroke-width="1.5"/><line x1="18" y1="8" x2="23" y2="13" stroke="white" stroke-width="1.5"/><line x1="23" y1="8" x2="18" y2="13" stroke="white" stroke-width="1.5"/>',
};

const imagesToReplace = [
  // PINK SVG PLACEHOLDERS (20)
  { file: 'beziehung-nach-fernbeziehung', title: 'Beziehung nach\nFernbeziehung', icon: 'home', gradient: ['#f43f5e', '#ec4899'] },
  { file: 'beziehung-retten', title: 'Beziehung\nretten', icon: 'hearts', gradient: ['#ef4444', '#f43f5e'] },
  { file: 'beziehungskiller-vermeiden', title: 'Beziehungskiller\nvermeiden', icon: 'alert', gradient: ['#f43f5e', '#e11d48'] },
  { file: 'dating-als-alleinerziehend', title: 'Dating als\nAlleinerziehende/r', icon: 'babykids', gradient: ['#ec4899', '#f43f5e'] },
  { file: 'dating-apps-vergleich', title: 'Dating Apps\nVergleich 2026', icon: 'phone', gradient: ['#8b5cf6', '#6366f1'] },
  { file: 'dating-introvertierte', title: 'Dating für\nIntrovertierte', icon: 'book', gradient: ['#6366f1', '#8b5cf6'] },
  { file: 'dating-mit-behinderung', title: 'Dating mit\nBehinderung', icon: 'heart', gradient: ['#f43f5e', '#ec4899'] },
  { file: 'dating-nach-scheidung', title: 'Dating nach\nScheidung', icon: 'sunrise', gradient: ['#f97316', '#f43f5e'] },
  { file: 'emotionale-abhaengigkeit', title: 'Emotionale\nAbhängigkeit', icon: 'link', gradient: ['#e11d48', '#be123c'] },
  { file: 'erstes-treffen-online-dating', title: 'Vom Chat zum\nersten Treffen', icon: 'coffee', gradient: ['#ec4899', '#f43f5e'] },
  { file: 'hochsensibel-dating', title: 'Hochsensibel\n& Dating', icon: 'flower', gradient: ['#c084fc', '#a855f7'] },
  { file: 'komplimente-richtig-machen', title: 'Komplimente\nrichtig machen', icon: 'chat', gradient: ['#f43f5e', '#fb7185'] },
  { file: 'liebe-finden-ueber-50', title: 'Liebe finden\nüber 50', icon: 'heart', gradient: ['#f43f5e', '#ec4899'] },
  { file: 'online-dating-fuer-senioren', title: 'Online-Dating\nfür Senioren', icon: 'phone', gradient: ['#6366f1', '#8b5cf6'] },
  { file: 'online-dating-fotos', title: 'Perfekte Fotos\nfürs Dating', icon: 'camera', gradient: ['#ec4899', '#f43f5e'] },
  { file: 'polyamorie-grundlagen', title: 'Polyamorie\nGrundlagen', icon: 'hearts', gradient: ['#a855f7', '#ec4899'] },
  { file: 'sexuelle-kompatibilitaet', title: 'Sexuelle\nKompatibilität', icon: 'fire', gradient: ['#f43f5e', '#e11d48'] },
  { file: 'speed-dating-tipps', title: 'Speed Dating\nTipps', icon: 'clock', gradient: ['#f97316', '#f43f5e'] },
  { file: 'toxische-maennlichkeit-dating', title: 'Toxische\nMännlichkeit', icon: 'ban', gradient: ['#ef4444', '#dc2626'] },
  { file: 'vertrauen-nach-betrug', title: 'Vertrauen nach\neinem Betrug', icon: 'lock', gradient: ['#6366f1', '#4f46e5'] },

  // WRONG STOCK PHOTOS (~20)
  { file: 'bindungsangst-erkennen', title: 'Bindungsangst\nerkennen', icon: 'shield', gradient: ['#f43f5e', '#ec4899'] },
  { file: 'emotionale-intelligenz-dating', title: 'Emotionale\nIntelligenz', icon: 'brain', gradient: ['#8b5cf6', '#6366f1'] },
  { file: 'introvertiert-dating', title: 'Introvertiert\n& Dating', icon: 'book', gradient: ['#6366f1', '#818cf8'] },
  { file: 'liebe-und-finanzen', title: 'Liebe und\nFinanzen', icon: 'dollar', gradient: ['#10b981', '#059669'] },
  { file: 'long-distance-beziehung', title: 'Fernbeziehung\nmeistern', icon: 'plane', gradient: ['#3b82f6', '#6366f1'] },
  { file: 'love-bombing-erkennen', title: 'Love Bombing\nerkennen', icon: 'bomb', gradient: ['#ef4444', '#f43f5e'] },
  { file: 'moderne-dating-regeln', title: 'Moderne Dating\nRegeln 2026', icon: 'clipboard', gradient: ['#f43f5e', '#ec4899'] },
  { file: 'dating-mit-kindern', title: 'Dating\nmit Kindern', icon: 'babykids', gradient: ['#ec4899', '#f43f5e'] },
  { file: 'dating-nach-trennung', title: 'Dating nach\neiner Trennung', icon: 'sprout', gradient: ['#10b981', '#34d399'] },
  { file: 'red-flags-erkennen', title: 'Red Flags\nerkennen', icon: 'flag', gradient: ['#ef4444', '#dc2626'] },
  { file: 'selbstliebe-dating', title: 'Selbstliebe als\nDating-Geheimwaffe', icon: 'mirror', gradient: ['#ec4899', '#f472b6'] },
  { file: 'liebe-auf-distanz-tipps', title: 'Liebe auf\nDistanz', icon: 'mail', gradient: ['#6366f1', '#8b5cf6'] },
  { file: 'partner-finden-hobby', title: 'Partner finden\ndurch Hobbys', icon: 'palette', gradient: ['#f97316', '#fb923c'] },
  { file: 'perfektes-dating-profil', title: 'Das perfekte\nDating-Profil', icon: 'star', gradient: ['#f43f5e', '#fb7185'] },
  { file: 'erstes-date-tipps', title: 'Erstes Date\nTipps', icon: 'wine', gradient: ['#ec4899', '#f43f5e'] },
  { file: 'ghosting-umgehen', title: 'Ghosting\numgehen', icon: 'ghost', gradient: ['#6366f1', '#818cf8'] },
  { file: 'dating-nach-narzisst', title: 'Dating nach\neinem Narzissten', icon: 'shield', gradient: ['#8b5cf6', '#a855f7'] },
  { file: 'flirten-lernen', title: 'Flirten\nlernen', icon: 'wink', gradient: ['#f43f5e', '#ec4899'] },
  { file: 'liebe-nach-30', title: 'Dating\nab 30', icon: 'target', gradient: ['#f43f5e', '#f97316'] },
  { file: 'dating-fehler-maenner', title: 'Dating-Fehler\ndie Männer machen', icon: 'userx', gradient: ['#3b82f6', '#6366f1'] },
];

async function generateImage(item) {
  const width = 1200;
  const height = 675;
  const [color1, color2] = item.gradient;
  const lines = item.title.split('\n');
  const iconSvg = ICONS[item.icon] || ICONS.heart;

  const svg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${color1};stop-opacity:1" />
        <stop offset="100%" style="stop-color:${color2};stop-opacity:1" />
      </linearGradient>
    </defs>

    <!-- Background gradient -->
    <rect width="${width}" height="${height}" fill="url(#bg)" />

    <!-- Decorative circles -->
    <circle cx="80" cy="90" r="130" fill="rgba(255,255,255,0.07)" />
    <circle cx="1120" cy="585" r="160" fill="rgba(255,255,255,0.07)" />
    <circle cx="950" cy="70" r="50" fill="rgba(255,255,255,0.05)" />
    <circle cx="180" cy="530" r="35" fill="rgba(255,255,255,0.05)" />
    <circle cx="400" cy="100" r="20" fill="rgba(255,255,255,0.04)" />
    <circle cx="800" cy="550" r="25" fill="rgba(255,255,255,0.04)" />

    <!-- Icon (centered, 80px) -->
    <g transform="translate(${width/2 - 40}, 155) scale(3.33)">
      ${iconSvg}
    </g>

    <!-- Title lines -->
    ${lines.map((line, i) => `
    <text x="${width/2}" y="${330 + i * 68}"
          font-family="'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
          font-size="56" font-weight="800"
          fill="white" text-anchor="middle"
          dominant-baseline="central"
          letter-spacing="-1">${escapeXml(line)}</text>
    `).join('')}

    <!-- Divider -->
    <line x1="${width/2 - 35}" y1="${height - 78}" x2="${width/2 + 35}" y2="${height - 78}" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" />

    <!-- Branding -->
    <text x="${width/2}" y="${height - 45}"
          font-family="Georgia, 'Times New Roman', serif"
          font-size="18" font-weight="400"
          fill="rgba(255,255,255,0.5)" text-anchor="middle"
          letter-spacing="4">HERZBLATT JOURNAL</text>
  </svg>`;

  const outputPath = path.join(OUTPUT_DIR, `${item.file}.webp`);
  await sharp(Buffer.from(svg)).resize(width, height).webp({ quality: 90 }).toFile(outputPath);
  console.log(`  ✓ ${item.file}.webp`);
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

async function main() {
  console.log(`Generating ${imagesToReplace.length} blog images...\n`);
  for (const item of imagesToReplace) {
    try { await generateImage(item); }
    catch (err) { console.error(`  ✗ ${item.file}: ${err.message}`); }
  }
  console.log(`\n✓ Done! Generated ${imagesToReplace.length} images.`);
}

main();
