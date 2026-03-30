import fs from 'fs';
import path from 'path';

const dir = 'src/content/blog';
const core = new Set(["Beziehung","Dating","Psychologie","Ratgeber","Kommunikation","Selbstliebe","Date-Ideen","Lifestyle","Online-Dating","Heilung","Flirten","Intimität","Gesundheit","Red Flags","Vertrauen","Dating-Apps","Partnersuche","Trennung","Neuanfang","Lebensphasen","Single-Leben","Erstes Date","Zusammenleben","Sicherheit","Konflikte","Neurodiversität","Familie","Grenzen","Liebeskummer","Lokales Dating","Fernbeziehung","Kennenlernen","Finanzen","Digital Detox","Bindungstypen","Paartherapie","Hochzeit","Eifersucht","LGBTQ+"]);

const nonCore = {};
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.md')) continue;
  const content = fs.readFileSync(path.join(dir, f), 'utf8');
  const parts = content.split('---');
  if (parts.length < 3) continue;
  const fm = parts[1];

  let tags = [];
  // YAML list
  const yamlMatch = fm.match(/^tags:\s*\n((?:\s*-\s+.+\n)*)/m);
  if (yamlMatch) {
    tags = [...yamlMatch[1].matchAll(/-\s+(.+)/g)].map(m => m[1].trim().replace(/^["']|["']$/g, ''));
  }
  // Inline JSON
  if (!tags.length) {
    const inlineMatch = fm.match(/^tags:\s*\[(.+)\]\s*$/m);
    if (inlineMatch) {
      try { tags = JSON.parse('[' + inlineMatch[1] + ']'); } catch(e) {}
    }
  }

  for (const t of tags) {
    if (!core.has(t)) {
      if (!nonCore[t]) nonCore[t] = [];
      nonCore[t].push(f);
    }
  }
}

const entries = Object.entries(nonCore);
if (entries.length) {
  console.log(entries.length + ' non-core tags:');
  for (const [t, files] of entries.sort((a,b) => b[1].length - a[1].length)) {
    console.log('  ' + files.length + 'x ' + t + ' -> ' + files.slice(0,3).join(', '));
  }
} else {
  console.log('All tags are core!');
}
