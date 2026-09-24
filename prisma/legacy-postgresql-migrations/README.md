# ARCHIVE ONLY — DO NOT RUN

These are the PostgreSQL migrations from before the project moved to **MySQL** (Phase 11).
They are kept only as a historical record of how the schema evolved.

- Prisma never reads this folder (`prisma.config.ts` points at `prisma/migrations`).
- Never apply these files to any database. They use PostgreSQL-only SQL (UUID types, triggers
  in PL/pgSQL, `pg_trgm`, `tsvector`) and will fail or corrupt a MySQL database.
- `convert-mysql.py` is the one-off script that converted `schema.prisma` to MySQL. It is kept
  for traceability and must not be re-run (the MySQL schema has evolved since).

**Database of record: MySQL 8.4 (MariaDB 10.4+ compatible for local XAMPP development).**
The live migration history is `prisma/migrations/` (baseline `20260924180000_mysql_init` onwards).

Safe to delete once the team no longer needs the PostgreSQL history; nothing depends on it.
