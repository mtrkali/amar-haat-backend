import 'dotenv/config';
import postgres from '@prisma/orm-postgres/runtime';
import contractJson from './src/prisma/contract.json' with { type: 'json' };

const db = postgres({
  contractJson,
  url: process.env.DATABASE_URL,
});

try {
  await db.connect();

  console.log('DATABASE CONNECT SUCCESS');

  const result = await db.raw`SELECT 1 AS connection_test`;

  console.log('DATABASE QUERY SUCCESS:', result);
} catch (error) {
  console.error('DATABASE QUERY FAILED');
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.close();
}
