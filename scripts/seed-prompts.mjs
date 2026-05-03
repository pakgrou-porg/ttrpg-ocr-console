/**
 * One-time script: seed all 13 default pipeline prompts into the live DB.
 * Run with: npx tsx scripts/seed-prompts.mjs
 */
import { seedDefaultPrompts } from '../server/db.ts';

console.log('Seeding default prompts...');
await seedDefaultPrompts();
console.log('Done — all default prompts seeded.');
process.exit(0);
