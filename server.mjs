import { handler } from './dist/server/entry.mjs';
import http from 'http';

const PORT = process.env.PORT || 9991;
const HOST = process.env.HOST || '0.0.0.0';

// 301 Redirects for merged/deleted articles
const redirects = {
  '/blog/kennenlernen-fragen-date': '/blog/dating-fragen-kennenlernen',
  '/blog/dating-als-alleinerziehend-tipps': '/blog/dating-mit-kindern-patchwork',
  '/blog/dating-mit-chronischer-krankheit': '/blog/dating-mit-krankheit-chronisch',
  '/blog/dating-nach-narzissmus': '/blog/dating-nach-narcissistischer-beziehung',
  '/blog/dating-als-schuechterne-frau': '/blog/dating-tipps-fuer-schuechterne-frauen',
  '/blog/erste-nachricht-online-dating': '/blog/dating-kommunikation-erste-nachricht-tipps',
  '/blog/beziehung-emotionale-intelligenz': '/blog/emotionale-intelligenz-beziehung',
  '/blog/emotionale-intelligenz-beziehung-entwickeln': '/blog/emotionale-intelligenz-beziehung',
  '/blog/erste-beziehung-ratgeber': '/blog/erste-beziehung-tipps-guide',
  '/blog/gaslighting-erkennen-beziehung-guide': '/blog/gaslighting-beziehung',
  '/blog/ghosting-umgehen': '/blog/ghosting-komplett-guide',
  '/blog/inneres-kind-heilen-beziehung': '/blog/inner-child-beziehung',
  '/blog/beziehung-introvertiert-extrovertiert-paar': '/blog/dating-introvertiert-extrovertiert-paar-guide',
  '/blog/lovebombing-erkennen-schuetzen': '/blog/love-bombing-erkennen-schuetzen',
  '/blog/partner-mit-depression-unterstuetzen': '/blog/partner-depression-unterstuetzen-guide',
  '/blog/beziehung-toxische-schwiegereltern': '/blog/beziehung-toxische-schwiegereltern-umgang',
  '/blog/beziehung-unterschiedliche-libido': '/blog/beziehung-unterschiedliche-libido-loesungen',
  '/blog/verlustangst-beziehung': '/blog/verlustangst-beziehung-ueberwinden',
  '/blog/beziehung-zusammenziehen-richtige-zeitpunkt': '/blog/zusammenziehen-oder-nicht',
  '/blog/beziehung-staerken-5-sprachen-der-liebe': '/blog/liebessprachen-komplett-guide',
  '/blog/love-languages-beziehung': '/blog/liebessprachen-komplett-guide',
  '/blog/love-languages-komplett-guide': '/blog/liebessprachen-komplett-guide',
  '/blog/liebessprachen-test-anleitung': '/blog/liebessprachen-komplett-guide',
  '/blog/beziehung-eifersucht-ueberwinden': '/blog/beziehung-und-eifersucht-ueberwinden',
  '/blog/eifersucht-beziehung-ueberwinden': '/blog/beziehung-und-eifersucht-ueberwinden',
  '/blog/eifersucht-ueberwinden-tipps': '/blog/beziehung-und-eifersucht-ueberwinden',
  '/blog/beziehung-streit-richtig': '/blog/streit-beziehung-richtig-loesen',
  '/blog/richtig-streiten-beziehung': '/blog/streit-beziehung-richtig-loesen',
  '/blog/zusammenziehen-tipps': '/blog/zusammenziehen-oder-nicht',
  '/blog/zusammenziehen-wann-richtig': '/blog/zusammenziehen-oder-nicht',
  '/blog/beziehung-nach-trennung-freunde-bleiben': '/blog/freundschaft-nach-trennung',
  '/blog/trennung-freundschaft-bleiben': '/blog/freundschaft-nach-trennung',
  '/blog/dating-burnout-recovery': '/blog/dating-nach-burnout',
  '/blog/dating-burnout': '/blog/dating-nach-burnout',
  '/blog/catfishing-online-dating-schutz': '/blog/catfishing-erkennen-schuetzen',
  '/blog/date-ideen-fuer-jede-situation': '/blog/date-ideen-komplett-sammlung',
  '/blog/date-ideen-nach-budget': '/blog/date-ideen-komplett-sammlung',
  '/blog/emotionale-intelligenz-dating': '/blog/emotionale-intelligenz-beziehung',
  '/blog/emotionale-intelligenz-verbessern': '/blog/emotionale-intelligenz-beziehung',
  '/blog/erste-beziehung-tipps': '/blog/erste-beziehung-tipps-guide',
  '/blog/dating-introvertiert-extrovertiert': '/blog/dating-introvertiert-extrovertiert-paar-guide',
  '/blog/beziehung-introvertiert-extrovertiert': '/blog/dating-introvertiert-extrovertiert-paar-guide',
};

const tagRedirects = {
    '/tags/Interkulturell': '/tags/',
    '/tags/Interkulturell/': '/tags/',
    '/tags/Freiheit': '/tags/',
    '/tags/Freiheit/': '/tags/',
    '/tags/dopamine': '/tags/',
    '/tags/dopamine/': '/tags/',
    '/tags/Geldmanagement': '/tags/',
    '/tags/Geldmanagement/': '/tags/',
    '/tags/Komplimente': '/tags/',
    '/tags/Komplimente/': '/tags/',
    '/tags/Profilfotos': '/tags/',
    '/tags/Profilfotos/': '/tags/',
    '/tags/Unterschiede': '/tags/',
    '/tags/Unterschiede/': '/tags/',
    '/tags/Beziehungskommunikation': '/tags/',
    '/tags/Beziehungskommunikation/': '/tags/',
    '/tags/Mythen': '/tags/',
    '/tags/Mythen/': '/tags/',
    '/tags/Quality%20Time': '/tags/',
    '/tags/Quality%20Time/': '/tags/',
    '/tags/Quality Time': '/tags/',
    '/tags/Quality Time/': '/tags/',
    '/tags/Style': '/tags/',
    '/tags/Style/': '/tags/',
    '/tags/Achtsamkeit': '/tags/',
    '/tags/Achtsamkeit/': '/tags/',
    '/tags/Ghosting': '/tags/',
    '/tags/Ghosting/': '/tags/',
    '/tags/App-Test': '/tags/',
    '/tags/App-Test/': '/tags/',
    '/tags/Karriere': '/tags/',
    '/tags/Karriere/': '/tags/',
    '/tags/Konversation': '/tags/',
    '/tags/Konversation/': '/tags/',
    '/tags/Typen': '/tags/',
    '/tags/Typen/': '/tags/',
    '/tags/Dating%20Dresden': '/tags/',
    '/tags/Dating%20Dresden/': '/tags/',
    '/tags/Dating Dresden': '/tags/',
    '/tags/Dating Dresden/': '/tags/',
    '/tags/Paar-Planung': '/tags/',
    '/tags/Paar-Planung/': '/tags/',
    '/tags/beziehungszyklus': '/tags/',
    '/tags/beziehungszyklus/': '/tags/',
    '/tags/Toxische%20Beziehung': '/tags/',
    '/tags/Toxische%20Beziehung/': '/tags/',
    '/tags/Toxische Beziehung': '/tags/',
    '/tags/Toxische Beziehung/': '/tags/',
    '/tags/SMS': '/tags/',
    '/tags/SMS/': '/tags/',
    '/tags/Recovery': '/tags/',
    '/tags/Recovery/': '/tags/',
    '/tags/Dating%20Stuttgart': '/tags/',
    '/tags/Dating%20Stuttgart/': '/tags/',
    '/tags/Dating Stuttgart': '/tags/',
    '/tags/Dating Stuttgart/': '/tags/',
    '/tags/Glück': '/tags/',
    '/tags/Glück/': '/tags/',
    '/tags/WhatsMeet': '/tags/',
    '/tags/WhatsMeet/': '/tags/',
    '/tags/Rizz': '/tags/',
    '/tags/Rizz/': '/tags/',
    '/tags/Gesprächsstarter': '/tags/',
    '/tags/Gesprächsstarter/': '/tags/',
    '/tags/Dating-Trends': '/tags/',
    '/tags/Dating-Trends/': '/tags/',
    '/tags/Maenner': '/tags/',
    '/tags/Maenner/': '/tags/',
    '/tags/Mentale%20Gesundheit': '/tags/',
    '/tags/Mentale%20Gesundheit/': '/tags/',
    '/tags/Mentale Gesundheit': '/tags/',
    '/tags/Mentale Gesundheit/': '/tags/',
    '/tags/Fotos': '/tags/',
    '/tags/Fotos/': '/tags/',
    '/tags/Herzschmerz': '/tags/',
    '/tags/Herzschmerz/': '/tags/',
    '/tags/Ideen': '/tags/',
    '/tags/Ideen/': '/tags/',
    '/tags/Effizienz': '/tags/',
    '/tags/Effizienz/': '/tags/',
    '/tags/Bucket%20List': '/tags/',
    '/tags/Bucket%20List/': '/tags/',
    '/tags/Bucket List': '/tags/',
    '/tags/Bucket List/': '/tags/',
    '/tags/Erste-Nachricht': '/tags/',
    '/tags/Erste-Nachricht/': '/tags/',
    '/tags/Angst': '/tags/',
    '/tags/Angst/': '/tags/',
    '/tags/Dating%20mit%20Kind': '/tags/',
    '/tags/Dating%20mit%20Kind/': '/tags/',
    '/tags/Dating mit Kind': '/tags/',
    '/tags/Dating mit Kind/': '/tags/',
    '/tags/Selbstakzeptanz': '/tags/',
    '/tags/Selbstakzeptanz/': '/tags/',
    '/tags/Dating%20Düsseldorf': '/tags/',
    '/tags/Dating%20Düsseldorf/': '/tags/',
    '/tags/Dating Düsseldorf': '/tags/',
    '/tags/Dating Düsseldorf/': '/tags/',
    '/tags/Frau': '/tags/',
    '/tags/Frau/': '/tags/',
    '/tags/jahreszeiten%20beziehung': '/tags/',
    '/tags/jahreszeiten%20beziehung/': '/tags/',
    '/tags/jahreszeiten beziehung': '/tags/',
    '/tags/jahreszeiten beziehung/': '/tags/',
    '/tags/phasen%20beziehung': '/tags/',
    '/tags/phasen%20beziehung/': '/tags/',
    '/tags/phasen beziehung': '/tags/',
    '/tags/phasen beziehung/': '/tags/',
    '/tags/Wellness': '/tags/',
    '/tags/Wellness/': '/tags/',
    '/tags/Profiloptimierung': '/tags/',
    '/tags/Profiloptimierung/': '/tags/',
    '/tags/Timeline': '/tags/',
    '/tags/Timeline/': '/tags/',
    '/tags/Safety': '/tags/',
    '/tags/Safety/': '/tags/',
    '/tags/Körperliche%20Nähe': '/tags/',
    '/tags/Körperliche%20Nähe/': '/tags/',
    '/tags/Körperliche Nähe': '/tags/',
    '/tags/Körperliche Nähe/': '/tags/',
    '/tags/Senior%20Dating': '/tags/',
    '/tags/Senior%20Dating/': '/tags/',
    '/tags/Senior Dating': '/tags/',
    '/tags/Senior Dating/': '/tags/',
    '/tags/Prozess': '/tags/',
    '/tags/Prozess/': '/tags/',
    '/tags/Paar': '/tags/',
    '/tags/Paar/': '/tags/',
    '/tags/Erfolg': '/tags/',
    '/tags/Erfolg/': '/tags/',
    '/tags/Geheimnis': '/tags/',
    '/tags/Geheimnis/': '/tags/',
    '/blog/dating-introvertiert-extrovertiert-paar/': '/blog/dating-introvertiert-extrovertiert-paar-guide/',
};

const server = http.createServer((req, res) => {
  // Check redirects BEFORE Astro handler (catches pre-rendered 404s)
  const path = (req.url || '').replace(/\/+$/, '') || '/';
  const dest = redirects[path];
  if (dest) {
    res.writeHead(301, { 'Location': dest + '/' });
    res.end();
    return;
  }

  // Wrap the response to inject caching headers
  const origWriteHead = res.writeHead;
  res.writeHead = function(statusCode, statusMessage, headers) {
    const ct = res.getHeader('content-type') || '';
    const reqPath = req.url || '';
    
    // Security headers
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    
    // Caching headers
    if (reqPath.match(/\.(webp|jpg|jpeg|png|gif|svg|ico|woff2?|ttf|eot)(\?|$)/i)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (reqPath.match(/\.(css|js)(\?|$)/i) || reqPath.match(/\/_astro\//)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (typeof ct === 'string' && ct.includes('text/html')) {
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    }
    
    return origWriteHead.call(this, statusCode, statusMessage, headers);
  };
  
  // Check tag redirects
  const tagPath = (req.url || '').split('?')[0];
  const tagDest = tagRedirects[tagPath] || tagRedirects[decodeURIComponent(tagPath)];
  if (tagDest) {
    res.writeHead(301, { 'Location': tagDest });
    res.end();
    return;
  }

  handler(req, res);
});

server.listen(PORT, HOST, () => {
  console.log('Server running on http://' + HOST + ':' + PORT);
});
