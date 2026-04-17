/**
 * Shared types zwischen Frontend und Backend.
 * Wird in Phase 1 erweitert — aktuell nur die Basis-Events.
 */

export interface PageviewEvent {
  ts: string;
  path: string;
  referrer: string;
  ua?: string;
}

export interface ClickEvent {
  ts: string;
  target: string;
  source: string;
  type?: string;
}

export interface RegistrationEvent {
  ts: string;
  email: string;
  source: string;
}

export interface SubscriberEntry {
  email: string;
  createdAt: string;
  source: string;
}
