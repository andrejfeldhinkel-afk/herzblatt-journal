import crypto from 'node:crypto';

/**
 * Minimal-Länge für das Salt. Weniger ist DSGVO-mäßig Murks —
 * IPv4 hat nur 4 Mrd. Werte, also braucht's genug Entropie im Salt,
 * damit Rainbow-Tables nicht trivial vorberechenbar sind.
 */
const MIN_SALT_LENGTH = 16;

/**
 * SHA-256(ip + salt) — DSGVO-konform.
 * Gleiche Logik wie im Frontend-Herzraum-Auth, damit Hashes konsistent bleiben
 * wenn der selbe User von unterschiedlichen Services trackt.
 *
 * **Fail-closed:** Fehlt die `IP_SALT`-Env oder ist sie zu kurz, wirft die
 * Funktion sofort. Früher gab es einen hardcoded Default-Salt — das war eine
 * DSGVO-Falle, weil der Default im Source lag und die Hashes damit weltweit
 * vorberechenbar wurden. Jetzt gilt: **kein Salt → kein Hash**.
 */
export function hashIp(ip: string): string {
  const salt = process.env.IP_SALT;
  if (!salt || salt.length < MIN_SALT_LENGTH) {
    throw new Error(
      `IP_SALT env var missing or too short (<${MIN_SALT_LENGTH} chars) — refusing to hash with default`,
    );
  }
  return crypto.createHash('sha256').update(ip + salt).digest('hex').slice(0, 32);
}

/**
 * Boot-time Check: Wird bei Server-Start aufgerufen, damit ein Deployment ohne
 * IP_SALT laut scheitert statt silent den Default zu nutzen.
 * Wirft einen aussagekräftigen Error, dessen Nachricht vom Aufrufer geloggt
 * und/oder an Sentry gemeldet werden kann.
 */
export function assertIpSaltConfigured(): void {
  const salt = process.env.IP_SALT;
  if (!salt || salt.length < MIN_SALT_LENGTH) {
    throw new Error(
      `IP_SALT env var missing or too short (min ${MIN_SALT_LENGTH} chars) — refusing to boot`,
    );
  }
}

export function getClientIp(req: Request, headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const real = headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}
