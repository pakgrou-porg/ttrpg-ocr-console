import mysql from 'mysql2/promise';
const dbUrl = process.env.DATABASE_URL;

const conn = await mysql.createConnection(dbUrl);
const [rows] = await conn.execute('SELECT id, name, display_name, provider_type, is_active FROM llm_providers LIMIT 20');
console.log('Current providers in DB:');
console.log(JSON.stringify(rows, null, 2));
await conn.end();
