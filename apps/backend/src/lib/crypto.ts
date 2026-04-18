import crypto from 'node:crypto';

/**
 * SHA-256(ip + salt) — DSGVO-konform.
 * Gleiche Logik wie im Frontend-Herzraum-Auth, damit Hashes konsistent bleiben
 * wenn der selbe User von unterschiedlichen Services trackt.
 */
export function hashIp(ip: string): string {
  const salt = process.env.IP_SALT || 'herzblatt-default-salt-please-change';
  return crypto.createHash('sha256').update(ip + salt).digest('hex').slice(0, 32);
}

export function getClientIp(req: Request, headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const real = headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}
