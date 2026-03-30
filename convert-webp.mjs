import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function convertDir(dir) {
  const files = fs.readdirSync(dir);
  let count = 0;
  for (const file of files) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) { count += await convertDir(full); continue; }
    if (!file.match(/\.(jpg|jpeg|png)$/i)) continue;
    const webp = full.replace(/\.(jpg|jpeg|png)$/i, '.webp');
    if (fs.existsSync(webp)) continue;
    try {
      await sharp(full).webp({ quality: 82 }).toFile(webp);
      const origSize = stat.size;
      const newSize = fs.statSync(webp).size;
      console.log(`${file}: ${Math.round(origSize/1024)}K -> ${Math.round(newSize/1024)}K (${Math.round((1-newSize/origSize)*100)}% smaller)`);
      count++;
    } catch(e) { console.error('FAIL: ' + file + ' ' + e.message); }
  }
  return count;
}

let total = 0;
total += await convertDir('public/images/photos');
total += await convertDir('public/images/avatars');

const hbg = 'public/images/hero-bg.jpg';
if (fs.existsSync(hbg) && !fs.existsSync('public/images/hero-bg.webp')) {
  await sharp(hbg).webp({ quality: 82 }).toFile('public/images/hero-bg.webp');
  console.log('hero-bg.jpg converted');
  total++;
}
console.log('Total converted: ' + total);
