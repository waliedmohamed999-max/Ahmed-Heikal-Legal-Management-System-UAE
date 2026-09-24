-- Idempotent payment recording: a double-submitted payment form is recorded once.
-- AlterTable
ALTER TABLE `Payment` ADD COLUMN `idempotencyKey` VARCHAR(64) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Payment_idempotencyKey_key` ON `Payment`(`idempotencyKey`);

