/**
 * Persona service — coherent identities across columns.
 *
 * When multiple columns share a `personaGroup` value, the same persona is
 * built once per row and referenced by each column's `fakerFn` (e.g.
 * `persona.fullName`, `persona.email`). The result: name → email → phone →
 * city all reference the same person, instead of being independently random.
 *
 * Lifecycle: a fresh PersonaCache is created per row by the generator, then
 * discarded. No cross-row coherence — each row gets fresh personas.
 */

import type { Faker } from '@faker-js/faker';

export interface Persona {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  username: string;
  phone: string;
  birthdate: Date;
  age: number;
  jobTitle: string;
  company: string;
  city: string;
  state: string;
  country: string;
  countryCode: string;
  postalCode: string;
  streetAddress: string;
  avatarUrl: string;
  bio: string;
}

export class PersonaCache {
  private cache = new Map<string, Persona>();

  constructor(private faker: Faker) {}

  /** Get or build a persona for the given group key. */
  get(groupId: string): Persona {
    let persona = this.cache.get(groupId);
    if (!persona) {
      persona = buildPersona(this.faker);
      this.cache.set(groupId, persona);
    }
    return persona;
  }
}

function buildPersona(f: Faker): Persona {
  const firstName = f.person.firstName();
  const lastName = f.person.lastName();
  const fullName = `${firstName} ${lastName}`;

  // Email derived from name — local-part is plausible
  const localPart = (firstName + '.' + lastName)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9.]/g, '');
  const domain = f.helpers.arrayElement([
    'gmail.com', 'outlook.com', 'yahoo.com', 'protonmail.com',
    'fastmail.com', 'icloud.com', f.internet.domainName(),
  ]);
  const email = `${localPart || f.internet.username().toLowerCase()}@${domain}`;

  const username = (firstName.toLowerCase() + lastName.toLowerCase().slice(0, 1) + f.string.numeric(2))
    .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

  const birthdate = f.date.birthdate({ mode: 'age', min: 21, max: 65 });
  const age = new Date().getFullYear() - birthdate.getFullYear();

  // Build address atomically so city/state/zip are at least from the same locale
  const city = f.location.city();
  const state = f.location.state();
  const country = f.location.country();
  const countryCode = f.location.countryCode();
  const postalCode = f.location.zipCode();
  const streetAddress = f.location.streetAddress();

  // Avatar: deterministic dicebear URL seeded by username (no network needed at gen time)
  const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username)}`;

  return {
    firstName,
    lastName,
    fullName,
    email,
    username,
    phone: f.phone.number(),
    birthdate,
    age,
    jobTitle: f.person.jobTitle(),
    company: f.company.name(),
    city,
    state,
    country,
    countryCode,
    postalCode,
    streetAddress,
    avatarUrl,
    bio: `${f.person.jobTitle()} at ${f.company.name()}. Based in ${city}.`,
  };
}

/** Maps a `persona.<field>` fakerFn to the corresponding persona attribute. */
export const PERSONA_FIELDS: Record<string, (p: Persona) => string | number> = {
  'persona.fullName':      p => p.fullName,
  'persona.firstName':     p => p.firstName,
  'persona.lastName':      p => p.lastName,
  'persona.email':         p => p.email,
  'persona.username':      p => p.username,
  'persona.phone':         p => p.phone,
  'persona.birthdate':     p => p.birthdate.toISOString().slice(0, 10),
  'persona.age':           p => p.age,
  'persona.jobTitle':      p => p.jobTitle,
  'persona.company':       p => p.company,
  'persona.city':          p => p.city,
  'persona.state':         p => p.state,
  'persona.country':       p => p.country,
  'persona.countryCode':   p => p.countryCode,
  'persona.postalCode':    p => p.postalCode,
  'persona.streetAddress': p => p.streetAddress,
  'persona.avatarUrl':     p => p.avatarUrl,
  'persona.bio':           p => p.bio,
};

export function isPersonaFn(fn: string): boolean {
  return fn in PERSONA_FIELDS;
}
