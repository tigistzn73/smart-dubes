require("dotenv").config();
const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function check() {
  try {
    await client.connect();

    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log("\n✅ Neon PostgreSQL tables:\n");
    console.table(result.rows);

  } catch (error) {
    console.error("\n❌ Database error:");
    console.error(error.message);
  } finally {
    await client.end();
  }
}

check();