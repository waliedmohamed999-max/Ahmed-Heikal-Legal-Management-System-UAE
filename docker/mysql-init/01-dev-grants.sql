-- DEVELOPMENT CONTAINER ONLY: the dev user may create/drop isolated databases named
-- ahlegal_* (integration tests `<db>_test`, restore tests `ahlegal_restore_*`,
-- large-data tests). Production uses a least-privilege user on one schema
-- (see docs/PRODUCTION-CHECKLIST.md).
GRANT ALL PRIVILEGES ON `ahlegal\_%`.* TO 'ahlegal'@'%';
FLUSH PRIVILEGES;
