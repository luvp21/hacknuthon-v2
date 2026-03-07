/**
 * Database Migration Runner
 * Reads SQL migration files in order and applies unapplied ones.
 * Tracks applied migrations in the `schema_migrations` table.
 */

import fs from 'fs';
import path from 'path';
import { getPostgresPool, withTransaction } from './postgres';
import { createServiceLogger } from '../utils/logger';

const log = createServiceLogger('Migrate');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(): Promise<void> {
    const pool = getPostgresPool();
    await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         SERIAL      PRIMARY KEY,
      filename   TEXT        NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
    const pool = getPostgresPool();
    const result = await pool.query<{ filename: string }>(
        'SELECT filename FROM schema_migrations ORDER BY id'
    );
    return new Set(result.rows.map((r) => r.filename));
}

async function applyMigration(
    filename: string,
    sql: string
): Promise<void> {
    await withTransaction(async (client) => {
        log.info(`Applying migration: ${filename}`);
        await client.query(sql);
        await client.query(
            'INSERT INTO schema_migrations (filename) VALUES ($1)',
            [filename]
        );
        log.info(`Migration applied: ${filename}`);
    });
}

async function run(): Promise<void> {
    log.info('Starting database migration runner');

    await ensureMigrationsTable();
    const applied = await getAppliedMigrations();

    const files = fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .sort();

    let appliedCount = 0;

    for (const filename of files) {
        if (applied.has(filename)) {
            log.debug(`Skipping already applied: ${filename}`);
            continue;
        }

        const filepath = path.join(MIGRATIONS_DIR, filename);
        const sql = fs.readFileSync(filepath, 'utf-8');

        await applyMigration(filename, sql);
        appliedCount++;
    }

    if (appliedCount === 0) {
        log.info('Database schema is up to date. No migrations applied.');
    } else {
        log.info(`Applied ${appliedCount} migration(s) successfully.`);
    }

    await getPostgresPool().end();
}

run().catch((err) => {
    log.error('Migration failed', { error: (err as Error).message });
    process.exit(1);
});
