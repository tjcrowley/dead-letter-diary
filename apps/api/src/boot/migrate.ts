import path from "path";
import { Client } from "pg";
import Postgrator from "postgrator";

export async function runMigrations(connectionString: string): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const postgrator = new Postgrator({
      migrationPattern: path.join(__dirname, "../../migrations/*"),
      driver: "pg",
      schemaTable: "schema_migrations",
      execQuery: (query) => client.query(query),
    });

    const applied = await postgrator.migrate();
    console.log(`Migrations applied: ${applied.length}`);
    if (applied.length > 0) {
      for (const migration of applied) {
        console.log(`  Applied: ${migration.filename}`);
      }
    }
  } catch (err) {
    console.error("Migration failed:", err);
    throw err;
  } finally {
    await client.end();
  }
}
