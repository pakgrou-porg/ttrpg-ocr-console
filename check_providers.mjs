import postgres from 'postgres';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error('DATABASE_URL is required');
}

const sql = postgres(dbUrl);
const rows = await sql`
  SELECT id, name, display_name, provider_type, is_active
  FROM llm_providers
  ORDER BY id
  LIMIT 20
`;
console.log('Current providers in DB:');
console.log(JSON.stringify(rows, null, 2));
await sql.end();
