const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const API_KEY = '32170631-7bbe770025b428be89a4edbb6';
const BLOG_DIR = path.join(__dirname, 'src/content/blog');
const PHOTOS_DIR = path.join(__dirname, 'public/images/photos');
const BLOG_IMG_DIR = path.join(__dirname, 'public/images/blog');

// Ensure dirs exist
[PHOTOS_DIR, BLOG_IMG_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// Extract search terms from filename
function getSearchTerms(filename) {
  const name = filename.replace('.md', '');
  // Map common German dating terms to good Pixabay search queries
  const mappings = [
    [/beziehung.*baby|nach.*baby|eltern/, 'couple baby family'],
    [/beziehung.*streit|konflikt|streiten/, 'couple argument'],
    [/beziehung.*kommunik|gesprach|reden/, 'couple talking'],
    [/beziehung.*vertrau/, 'couple trust hands'],
    [/beziehung.*retten|krise/, 'couple sunset hope'],
    [/beziehung.*ritual|quality.*time/, 'couple cozy home'],
    [/beziehung.*grenz|respekt/, 'couple respect space'],
    [/beziehung.*liebe|liebes/, 'couple love romantic'],
    [/beziehung.*lang|ehe|heirat|hochzeit/, 'couple wedding marriage'],
    [/beziehung.*nahe|intim|nähe/, 'couple intimate close'],
    [/beziehung.*schwieger/, 'family dinner together'],
    [/beziehung/, 'couple relationship happy'],
    [/dating.*app|online.*dating|profil/, 'smartphone dating app'],
    [/dating.*angst|social.*anx|schüchtern/, 'shy person cafe'],
    [/dating.*burnout|müdig|fatigue/, 'tired woman couch'],
    [/dating.*40|über.*40|ü40|ab.*40/, 'mature couple date'],
    [/dating.*introvert/, 'introvert reading cafe'],
    [/dating.*kind|alleinerz/, 'single parent child'],
    [/dating.*trend/, 'young people smartphone'],
    [/dating.*green.*flag/, 'happy couple smiling'],
    [/dating.*red.*flag|warnsignal|toxic/, 'warning sign red'],
    [/dating.*nach.*trenn|neuanfang/, 'woman sunrise new beginning'],
    [/dating.*nach.*narziss/, 'woman freedom nature'],
    [/dating/, 'couple date restaurant'],
    [/erstes.*date|erste.*treffen/, 'first date cafe couple'],
    [/zweites.*date|second.*date/, 'couple walking park'],
    [/flirt|anzieh|attrakt/, 'flirting couple smile'],
    [/ghosting/, 'person alone phone sad'],
    [/fernbeziehung|long.*dist|distanz/, 'long distance video call'],
    [/trenn|schluss|ex-/, 'person alone window'],
    [/liebeskummer|heartbreak/, 'heartbreak sad person'],
    [/selbstliebe|selbst.*akzept/, 'woman mirror self love'],
    [/selbstbewusst|confidence/, 'confident woman city'],
    [/single.*leben|single.*glück/, 'happy single woman city'],
    [/bindungsangst|attachment|bindung/, 'couple holding hands'],
    [/koerpersprache|körpersprache|body.*lang/, 'body language couple'],
    [/texting|whatsapp|nachricht|message/, 'texting smartphone'],
    [/sex|erotik|leidenschaft/, 'passion couple romantic'],
    [/eifersucht|jealous/, 'jealousy couple phone'],
    [/vertrauen|trust/, 'trust couple hands'],
    [/kompliment|charm/, 'couple laughing together'],
    [/hochsensib/, 'sensitive person nature'],
    [/achtsamkeit|mindful/, 'meditation mindfulness'],
    [/emotionale.*intel/, 'emotional intelligence empathy'],
    [/love.*language|liebessprache/, 'couple gift love'],
    [/abenteuer|adventure|outdoor/, 'couple adventure outdoor'],
    [/winter.*date/, 'couple winter snow'],
    [/sommer|urlaub|reise/, 'couple summer vacation'],
    [/valentinstag/, 'valentines day romantic'],
    [/weihnacht/, 'couple christmas cozy'],
    [/kosten|finanzen|geld/, 'couple finances money'],
    [/zusammenzieh|wohnung/, 'couple moving home'],
    [/freund.*finden|sozial/, 'friends socializing group'],
    [/speed.*dating/, 'speed dating event'],
    [/foto|bild.*profil/, 'photography portrait'],
    [/café|coffee|kaffee/, 'coffee date cafe'],
    [/sport|fitness|gym/, 'couple fitness sport'],
    [/haustier|hund|katze/, 'couple pet dog'],
    [/kultur|museum|kunst/, 'couple museum culture'],
    [/kochen|essen|restaurant/, 'couple cooking dinner'],
    [/tanz|dance/, 'couple dancing'],
    [/natur|wandern|park/, 'couple nature walk'],
    [/buch|lesen/, 'reading book cozy'],
    [/psycho|therapie/, 'therapy psychology'],
    [/situationship/, 'confused couple relationship'],
    [/slow.*dating/, 'slow romantic couple'],
    [/bench|bread/, 'person waiting phone'],
  ];

  for (const [regex, query] of mappings) {
    if (regex.test(name)) return query;
  }

  // Fallback: extract key words from filename
  const words = name.split('-').filter(w => w.length > 3).slice(0, 3);
  return words.join(' ') + ' couple love';
}

// Fetch URL as buffer
function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'PixabayImageFetcher/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuffer(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Search Pixabay
function searchPixabay(query) {
  const url = `https://pixabay.com/api/?key=${API_KEY}&q=${encodeURIComponent(query)}&image_type=photo&orientation=horizontal&min_width=800&min_height=400&per_page=5&safesearch=true&lang=de`;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) { reject(e); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Download and convert to webp
async function downloadImage(imageUrl, outputPath) {
  const buffer = await fetchBuffer(imageUrl);
  await sharp(buffer)
    .resize(800, 400, { fit: 'cover', position: 'centre' })
    .webp({ quality: 80 })
    .toFile(outputPath);
}

// Track used Pixabay image IDs to avoid duplicates
const usedImageIds = new Set();

async function processPost(filename) {
  const content = fs.readFileSync(path.join(BLOG_DIR, filename), 'utf8');
  const match = content.match(/^image:\s*["']?([^\s"'\n]+)/m);
  if (!match) return { file: filename, status: 'no-image-field' };

  const imgPath = match[1];
  const imgName = path.basename(imgPath);

  // Determine output directory based on path
  let outputDir;
  if (imgPath.includes('/images/blog/')) {
    outputDir = BLOG_IMG_DIR;
  } else if (imgPath.includes('/images/photos/')) {
    outputDir = PHOTOS_DIR;
  } else {
    outputDir = BLOG_IMG_DIR;
  }

  const outputPath = path.join(outputDir, imgName);

  // Skip if real image already exists (check file size > 5KB to skip placeholders)
  if (fs.existsSync(outputPath)) {
    const stats = fs.statSync(outputPath);
    if (stats.size > 15000) {
      return { file: filename, status: 'exists', size: stats.size };
    }
  }

  const query = getSearchTerms(filename);

  try {
    const result = await searchPixabay(query);
    if (!result.hits || result.hits.length === 0) {
      // Fallback search
      const fallback = await searchPixabay('couple romantic love');
      if (!fallback.hits || fallback.hits.length === 0) {
        return { file: filename, status: 'no-results', query };
      }
      result.hits = fallback.hits;
    }

    // Pick a non-duplicate image
    let selectedHit = null;
    for (const hit of result.hits) {
      if (!usedImageIds.has(hit.id)) {
        selectedHit = hit;
        break;
      }
    }
    if (!selectedHit) selectedHit = result.hits[0]; // fallback to first if all used

    usedImageIds.add(selectedHit.id);

    // Use webformatURL (640px) for speed, or largeImageURL for quality
    const dlUrl = selectedHit.webformatURL;
    await downloadImage(dlUrl, outputPath);

    return { file: filename, status: 'downloaded', query, id: selectedHit.id };
  } catch (err) {
    return { file: filename, status: 'error', error: err.message, query };
  }
}

(async () => {
  const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.md'));
  console.log(`Processing ${files.length} blog posts...`);

  let downloaded = 0, skipped = 0, errors = 0;

  // Process in batches of 5 to respect rate limits
  for (let i = 0; i < files.length; i += 5) {
    const batch = files.slice(i, i + 5);
    const results = await Promise.all(batch.map(f => processPost(f)));

    for (const r of results) {
      if (r.status === 'downloaded') {
        downloaded++;
      } else if (r.status === 'exists') {
        skipped++;
      } else {
        errors++;
        if (r.status === 'error') console.error(`  Error: ${r.file} - ${r.error}`);
      }
    }

    if ((i + 5) % 50 === 0 || i + 5 >= files.length) {
      console.log(`Progress: ${Math.min(i + 5, files.length)}/${files.length} | Downloaded: ${downloaded} | Skipped: ${skipped} | Errors: ${errors}`);
    }

    // Small delay to respect API rate limit (100 requests/min)
    if (downloaded > 0 && downloaded % 20 === 0) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\nDone! Downloaded: ${downloaded} | Already existed: ${skipped} | Errors: ${errors}`);
})();
