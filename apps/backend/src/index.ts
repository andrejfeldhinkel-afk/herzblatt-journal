import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import pageviewRoute from './routes/pageview.js';
import trackClickRoute from './routes/track-click.js';
import newsletterRoute from './routes/newsletter.js';
import registerRoute from './routes/register.js';
import readersRoute from './routes/readers.js';

const app = new Hono();

app.use('*', cors({
  origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:4321').split(',').map(s => s.trim()),
  credentials: true,
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}));

// Health-Check
app.get('/health', (c) => c.json({ ok: true, service: 'herzblatt-backend', ts: new Date().toISOString() }));

// Root
app.get('/', (c) => c.text('Herzblatt Backend API — siehe /health'));

// Public API Routes
app.route('/pageview', pageviewRoute);
app.route('/track-click', trackClickRoute);
app.route('/newsletter', newsletterRoute);
app.route('/register', registerRoute);
app.route('/readers', readersRoute);

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || '0.0.0.0';

serve({
  fetch: app.fetch,
  port,
  hostname: host,
}, (info) => {
  console.log(`[backend] listening on http://${info.address}:${info.port}`);
});
