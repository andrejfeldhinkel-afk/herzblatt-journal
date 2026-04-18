/**
 * VAPID-Keypair-Generator für Web-Push.
 *
 * Ausführen:
 *   cd apps/backend
 *   pnpm exec tsx scripts/generate-vapid.ts
 *
 * Ergebnis: Public + Private Key im Base64URL-Format. Diese als Env-Vars
 * in Railway setzen:
 *   VAPID_PUBLIC_KEY  = <publicKey>
 *   VAPID_PRIVATE_KEY = <privateKey>
 *   VAPID_SUBJECT     = mailto:andrej@leadpartner.net
 *
 * WICHTIG: Die Keys NIEMALS ins Git einchecken. Einmal generieren, in Railway
 * eintragen — bei Key-Rotation verlieren ALLE bestehenden Subscriptions ihre
 * Gültigkeit und User müssen neu aktivieren.
 */
import { webcrypto } from 'node:crypto';

const crypto = webcrypto as unknown as Crypto;

function bufToB64Url(buf: Uint8Array): string {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function main() {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );

  const pubJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const privJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);

  // Public Key = uncompressed point (0x04 || X || Y) = 65 Bytes
  const x = Buffer.from(pubJwk.x!, 'base64');
  const y = Buffer.from(pubJwk.y!, 'base64');
  const publicKey = new Uint8Array(65);
  publicKey[0] = 0x04;
  publicKey.set(x, 1);
  publicKey.set(y, 33);

  // Private Key = raw 32 bytes
  const privateKey = Buffer.from(privJwk.d!, 'base64');

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  🔑  VAPID Key Pair — für Web-Push-Notifications       ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  console.log('VAPID_PUBLIC_KEY=' + bufToB64Url(publicKey));
  console.log('VAPID_PRIVATE_KEY=' + bufToB64Url(privateKey));
  console.log('VAPID_SUBJECT=mailto:andrej@leadpartner.net');
  console.log('\nNächster Schritt:');
  console.log('  1. Diese 3 Env-Vars im Railway-Backend-Service eintragen');
  console.log('     (Service: backend, ID 74114171-75cf-4887-ab82-92bd5a1d6478)');
  console.log('  2. Backend neu deployen');
  console.log('  3. In /herzraum/push prüfen, dass "VAPID konfiguriert" grün ist\n');
}

main().catch((err) => {
  console.error('[generate-vapid] failed:', err);
  process.exit(1);
});
