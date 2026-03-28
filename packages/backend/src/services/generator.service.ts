/**
 * Core generation service.
 * Performs topological sort on columns (PK before FK),
 * generates N rows using Faker + seeded PRNG,
 * registers PK pools, and picks from FK pools.
 */

import {
  faker as fakerEN,
  Faker,
  fakerJA,
  fakerVI,
  fakerZH_CN,
  fakerKO,
  fakerTH,
  fakerID_ID,
  fakerFR,
  fakerDE,
  fakerES,
  fakerIT,
  fakerPT_BR,
  fakerRU,
  fakerAR,
  fakerTR,
  fakerNL,
  fakerSV,
  fakerPL,
  fakerDA,
  fakerFI,
  fakerNB_NO,
  fakerEN_GB,
  fakerEN_AU,
  fakerEN_CA,
  fakerUK,
  fakerHE,
  fakerCS_CZ,
  fakerHU,
} from '@faker-js/faker';
import seedrandom from 'seedrandom';
import { nanoid } from 'nanoid';
import type { ColumnSchema, GeneratedRow, GeneratorConfig } from '../types/index.js';
import { PoolRegistry } from './pool.service.js';

// ─── Locale registry ───────────────────────────────────────────────────────────

const LOCALE_MAP: Record<string, Faker> = {
  en_US:  fakerEN,
  en_GB:  fakerEN_GB,
  en_AU:  fakerEN_AU,
  en_CA:  fakerEN_CA,
  ja:     fakerJA,
  vi:     fakerVI,
  zh_CN:  fakerZH_CN,
  ko:     fakerKO,
  th:     fakerTH,
  id_ID:  fakerID_ID,
  fr:     fakerFR,
  de:     fakerDE,
  es:     fakerES,
  it:     fakerIT,
  pt_BR:  fakerPT_BR,
  ru:     fakerRU,
  ar:     fakerAR,
  tr:     fakerTR,
  nl:     fakerNL,
  sv:     fakerSV,
  pl:     fakerPL,
  da:     fakerDA,
  fi:     fakerFI,
  nb_NO:  fakerNB_NO,
  uk:     fakerUK,
  he:     fakerHE,
  cs_CZ:  fakerCS_CZ,
  hu:     fakerHU,
};

function getFaker(locale?: string): Faker {
  return LOCALE_MAP[locale ?? 'en_US'] ?? fakerEN;
}

// ─── Explicit fakerFn map ──────────────────────────────────────────────────────
// Each entry is (faker instance) => value, allowing locale-aware generation.

type FakerFactory = (f: Faker) => string | number;

const FAKER_FN_MAP: Record<string, FakerFactory> = {
  // ── Person ──
  'person.fullName':        f => f.person.fullName(),
  'person.firstName':       f => f.person.firstName(),
  'person.lastName':        f => f.person.lastName(),
  'person.middleName':      f => f.person.middleName(),
  'person.prefix':          f => f.person.prefix(),
  'person.suffix':          f => f.person.suffix(),
  'person.jobTitle':        f => f.person.jobTitle(),
  'person.jobArea':         f => f.person.jobArea(),
  'person.jobType':         f => f.person.jobType(),
  'person.bio':             f => f.person.bio(),
  'person.gender':          f => f.person.gender(),
  'person.zodiacSign':      f => f.person.zodiacSign(),
  // ── Internet ──
  'internet.username':      f => f.internet.username(),
  'internet.displayName':   f => f.internet.displayName(),
  'internet.email':         f => f.internet.email(),
  'internet.url':           f => f.internet.url(),
  'internet.domainName':    f => f.internet.domainName(),
  'internet.domainWord':    f => f.internet.domainWord(),
  'internet.ip':            f => f.internet.ip(),
  'internet.ipv6':          f => f.internet.ipv6(),
  'internet.mac':           f => f.internet.mac(),
  'internet.port':          f => f.internet.port(),
  'internet.userAgent':     f => f.internet.userAgent(),
  'internet.password':      f => f.internet.password(),
  'internet.emoji':         f => f.internet.emoji(),
  'internet.httpMethod':    f => f.internet.httpMethod(),
  // ── Location ──
  'location.streetAddress': f => f.location.streetAddress(),
  'location.buildingNumber':f => f.location.buildingNumber(),
  'location.street':        f => f.location.street(),
  'location.city':          f => f.location.city(),
  'location.state':         f => f.location.state(),
  'location.county':        f => f.location.county(),
  'location.country':       f => f.location.country(),
  'location.countryCode':   f => f.location.countryCode(),
  'location.zipCode':       f => f.location.zipCode(),
  'location.timeZone':      f => f.location.timeZone(),
  'location.latitude':      f => f.location.latitude(),
  'location.longitude':     f => f.location.longitude(),
  'location.direction':     f => f.location.direction(),
  // ── Company ──
  'company.name':           f => f.company.name(),
  'company.catchPhrase':    f => f.company.catchPhrase(),
  'company.buzzNoun':       f => f.company.buzzNoun(),
  'company.buzzVerb':       f => f.company.buzzVerb(),
  'company.buzzAdjective':  f => f.company.buzzAdjective(),
  // ── Commerce ──
  'commerce.productName':   f => f.commerce.productName(),
  'commerce.product':       f => f.commerce.product(),
  'commerce.productAdjective': f => f.commerce.productAdjective(),
  'commerce.productMaterial':  f => f.commerce.productMaterial(),
  'commerce.department':    f => f.commerce.department(),
  'commerce.price':         f => f.commerce.price(),
  'commerce.isbn':          f => f.commerce.isbn(),
  // ── Finance ──
  'finance.accountNumber':  f => f.finance.accountNumber(),
  'finance.accountName':    f => f.finance.accountName(),
  'finance.routingNumber':  f => f.finance.routingNumber(),
  'finance.creditCardNumber': f => f.finance.creditCardNumber(),
  'finance.creditCardCVV':  f => f.finance.creditCardCVV(),
  'finance.iban':           f => f.finance.iban(),
  'finance.bic':            f => f.finance.bic(),
  'finance.currency':       f => f.finance.currency().code,
  'finance.currencyName':   f => f.finance.currency().name,
  'finance.amount':         f => f.finance.amount(),
  'finance.transactionDescription': f => f.finance.transactionDescription(),
  'finance.bitcoinAddress': f => f.finance.bitcoinAddress(),
  'finance.ethereumAddress':f => f.finance.ethereumAddress(),
  'finance.pin':            f => f.finance.pin(),
  // ── Lorem ──
  'lorem.word':             f => f.lorem.word(),
  'lorem.words':            f => f.lorem.words(3),
  'lorem.slug':             f => f.lorem.slug(3),
  'lorem.sentence':         f => f.lorem.sentence(),
  'lorem.sentences':        f => f.lorem.sentences(2),
  'lorem.paragraph':        f => f.lorem.paragraph(),
  'lorem.text':             f => f.lorem.text(),
  // ── Phone ──
  'phone.number':           f => f.phone.number(),
  'phone.imei':             f => f.phone.imei(),
  // ── Color ──
  'color.human':            f => f.color.human(),
  'color.rgb':              f => f.color.rgb(),
  // ── Date ──
  'date.month':             f => f.date.month(),
  'date.weekday':           f => f.date.weekday(),
  // ── Music ──
  'music.genre':            f => f.music.genre(),
  'music.songName':         f => f.music.songName(),
  // ── Vehicle ──
  'vehicle.vehicle':        f => f.vehicle.vehicle(),
  'vehicle.manufacturer':   f => f.vehicle.manufacturer(),
  'vehicle.model':          f => f.vehicle.model(),
  'vehicle.type':           f => f.vehicle.type(),
  'vehicle.fuel':           f => f.vehicle.fuel(),
  'vehicle.vin':            f => f.vehicle.vin(),
  'vehicle.color':          f => f.vehicle.color(),
  'vehicle.bicycle':        f => f.vehicle.bicycle(),
  // ── Animal ──
  'animal.dog':             f => f.animal.dog(),
  'animal.cat':             f => f.animal.cat(),
  'animal.bird':            f => f.animal.bird(),
  'animal.fish':            f => f.animal.fish(),
  'animal.horse':           f => f.animal.horse(),
  'animal.bear':            f => f.animal.bear(),
  'animal.lion':            f => f.animal.lion(),
  'animal.snake':           f => f.animal.snake(),
  'animal.insect':          f => f.animal.insect(),
  'animal.type':            f => f.animal.type(),
  // ── Science ──
  'science.chemicalElement': f => f.science.chemicalElement().name,
  'science.unit':           f => f.science.unit().name,
  // ── Hacker ──
  'hacker.abbreviation':    f => f.hacker.abbreviation(),
  'hacker.adjective':       f => f.hacker.adjective(),
  'hacker.noun':            f => f.hacker.noun(),
  'hacker.verb':            f => f.hacker.verb(),
  'hacker.phrase':          f => f.hacker.phrase(),
  // ── System ──
  'system.fileName':        f => f.system.fileName(),
  'system.fileExt':         f => f.system.fileExt(),
  'system.mimeType':        f => f.system.mimeType(),
  'system.semver':          f => f.system.semver(),
  'system.directoryPath':   f => f.system.directoryPath(),
  // ── Word ──
  'word.adjective':         f => f.word.adjective(),
  'word.adverb':            f => f.word.adverb(),
  'word.noun':              f => f.word.noun(),
  'word.verb':              f => f.word.verb(),
  // ── Git ──
  'git.branch':             f => f.git.branch(),
  'git.commitMessage':      f => f.git.commitMessage(),
  'git.commitSha':          f => f.git.commitSha(),
  // ── Airline ──
  'airline.flightNumber':   f => f.airline.flightNumber(),
  'airline.airline':        f => f.airline.airline().name,
  'airline.airport':        f => f.airline.airport().name,
  'airline.seat':           f => f.airline.seat(),
  'airline.recordLocator':  f => f.airline.recordLocator(),
};

function callFakerFn(fn: string, locale?: string): string | number | null {
  const factory = FAKER_FN_MAP[fn];
  if (!factory) return null;
  return String(factory(getFaker(locale)));
}

// ─── Semantic column name → Faker mapping ─────────────────────────────────────

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const SEMANTIC_MAP: Array<{ patterns: string[]; factory: FakerFactory }> = [
  { patterns: ['fullname', 'name', 'displayname', 'realname'],        factory: f => f.person.fullName() },
  { patterns: ['firstname', 'givenname', 'fname'],                    factory: f => f.person.firstName() },
  { patterns: ['lastname', 'surname', 'familyname', 'lname'],         factory: f => f.person.lastName() },
  { patterns: ['username', 'login', 'handle', 'nickname'],            factory: f => f.internet.username() },
  { patterns: ['address', 'streetaddress', 'fulladdress', 'street'],  factory: f => f.location.streetAddress() },
  { patterns: ['city', 'town'],                                        factory: f => f.location.city() },
  { patterns: ['state', 'province', 'region'],                        factory: f => f.location.state() },
  { patterns: ['country'],                                             factory: f => f.location.country() },
  { patterns: ['countrycode'],                                         factory: f => f.location.countryCode() },
  { patterns: ['zip', 'zipcode', 'postalcode', 'postcode'],           factory: f => f.location.zipCode() },
  { patterns: ['company', 'companyname', 'organisation', 'organization', 'employer'], factory: f => f.company.name() },
  { patterns: ['jobtitle', 'position', 'occupation'],                 factory: f => f.person.jobTitle() },
  { patterns: ['department', 'division', 'team'],                     factory: f => f.commerce.department() },
  { patterns: ['product', 'productname', 'item', 'itemname'],         factory: f => f.commerce.productName() },
  { patterns: ['description', 'bio', 'about', 'summary', 'notes', 'comment', 'comments', 'remark', 'remarks'], factory: f => f.lorem.sentence() },
  { patterns: ['title'],                                               factory: f => f.lorem.words(3) },
  { patterns: ['color', 'colour'],                                     factory: f => f.color.human() },
  { patterns: ['currency'],                                            factory: f => f.finance.currency().code },
  { patterns: ['iban'],                                                factory: f => f.finance.iban() },
  { patterns: ['ip', 'ipaddress', 'ipv4'],                            factory: f => f.internet.ip() },
  { patterns: ['ipv6'],                                                factory: f => f.internet.ipv6() },
  { patterns: ['useragent'],                                           factory: f => f.internet.userAgent() },
  { patterns: ['slug'],                                                factory: f => f.lorem.slug(3) },
  { patterns: ['password', 'passwd'],                                  factory: f => f.internet.password() },
  { patterns: ['hashtag', 'tag', 'category'],                         factory: f => f.lorem.word() },
  { patterns: ['genre'],                                               factory: f => f.music.genre() },
  { patterns: ['filename', 'file'],                                    factory: f => f.system.fileName() },
];

const SEMANTIC_LOOKUP = new Map<string, FakerFactory>();
for (const entry of SEMANTIC_MAP) {
  for (const pattern of entry.patterns) {
    SEMANTIC_LOOKUP.set(pattern, entry.factory);
  }
}

function semanticValue(columnName: string, f: Faker): string | null {
  const factory = SEMANTIC_LOOKUP.get(normalizeName(columnName));
  return factory ? String(factory(f)) : null;
}

// ─── Shared weighted-pick utility ────────────────────────────────────────────

export function weightedPick<T>(items: T[], weights: number[], rng: () => number): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ─── Topological sort ─────────────────────────────────────────────────────────

function topoSort(columns: ColumnSchema[]): ColumnSchema[] {
  const byName = new Map(columns.map(c => [c.name, c]));
  const visited = new Set<string>();
  const result: ColumnSchema[] = [];

  function visit(col: ColumnSchema) {
    if (visited.has(col.name)) return;
    visited.add(col.name);
    if (col.indexType === 'foreign_key' && col.generatorConfig.poolRef) {
      const refColName = col.generatorConfig.poolRef.split('.')[1];
      const dep = byName.get(refColName);
      if (dep) visit(dep);
    }
    result.push(col);
  }

  for (const col of columns) if (col.indexType === 'primary_key') visit(col);
  for (const col of columns) visit(col);
  return result;
}

// ─── Per-column value generator ───────────────────────────────────────────────

function generateValue(
  col: ColumnSchema,
  cfg: GeneratorConfig,
  pool: PoolRegistry,
  rng: () => number,
): string | number | boolean | null {
  const nullRate = col.notNull ? 0 : (cfg.nullRate ?? 0);
  if (nullRate > 0 && rng() < nullRate) return null;

  if (col.indexType === 'foreign_key' && cfg.poolRef) {
    // fkNullRate: apply before pool sampling
    const fkNull = cfg.fkNullRate ?? 0;
    if (fkNull > 0 && rng() < fkNull) return null;

    let vals = pool.get(cfg.poolRef);

    // Restrict to explicit subset if provided
    if (cfg.fkFixedValues?.length) {
      const fixed = new Set(cfg.fkFixedValues);
      vals = vals.filter(v => fixed.has(String(v)));
      if (vals.length === 0) return null;
    }

    const dist = cfg.fkDistribution ?? 'uniform';

    if (dist === 'weighted' && cfg.fkValueWeights?.length) {
      return weightedPick(
        vals,
        vals.map(v => cfg.fkValueWeights!.find(w => w.value === String(v))?.weight ?? 1),
        rng,
      );
    }

    // uniform (default) — fixed_per_parent is handled at the chunk level
    return vals[Math.floor(rng() * vals.length)];
  }

  const f = getFaker(cfg.locale);

  switch (col.dataType) {
    case 'uuid':
      return crypto.randomUUID();

    case 'integer': {
      const min = cfg.min ?? 1;
      const max = cfg.max ?? 9999;
      return Math.floor(rng() * (max - min + 1)) + min;
    }

    case 'float': {
      const min = cfg.min ?? 0;
      const max = cfg.max ?? 9999;
      const precision = cfg.precision ?? 2;
      // fakerFn override for float (e.g. commerce.price)
      if (cfg.fakerFn) {
        const v = callFakerFn(cfg.fakerFn, cfg.locale);
        if (v !== null) return v;
      }
      return parseFloat((rng() * (max - min) + min).toFixed(precision));
    }

    case 'boolean':
      return rng() < 0.5;

    case 'date': {
      const from = new Date(cfg.dateFrom ?? '2020-01-01').getTime();
      const to   = new Date(cfg.dateTo   ?? '2025-12-31').getTime();
      return new Date(Math.floor(rng() * (to - from)) + from).toISOString().split('T')[0];
    }

    case 'datetime': {
      const from = new Date(cfg.dateFrom ?? '2020-01-01').getTime();
      const to   = new Date(cfg.dateTo   ?? '2025-12-31').getTime();
      return new Date(Math.floor(rng() * (to - from)) + from).toISOString();
    }

    case 'email':
      return f.internet.email();

    case 'phone':
      return f.phone.number();

    case 'url':
      return f.internet.url();

    case 'enum': {
      const vals = cfg.enumValues ?? ['a', 'b', 'c'];
      const weights = cfg.enumWeights;
      if (weights && weights.length === vals.length) {
        return weightedPick(vals, weights, rng);
      }
      return vals[Math.floor(rng() * vals.length)];
    }

    case 'regex': {
      if (cfg.pattern) {
        try { return f.helpers.fromRegExp(cfg.pattern); } catch { /* fallthrough */ }
      }
      return nanoid(10);
    }

    case 'string':
    default: {
      // 1. Explicit Faker fn (user picked from UI)
      if (cfg.fakerFn) {
        const explicit = callFakerFn(cfg.fakerFn, cfg.locale);
        if (explicit !== null) return explicit;
      }
      // 2. Semantic match by column name
      const semantic = semanticValue(col.name, f);
      if (semantic !== null) return semantic;

      // 3. Random fallback
      const minL = cfg.minLength ?? 5;
      const maxL = cfg.maxLength ?? 20;
      const len = Math.floor(rng() * (maxL - minL + 1)) + minL;
      const words = ['alpha', 'beta', 'gamma', 'delta', 'echo', 'foxtrot', 'hotel', 'india', 'juliet', 'kilo'];
      let s = '';
      while (s.length < len) s += words[Math.floor(rng() * words.length)] + '_';
      return s.slice(0, len);
    }
  }
}

// ─── Unique value enforcement ─────────────────────────────────────────────────

function generateUniqueColumn(
  col: ColumnSchema,
  rowCount: number,
  pool: PoolRegistry,
  rng: () => number,
): (string | number | boolean | null)[] {
  const seen = new Set<string>();
  const values: (string | number | boolean | null)[] = [];

  for (let i = 0; i < rowCount; i++) {
    let val: string | number | boolean | null;
    let attempts = 0;
    do {
      val = generateValue(col, col.generatorConfig, pool, rng);
      attempts++;
      if (attempts > 10000) throw new Error(`Cannot generate enough unique values for column "${col.name}".`);
    } while (val !== null && seen.has(String(val)));
    if (val !== null) seen.add(String(val));
    values.push(val);
  }
  return values;
}

// ─── Main generator ───────────────────────────────────────────────────────────

export function generateRows(
  columns: ColumnSchema[],
  rowCount: number,
  seed: number,
  existingPool?: PoolRegistry,
): { rows: GeneratedRow[]; pool: PoolRegistry } {
  const rng = seedrandom(String(seed));
  const pool = existingPool ?? new PoolRegistry();
  const sorted = topoSort(columns);

  const columnArrays = new Map<string, (string | number | boolean | null)[]>();

  for (const col of sorted) {
    let values: (string | number | boolean | null)[];

    if (col.indexType === 'primary_key' || col.indexType === 'unique') {
      values = generateUniqueColumn(col, rowCount, pool, rng);
    } else {
      values = Array.from({ length: rowCount }, () =>
        generateValue(col, col.generatorConfig, pool, rng),
      );
    }

    columnArrays.set(col.name, values);

    if (col.indexType === 'primary_key' && col.poolName) {
      const nonNull = values.filter((v): v is string | number => v !== null);
      pool.register(col.poolName, nonNull);
    }
  }

  const rows: GeneratedRow[] = Array.from({ length: rowCount }, (_, i) => {
    const row: GeneratedRow = {};
    for (const col of columns) {
      row[col.name] = columnArrays.get(col.name)?.[i] ?? null;
    }
    return row;
  });

  return { rows, pool };
}
