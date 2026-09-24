-- Composite indexes for the task and document lists (found by the 100k-row performance test).
-- CreateIndex
CREATE INDEX `Task_organizationId_deletedAt_status_dueAt_idx` ON `Task`(`organizationId`, `deletedAt`, `status`, `dueAt`);

