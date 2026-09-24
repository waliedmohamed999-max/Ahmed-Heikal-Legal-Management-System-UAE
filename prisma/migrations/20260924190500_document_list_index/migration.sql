-- Composite index for the documents list ordered by last update (100k-row performance test).
-- CreateIndex
CREATE INDEX `Document_organizationId_deletedAt_updatedAt_idx` ON `Document`(`organizationId`, `deletedAt`, `updatedAt`);

