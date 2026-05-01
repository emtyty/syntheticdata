/**
 * Rich text generators — composable Faker calls that produce realistic
 * multi-sentence prose instead of single tokens. The aim is "AI-generated feel"
 * without an actual LLM: variety + coherence + meaningful content.
 */

import type { Faker } from '@faker-js/faker';

/** "Senior product designer based in Lisbon. Previously at Airbnb..." */
export function richBio(f: Faker): string {
  const role = f.person.jobTitle();
  const city = f.location.city();
  const company = f.company.name();
  const years = f.number.int({ min: 3, max: 20 });
  const hobby = f.helpers.arrayElement([
    'hiking', 'long-distance running', 'photography', 'sourdough baking',
    'open-source contributing', 'urban sketching', 'home brewing',
    'mechanical keyboards', 'amateur radio', 'mountain biking',
    'classical guitar', 'ceramics', 'film photography',
  ]);
  return [
    `${role} based in ${city}.`,
    `${years}+ years building software, currently at ${company}.`,
    `Outside of work: ${hobby} and the occasional weekend road trip.`,
  ].join(' ');
}

/** Two-paragraph product description with sentiment + spec */
export function richProductDescription(f: Faker): string {
  const adj1 = f.commerce.productAdjective();
  const adj2 = f.commerce.productAdjective();
  const material = f.commerce.productMaterial();
  const product = f.commerce.product();
  const useCase = f.helpers.arrayElement([
    'daily commute', 'weekend escapes', 'home office',
    'minimalist kitchens', 'creative professionals', 'outdoor enthusiasts',
    'serious cooks', 'travel-light packers',
  ]);
  const detail = f.helpers.arrayElement([
    'reinforced stitching', 'water-repellent finish', 'precision-machined edges',
    'hand-finished detailing', 'low-friction bearings', 'aircraft-grade aluminum',
    'food-safe coating', 'naturally antibacterial surface',
  ]);
  return (
    `Designed for ${useCase}, this ${adj1} ${product} pairs ${material.toLowerCase()} construction with ${adj2.toLowerCase()} aesthetics. ` +
    `Built around ${detail}, every detail is considered — from the first touch to a decade of use.`
  );
}

/** Star-rated review */
export function richReview(f: Faker): string {
  const stars = f.number.int({ min: 3, max: 5 });
  const filled = '★'.repeat(stars) + '☆'.repeat(5 - stars);
  const sentiment = stars >= 4 ? f.helpers.arrayElement([
    'Surprised by the build quality.',
    'Genuinely better than expected.',
    'Exactly what the description promised.',
    'Solid purchase, would buy again.',
    'Hits the sweet spot of price and quality.',
  ]) : f.helpers.arrayElement([
    'Decent for the price but not without flaws.',
    'Met basic expectations, nothing more.',
    'Works, though I had some quibbles.',
  ]);
  const detail = f.helpers.arrayElement([
    'Arrived two days early and packaged carefully.',
    'The instructions could be clearer.',
    'Heavier than I expected but in a reassuring way.',
    'Customer service was responsive when I had a question.',
    'Color is slightly different from the photos but I actually prefer it.',
  ]);
  return `${filled} ${sentiment} ${detail}`;
}

/** Support ticket (subject + body joined) */
export function richSupportTicket(f: Faker): string {
  const issueType = f.helpers.arrayElement([
    'Login fails', 'Cannot reset password', 'Charge appears twice',
    'Export stuck at 0%', 'Wrong amount on invoice', 'Account locked',
    '2FA codes not arriving', 'Missing items from order',
    'Subscription renewed unexpectedly',
  ]);
  const product = f.commerce.product();
  const action = f.helpers.arrayElement([
    'tried clearing cache', 'restarted my router', 'tried in a different browser',
    'reinstalled the app', 'waited 24 hours', 'contacted my bank',
  ]);
  return `${issueType} — order #${f.string.numeric(7)}. I purchased a ${product} yesterday and ${action}, but the issue persists. Could someone take a look?`;
}

/** "About us" company paragraph */
export function richCompanyAbout(f: Faker): string {
  const company = f.company.name();
  const founded = f.number.int({ min: 1985, max: 2022 });
  const buzzAdj = f.company.buzzAdjective();
  const buzzNoun = f.company.buzzNoun();
  const customers = f.helpers.arrayElement([
    'Fortune 500 companies', 'agile startups', 'creative agencies',
    'enterprise teams', 'independent makers', 'global brands',
  ]);
  return (
    `Founded in ${founded}, ${company} has grown into a trusted partner for ${customers}. ` +
    `Our mission is to deliver ${buzzAdj} ${buzzNoun} that scales with our customers' ambitions. ` +
    `Today, we serve teams across ${f.number.int({ min: 12, max: 90 })} countries.`
  );
}

/** 4-7 word marketing tagline */
export function richTagline(f: Faker): string {
  return f.company.catchPhrase();
}

/** Short social post (< 280 chars) with optional @mention/#hashtag */
export function richTweet(f: Faker): string {
  const opener = f.helpers.arrayElement([
    'Hot take:', 'Underrated:', 'Reminder:', 'PSA:',
    'Spent the morning thinking about', 'New blog post on',
    'Something I keep coming back to:',
  ]);
  const topic = f.hacker.phrase();
  const hashtag = '#' + f.helpers.arrayElement([
    'productivity', 'design', 'coding', 'startups', 'remote',
    'webdev', 'devops', 'ml', 'sre', 'ux',
  ]);
  const mention = f.helpers.maybe(() => '@' + f.internet.username().toLowerCase(), { probability: 0.3 }) ?? '';
  return `${opener} ${topic} ${mention} ${hashtag}`.trim().replace(/\s+/g, ' ').slice(0, 280);
}

/** Multi-line full address */
export function richAddressFull(f: Faker): string {
  const street = f.location.streetAddress();
  const apt = f.helpers.maybe(() => `Apt ${f.string.numeric(3)}`, { probability: 0.4 });
  const city = f.location.city();
  const state = f.location.state();
  const zip = f.location.zipCode();
  const country = f.location.country();
  return [street, apt, `${city}, ${state} ${zip}`, country].filter(Boolean).join('\n');
}
