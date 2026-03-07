/**
 * reset_db.ts
 * Drops all existing tables on Neon and applies the new V4 schema.
 * Run: npx ts-node src/database/reset_db.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30_000,
    statement_timeout: 60_000,
});

async function run() {
    const client = await pool.connect();
    try {
        const sqlPath = path.resolve(__dirname, '../../src/database/reset_and_migrate.sql');
        const sql = fs.readFileSync(sqlPath, 'utf-8');

        console.log('🔌 Connected to Neon PostgreSQL');
        console.log('⚠️  Dropping all existing tables and re-applying V4 schema...\n');

        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');

        console.log('✅ Schema applied successfully!\n');

        // Verify
        const result = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);
        console.log('📋 Tables created:');
        result.rows.forEach(r => console.log('  •', r.table_name));
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
