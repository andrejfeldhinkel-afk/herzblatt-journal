import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// Parse all blog post frontmatter
const postsDir = 'src/content/blog';
const outDir = 'public/og';

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.md'));

for (const file of files) {
  const slug = file.replace('.md', '');
  const outPath = path.join(outDir, `${slug}.png`);

  if (fs.existsSync(outPath)) continue;

  // Parse title from frontmatter
  const content = fs.readFileSync(path.join(postsDir, file), 'utf8');
  const titleMatch = content.match(/^title:\s*"(.+?)"/m);
  const title = titleMatch ? titleMatch[1] : slug;

  // Word-wrap title to ~30 chars per line
  const words = title.split(' ');
  const lines = [];
  let currentLine = '';
  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length > 28 && currentLine) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine = (currentLine + ' ' + word).trim();
    }
  }
  if (currentLine) lines.push(currentLine.trim());

  // Limit to 4 lines max
  const displayLines = lines.slice(0, 4);
  const fontSize = displayLines.length > 3 ? 42 : displayLines.length > 2 ? 48 : 54;
  const lineHeight = fontSize * 1.25;
  const textBlockHeight = displayLines.length * lineHeight;
  const textStartY = (OG_HEIGHT - textBlockHeight) / 2 + 20;

  const titleTexts = displayLines.map((line, i) =>
    `<text x="80" y="${textStartY + i * lineHeight}" font-family="sans-serif" font-weight="800" font-size="${fontSize}" fill="white" letter-spacing="-1">${escapeXml(line)}</text>`
  ).join('\n    ');

  const svg = `<svg width="${OG_WIDTH}" height="${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a0a1e"/>
      <stop offset="50%" stop-color="#2d1233"/>
      <stop offset="100%" stop-color="#1a0a1e"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#f43f5e"/>
      <stop offset="100%" stop-color="#e11d48"/>
    </linearGradient>
  </defs>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#bg)"/>
  <!-- Decorative circles -->
  <circle cx="1050" cy="120" r="200" fill="#f43f5e" opacity="0.06"/>
  <circle cx="1100" cy="500" r="150" fill="#f43f5e" opacity="0.04"/>
  <!-- Accent bar -->
  <rect x="80" y="${textStartY - 50}" width="60" height="4" rx="2" fill="url(#accent)"/>
  <!-- Title -->
  ${titleTexts}
  <!-- Logo area -->
  <text x="80" y="${OG_HEIGHT - 50}" font-family="sans-serif" font-weight="700" font-size="20" fill="#f43f5e">♥</text>
  <text x="105" y="${OG_HEIGHT - 50}" font-family="serif" font-weight="700" font-size="18" fill="white" opacity="0.8">Herzblatt Journal</text>
  <text x="290" y="${OG_HEIGHT - 50}" font-family="sans-serif" font-size="14" fill="white" opacity="0.4">herzblatt-journal.com</text>
</svg>`;

  try {
    await sharp(Buffer.from(svg)).png().toFile(outPath);
    process.stdout.write('.');
  } catch(e) {
    console.error(`\nFAIL: ${slug} - ${e.message}`);
  }
}

console.log(`\nGenerated OG images for ${files.length} posts`);

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
