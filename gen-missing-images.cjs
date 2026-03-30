const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.join(__dirname, 'public/images/blog');

// Get all needed images from blog posts
const blogDir = path.join(__dirname, 'src/content/blog');
const files = fs.readdirSync(blogDir).filter(f => f.endsWith('.md'));

const neededImages = new Set();
for (const file of files) {
  const content = fs.readFileSync(path.join(blogDir, file), 'utf8');
  const match = content.match(/^image:\s*["']?([^\s"']+)/m);
  if (match) {
    const imgPath = match[1].replace(/^\/images\/blog\//, '');
    neededImages.add(imgPath);
  }
}

// Filter to only missing ones
const missing = [...neededImages].filter(img => !fs.existsSync(path.join(OUTPUT_DIR, img)));
console.log(`Total needed: ${neededImages.size}, Missing: ${missing.length}`);

// Gradient color pairs based on keywords in filename
function getGradient(name) {
  if (name.match(/liebe|love|herz|heart|romant/)) return ['#f43f5e', '#ec4899'];
  if (name.match(/beziehung|partner|paar|ehe/)) return ['#e11d48', '#be123c'];
  if (name.match(/dating-app|online|digital|profil/)) return ['#8b5cf6', '#6366f1'];
  if (name.match(/flirt|anzieh|attrakt/)) return ['#f97316', '#f43f5e'];
  if (name.match(/trenn|schluss|ex-|ghosting|toxic/)) return ['#7f1d1d', '#991b1b'];
  if (name.match(/selbst|single|allein/)) return ['#059669', '#10b981'];
  if (name.match(/sex|intim|erotik/)) return ['#9f1239', '#e11d48'];
  if (name.match(/psycho|angst|bindung|attach/)) return ['#6366f1', '#818cf8'];
  if (name.match(/kommun|streit|konflikt|gespräch/)) return ['#0891b2', '#06b6d4'];
  if (name.match(/date-idee|abenteuer|outdoor|reise/)) return ['#16a34a', '#22c55e'];
  if (name.match(/fernbez|distanz|long/)) return ['#7c3aed', '#a78bfa'];
  if (name.match(/heirat|hochzeit|verlobung/)) return ['#db2777', '#f472b6'];
  if (name.match(/kind|famili|eltern|baby/)) return ['#ea580c', '#f97316'];
  if (name.match(/alter|40|50|senior/)) return ['#b45309', '#d97706'];
  if (name.match(/sicher|vertrau|respekt/)) return ['#0d9488', '#14b8a6'];
  // Default pink/rose
  return ['#f43f5e', '#fb7185'];
}

// Extract a readable title from filename
function getTitle(name) {
  return name
    .replace('.webp', '')
    .replace(/-/g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function generateImage(filename) {
  const [color1, color2] = getGradient(filename);
  const title = getTitle(filename);
  
  // Split title into max 3 lines
  const words = title.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).length > 20 && current) {
      lines.push(current.trim());
      current = word;
    } else {
      current += ' ' + word;
    }
  }
  if (current.trim()) lines.push(current.trim());
  const displayLines = lines.slice(0, 3);
  
  const textY = 200 - (displayLines.length * 24);
  const textSvg = displayLines.map((line, i) => 
    `<text x="400" y="${textY + i * 48}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="36" font-weight="700" fill="white" opacity="0.95">${line}</text>`
  ).join('');

  const svg = `<svg width="800" height="400" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${color1}"/>
        <stop offset="100%" stop-color="${color2}"/>
      </linearGradient>
    </defs>
    <rect width="800" height="400" fill="url(#bg)"/>
    <rect width="800" height="400" fill="black" opacity="0.15"/>
    <!-- Decorative circles -->
    <circle cx="650" cy="80" r="120" fill="white" opacity="0.05"/>
    <circle cx="150" cy="350" r="80" fill="white" opacity="0.04"/>
    ${textSvg}
    <text x="400" y="${textY + displayLines.length * 48 + 20}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" fill="white" opacity="0.5">herzblatt-journal.com</text>
  </svg>`;

  await sharp(Buffer.from(svg))
    .resize(800, 400)
    .webp({ quality: 82 })
    .toFile(path.join(OUTPUT_DIR, filename));
}

(async () => {
  let done = 0;
  const batch = 20;
  for (let i = 0; i < missing.length; i += batch) {
    const chunk = missing.slice(i, i + batch);
    await Promise.all(chunk.map(f => generateImage(f).catch(e => console.error(`Failed: ${f}`, e.message))));
    done += chunk.length;
    if (done % 100 === 0 || done === missing.length) {
      console.log(`Generated ${done}/${missing.length}`);
    }
  }
  console.log(`Done! Generated ${done} images in ${OUTPUT_DIR}`);
})();
