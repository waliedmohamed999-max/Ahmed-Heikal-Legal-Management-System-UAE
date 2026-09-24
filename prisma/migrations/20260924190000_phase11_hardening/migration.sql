-- Phase 11 — production hardening (MySQL 8.4 / MariaDB 10.4+).
-- MFA replay + pending-secret enrolment + recovery codes, one-time auth tokens, per-role MFA policy,
-- durable reminder/delivery jobs with idempotency keys, malware-scan and integrity state, FULLTEXT search.

-- AlterTable
ALTER TABLE `User` ADD COLUMN `mfaEnrolledAt` DATETIME(3) NULL,
    ADD COLUMN `mfaLastStep` INTEGER NULL,
    ADD COLUMN `mfaPendingSecretEnc` VARCHAR(191) NULL,
    ADD COLUMN `offboardedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Session` ADD COLUMN `stepUpAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Role` ADD COLUMN `requireMfa` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `Reminder` ADD COLUMN `attempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `lastAttemptAt` DATETIME(3) NULL,
    ADD COLUMN `lockedUntil` DATETIME(3) NULL,
    MODIFY `status` ENUM('PENDING', 'PROCESSING', 'SENT', 'CANCELLED', 'FAILED') NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE `DocumentVersion` ADD COLUMN `integrityCheckedAt` DATETIME(3) NULL,
    ADD COLUMN `integrityStatus` LONGTEXT NULL,
    ADD COLUMN `scanDetail` LONGTEXT NULL,
    ADD COLUMN `scanStatus` ENUM('PENDING', 'SCANNING', 'CLEAN', 'INFECTED', 'ERROR', 'NOT_SCANNED') NOT NULL DEFAULT 'PENDING',
    ADD COLUMN `scannedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `NotificationDelivery` ADD COLUMN `attempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `deliveryKey` VARCHAR(191) NULL,
    ADD COLUMN `lastAttemptAt` DATETIME(3) NULL,
    ADD COLUMN `lockedUntil` DATETIME(3) NULL,
    ADD COLUMN `nextAttemptAt` DATETIME(3) NULL,
    ADD COLUMN `provider` LONGTEXT NULL;

-- CreateTable
CREATE TABLE `MfaRecoveryCode` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `codeHash` LONGTEXT NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MfaRecoveryCode_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuthToken` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `kind` ENUM('PASSWORD_RESET', 'INVITATION') NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `userId` CHAR(36) NULL,
    `roleId` CHAR(36) NULL,
    `name` LONGTEXT NULL,
    `matterIds` JSON NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AuthToken_tokenHash_key`(`tokenHash`),
    INDEX `AuthToken_organizationId_kind_usedAt_idx`(`organizationId`, `kind`, `usedAt`),
    INDEX `AuthToken_email_kind_idx`(`email`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SystemStatus` (
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE FULLTEXT INDEX `Document_searchText_idx` ON `Document`(`searchText`);

-- CreateIndex
CREATE FULLTEXT INDEX `Document_title_idx` ON `Document`(`title`);

-- CreateIndex
CREATE INDEX `DocumentVersion_scanStatus_idx` ON `DocumentVersion`(`scanStatus`);

-- CreateIndex
CREATE UNIQUE INDEX `NotificationDelivery_deliveryKey_key` ON `NotificationDelivery`(`deliveryKey`);

-- CreateIndex
CREATE INDEX `NotificationDelivery_status_nextAttemptAt_idx` ON `NotificationDelivery`(`status`, `nextAttemptAt`);

-- AddForeignKey
ALTER TABLE `MfaRecoveryCode` ADD CONSTRAINT `MfaRecoveryCode_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuthToken` ADD CONSTRAINT `AuthToken_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuthToken` ADD CONSTRAINT `AuthToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- ─── Data backfill ──────────────────────────────────────────────────────────
-- Versions uploaded before malware scanning existed are served as NOT_SCANNED
-- (the honest state) rather than blocked; new uploads start PENDING (quarantined).
UPDATE `DocumentVersion` SET `scanStatus` = 'NOT_SCANNED' WHERE `scanStatus` = 'PENDING';

-- Existing deliveries get a unique idempotency key.
UPDATE `NotificationDelivery` SET `deliveryKey` = CONCAT(`notificationId`, ':', `channel`, ':', `id`) WHERE `deliveryKey` IS NULL;
