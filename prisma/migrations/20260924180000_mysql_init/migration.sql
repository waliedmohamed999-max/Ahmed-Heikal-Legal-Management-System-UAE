-- CreateTable
CREATE TABLE `Organization` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` LONGTEXT NOT NULL,
    `nameAr` LONGTEXT NULL,
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'Asia/Dubai',
    `currency` VARCHAR(191) NOT NULL DEFAULT 'AED',
    `defaultLocale` VARCHAR(191) NOT NULL DEFAULT 'ar',
    `vatRate` DECIMAL(5, 2) NOT NULL DEFAULT 5,
    `matterPrefix` VARCHAR(191) NOT NULL DEFAULT 'AH',
    `invoicePrefix` VARCHAR(191) NOT NULL DEFAULT 'INV',
    `trn` LONGTEXT NULL,
    `address` LONGTEXT NULL,
    `phone` LONGTEXT NULL,
    `email` LONGTEXT NULL,
    `settings` JSON NOT NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Organization_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `kind` ENUM('STAFF', 'CLIENT') NOT NULL DEFAULT 'STAFF',
    `email` VARCHAR(191) NOT NULL,
    `name` LONGTEXT NOT NULL,
    `nameAr` LONGTEXT NULL,
    `position` LONGTEXT NULL,
    `positionAr` LONGTEXT NULL,
    `phone` LONGTEXT NULL,
    `photoUrl` LONGTEXT NULL,
    `passwordHash` LONGTEXT NOT NULL,
    `status` ENUM('INVITED', 'ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `roleId` CHAR(36) NOT NULL,
    `locale` VARCHAR(191) NOT NULL DEFAULT 'ar',
    `mfaEnabled` BOOLEAN NOT NULL DEFAULT false,
    `mfaSecretEnc` LONGTEXT NULL,
    `failedLoginCount` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `passwordChangedAt` DATETIME(3) NULL,
    `clientId` CHAR(36) NULL,
    `preferences` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_organizationId_kind_status_idx`(`organizationId`, `kind`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `realm` ENUM('STAFF', 'CLIENT') NOT NULL,
    `mfaVerified` BOOLEAN NOT NULL DEFAULT false,
    `ip` LONGTEXT NULL,
    `userAgent` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Session_tokenHash_key`(`tokenHash`),
    INDEX `Session_userId_revokedAt_idx`(`userId`, `revokedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PushSubscription` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `endpoint` VARCHAR(191) NOT NULL,
    `p256dh` LONGTEXT NOT NULL,
    `auth` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PushSubscription_endpoint_key`(`endpoint`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Role` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` LONGTEXT NOT NULL,
    `nameAr` LONGTEXT NULL,
    `description` LONGTEXT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `matterScope` ENUM('ALL', 'ASSIGNED', 'NONE') NOT NULL DEFAULT 'ASSIGNED',
    `rank` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Role_organizationId_key_key`(`organizationId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Permission` (
    `key` VARCHAR(191) NOT NULL,
    `module` LONGTEXT NOT NULL,
    `action` LONGTEXT NOT NULL,
    `description` LONGTEXT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RolePermission` (
    `roleId` CHAR(36) NOT NULL,
    `permissionKey` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`roleId`, `permissionKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Team` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `name` LONGTEXT NOT NULL,
    `nameAr` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TeamMember` (
    `teamId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,

    PRIMARY KEY (`teamId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Jurisdiction` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` LONGTEXT NOT NULL,
    `nameAr` LONGTEXT NULL,
    `kind` ENUM('FEDERAL', 'LOCAL', 'FREE_ZONE', 'ARBITRATION', 'OTHER') NOT NULL,
    `emirate` LONGTEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Jurisdiction_organizationId_code_key`(`organizationId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Court` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `jurisdictionId` CHAR(36) NOT NULL,
    `name` LONGTEXT NOT NULL,
    `nameAr` LONGTEXT NULL,
    `level` LONGTEXT NULL,
    `emirate` LONGTEXT NULL,
    `address` LONGTEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Court_organizationId_jurisdictionId_idx`(`organizationId`, `jurisdictionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CaseCategory` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `name` LONGTEXT NOT NULL,
    `nameAr` LONGTEXT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CaseType` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `categoryId` CHAR(36) NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` LONGTEXT NOT NULL,
    `nameAr` LONGTEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CaseType_organizationId_code_key`(`organizationId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Workflow` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `name` LONGTEXT NOT NULL,
    `nameAr` LONGTEXT NULL,
    `jurisdictionId` CHAR(36) NULL,
    `caseTypeId` CHAR(36) NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkflowStage` (
    `id` CHAR(36) NOT NULL,
    `workflowId` CHAR(36) NOT NULL,
    `order` INTEGER NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` LONGTEXT NOT NULL,
    `nameAr` LONGTEXT NULL,
    `isTerminal` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `WorkflowStage_workflowId_key_key`(`workflowId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChecklistTemplate` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `caseTypeId` CHAR(36) NULL,
    `name` LONGTEXT NOT NULL,
    `nameAr` LONGTEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChecklistTemplateItem` (
    `id` CHAR(36) NOT NULL,
    `templateId` CHAR(36) NOT NULL,
    `order` INTEGER NOT NULL,
    `title` LONGTEXT NOT NULL,
    `titleAr` LONGTEXT NULL,
    `required` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Client` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `clientNumber` VARCHAR(191) NOT NULL,
    `type` ENUM('INDIVIDUAL', 'COMPANY') NOT NULL,
    `nameEn` VARCHAR(191) NOT NULL,
    `nameAr` LONGTEXT NULL,
    `email` LONGTEXT NULL,
    `phone` LONGTEXT NULL,
    `whatsapp` LONGTEXT NULL,
    `address` LONGTEXT NULL,
    `nationality` LONGTEXT NULL,
    `preferredLanguage` VARCHAR(191) NOT NULL DEFAULT 'ar',
    `tradeLicenseNo` LONGTEXT NULL,
    `companyName` LONGTEXT NULL,
    `emiratesIdEnc` LONGTEXT NULL,
    `passportEnc` LONGTEXT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'PROSPECT') NOT NULL DEFAULT 'ACTIVE',
    `source` LONGTEXT NULL,
    `notes` LONGTEXT NULL,
    `leadId` CHAR(36) NULL,
    `lastContactAt` DATETIME(3) NULL,
    `createdById` CHAR(36) NULL,
    `updatedById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Client_leadId_key`(`leadId`),
    INDEX `Client_organizationId_deletedAt_idx`(`organizationId`, `deletedAt`),
    INDEX `Client_nameEn_idx`(`nameEn`),
    UNIQUE INDEX `Client_organizationId_clientNumber_key`(`organizationId`, `clientNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Contact` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `type` ENUM('INDIVIDUAL', 'COMPANY') NOT NULL DEFAULT 'INDIVIDUAL',
    `category` ENUM('CLIENT', 'OPPONENT', 'LAWYER', 'EXPERT', 'TRANSLATOR', 'WITNESS', 'COMPANY', 'GOVERNMENT', 'OTHER') NOT NULL,
    `nameEn` VARCHAR(191) NOT NULL,
    `nameAr` LONGTEXT NULL,
    `companyName` LONGTEXT NULL,
    `jobTitle` LONGTEXT NULL,
    `email` LONGTEXT NULL,
    `phone` LONGTEXT NULL,
    `whatsapp` LONGTEXT NULL,
    `address` LONGTEXT NULL,
    `nationality` LONGTEXT NULL,
    `notes` LONGTEXT NULL,
    `clientId` CHAR(36) NULL,
    `createdById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Contact_organizationId_category_idx`(`organizationId`, `category`),
    INDEX `Contact_nameEn_idx`(`nameEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContactRelation` (
    `id` CHAR(36) NOT NULL,
    `fromId` CHAR(36) NOT NULL,
    `toId` CHAR(36) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ContactRelation_fromId_toId_label_key`(`fromId`, `toId`, `label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Matter` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `internalNumber` VARCHAR(191) NOT NULL,
    `officialCaseNumber` VARCHAR(191) NULL,
    `title` LONGTEXT NOT NULL,
    `titleAr` LONGTEXT NULL,
    `summary` LONGTEXT NULL,
    `kind` ENUM('COURT_CASE', 'CONSULTATION', 'CONTRACT', 'DISPUTE', 'EXECUTION', 'APPEAL', 'ARBITRATION', 'OTHER') NOT NULL DEFAULT 'COURT_CASE',
    `status` ENUM('INTAKE', 'ACTIVE', 'PENDING', 'ON_HOLD', 'CLOSED', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    `priority` ENUM('CRITICAL', 'HIGH', 'NORMAL', 'LOW') NOT NULL DEFAULT 'NORMAL',
    `confidentiality` ENUM('STANDARD', 'CONFIDENTIAL', 'HIGHLY_CONFIDENTIAL') NOT NULL DEFAULT 'STANDARD',
    `clientId` CHAR(36) NOT NULL,
    `caseTypeId` CHAR(36) NULL,
    `jurisdictionId` CHAR(36) NULL,
    `courtId` CHAR(36) NULL,
    `stageId` CHAR(36) NULL,
    `ownerId` CHAR(36) NOT NULL,
    `leadLawyerId` CHAR(36) NULL,
    `claimAmount` DECIMAL(16, 2) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'AED',
    `claims` LONGTEXT NULL,
    `internalNotes` LONGTEXT NULL,
    `currentStatusText` LONGTEXT NULL,
    `lastActionText` LONGTEXT NULL,
    `nextActionText` LONGTEXT NULL,
    `riskFlags` JSON NOT NULL,
    `billingType` ENUM('NONE', 'FIXED', 'HOURLY', 'RETAINER', 'INSTALLMENTS') NOT NULL DEFAULT 'NONE',
    `feeAmount` DECIMAL(14, 2) NULL,
    `hourlyRate` DECIMAL(10, 2) NULL,
    `feeNotes` LONGTEXT NULL,
    `conflictStatus` ENUM('NOT_RUN', 'CLEAR', 'POTENTIAL_MATCH_REVIEWED', 'WAIVED') NOT NULL DEFAULT 'NOT_RUN',
    `conflictNotes` LONGTEXT NULL,
    `conflictCheckedById` CHAR(36) NULL,
    `conflictCheckedAt` DATETIME(3) NULL,
    `portalEnabled` BOOLEAN NOT NULL DEFAULT false,
    `portalStatusText` LONGTEXT NULL,
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,
    `lastActivityAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdById` CHAR(36) NULL,
    `updatedById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Matter_organizationId_status_deletedAt_idx`(`organizationId`, `status`, `deletedAt`),
    INDEX `Matter_organizationId_clientId_idx`(`organizationId`, `clientId`),
    INDEX `Matter_officialCaseNumber_idx`(`officialCaseNumber`),
    INDEX `Matter_lastActivityAt_idx`(`lastActivityAt`),
    UNIQUE INDEX `Matter_organizationId_internalNumber_key`(`organizationId`, `internalNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MatterMember` (
    `id` CHAR(36) NOT NULL,
    `matterId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `role` ENUM('OWNER', 'LEAD', 'ASSIGNED', 'ASSISTANT', 'OBSERVER', 'DOCUMENTS_ONLY') NOT NULL,
    `overrides` JSON NOT NULL,
    `expiresAt` DATETIME(3) NULL,
    `grantedById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MatterMember_userId_idx`(`userId`),
    UNIQUE INDEX `MatterMember_matterId_userId_key`(`matterId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MatterParty` (
    `id` CHAR(36) NOT NULL,
    `matterId` CHAR(36) NOT NULL,
    `contactId` CHAR(36) NOT NULL,
    `role` ENUM('CLIENT', 'OPPONENT', 'OPPONENT_COUNSEL', 'CO_CLAIMANT', 'CO_DEFENDANT', 'WITNESS', 'EXPERT', 'THIRD_PARTY', 'RELATED') NOT NULL,
    `notes` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MatterParty_contactId_idx`(`contactId`),
    UNIQUE INDEX `MatterParty_matterId_contactId_role_key`(`matterId`, `contactId`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MatterChecklistItem` (
    `id` CHAR(36) NOT NULL,
    `matterId` CHAR(36) NOT NULL,
    `order` INTEGER NOT NULL,
    `title` LONGTEXT NOT NULL,
    `titleAr` LONGTEXT NULL,
    `required` BOOLEAN NOT NULL DEFAULT false,
    `doneAt` DATETIME(3) NULL,
    `doneById` CHAR(36) NULL,

    INDEX `MatterChecklistItem_matterId_idx`(`matterId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TimelineEvent` (
    `id` CHAR(36) NOT NULL,
    `matterId` CHAR(36) NOT NULL,
    `eventType` LONGTEXT NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `title` LONGTEXT NOT NULL,
    `description` LONGTEXT NULL,
    `notes` LONGTEXT NULL,
    `documentIds` JSON NOT NULL,
    `source` ENUM('MANUAL', 'SYSTEM', 'AI', 'IMPORT') NOT NULL DEFAULT 'MANUAL',
    `status` ENUM('CONFIRMED', 'PROPOSED', 'REJECTED') NOT NULL DEFAULT 'CONFIRMED',
    `citations` JSON NULL,
    `userId` CHAR(36) NULL,
    `decidedById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TimelineEvent_matterId_occurredAt_idx`(`matterId`, `occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Hearing` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `matterId` CHAR(36) NOT NULL,
    `courtId` CHAR(36) NULL,
    `courtRoom` LONGTEXT NULL,
    `isRemote` BOOLEAN NOT NULL DEFAULT false,
    `remoteUrl` LONGTEXT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NULL,
    `judge` LONGTEXT NULL,
    `sessionType` LONGTEXT NULL,
    `attendingLawyerId` CHAR(36) NULL,
    `clientAttendance` ENUM('REQUIRED', 'OPTIONAL', 'NOT_REQUIRED') NOT NULL DEFAULT 'NOT_REQUIRED',
    `status` ENUM('SCHEDULED', 'PREPARING', 'READY', 'HELD', 'ADJOURNED', 'CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
    `requiredDocuments` LONGTEXT NULL,
    `preparationNotes` LONGTEXT NULL,
    `questions` LONGTEXT NULL,
    `arguments` LONGTEXT NULL,
    `outcome` LONGTEXT NULL,
    `decisions` LONGTEXT NULL,
    `requiredActions` LONGTEXT NULL,
    `reportedAt` DATETIME(3) NULL,
    `reportedById` CHAR(36) NULL,
    `previousHearingId` CHAR(36) NULL,
    `acknowledgedAt` DATETIME(3) NULL,
    `createdById` CHAR(36) NULL,
    `updatedById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Hearing_previousHearingId_key`(`previousHearingId`),
    INDEX `Hearing_organizationId_startsAt_idx`(`organizationId`, `startsAt`),
    INDEX `Hearing_matterId_startsAt_idx`(`matterId`, `startsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Deadline` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `matterId` CHAR(36) NULL,
    `hearingId` CHAR(36) NULL,
    `type` ENUM('SUBMISSION', 'APPEAL', 'PAYMENT', 'DOCUMENT', 'EXPERT_MEETING', 'COURT_APPOINTMENT', 'RENEWAL', 'FOLLOW_UP', 'INTERNAL', 'OTHER') NOT NULL,
    `title` LONGTEXT NOT NULL,
    `description` LONGTEXT NULL,
    `dueAt` DATETIME(3) NOT NULL,
    `isCritical` BOOLEAN NOT NULL DEFAULT false,
    `assigneeId` CHAR(36) NULL,
    `status` ENUM('OPEN', 'DONE', 'MISSED', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
    `verification` ENUM('CONFIRMED', 'NEEDS_VERIFICATION') NOT NULL DEFAULT 'CONFIRMED',
    `source` ENUM('MANUAL', 'HEARING_REPORT', 'AI', 'IMPORT', 'AUTOMATION') NOT NULL DEFAULT 'MANUAL',
    `verifiedById` CHAR(36) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `acknowledgedAt` DATETIME(3) NULL,
    `createdById` CHAR(36) NULL,
    `updatedById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Deadline_organizationId_status_dueAt_idx`(`organizationId`, `status`, `dueAt`),
    INDEX `Deadline_matterId_idx`(`matterId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Appointment` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `type` ENUM('CONSULTATION', 'FOLLOW_UP', 'DOCUMENT_SIGNING', 'CASE_MEETING', 'ONLINE_MEETING', 'INTERNAL_MEETING', 'CALL') NOT NULL,
    `title` LONGTEXT NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `lawyerId` CHAR(36) NULL,
    `clientId` CHAR(36) NULL,
    `leadId` CHAR(36) NULL,
    `matterId` CHAR(36) NULL,
    `location` LONGTEXT NULL,
    `meetingUrl` LONGTEXT NULL,
    `notes` LONGTEXT NULL,
    `status` ENUM('REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW') NOT NULL DEFAULT 'CONFIRMED',
    `portalVisible` BOOLEAN NOT NULL DEFAULT false,
    `createdById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Appointment_organizationId_startsAt_idx`(`organizationId`, `startsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReminderPolicy` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `subjectType` VARCHAR(191) NOT NULL,
    `offsetsMinutes` JSON NOT NULL,
    `channels` JSON NOT NULL,
    `notifyOwner` BOOLEAN NOT NULL DEFAULT false,
    `escalateBeforeMinutes` INTEGER NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ReminderPolicy_organizationId_subjectType_key`(`organizationId`, `subjectType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Reminder` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `subjectType` VARCHAR(191) NOT NULL,
    `subjectId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `fireAt` DATETIME(3) NOT NULL,
    `offsetMinutes` INTEGER NOT NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'REMINDER',
    `channels` JSON NOT NULL,
    `status` ENUM('PENDING', 'SENT', 'CANCELLED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `sentAt` DATETIME(3) NULL,
    `error` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Reminder_status_fireAt_idx`(`status`, `fireAt`),
    INDEX `Reminder_subjectType_subjectId_idx`(`subjectType`, `subjectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Task` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `matterId` CHAR(36) NULL,
    `title` LONGTEXT NOT NULL,
    `description` LONGTEXT NULL,
    `assigneeId` CHAR(36) NULL,
    `createdById` CHAR(36) NULL,
    `priority` ENUM('CRITICAL', 'HIGH', 'NORMAL', 'LOW') NOT NULL DEFAULT 'NORMAL',
    `status` ENUM('TODO', 'IN_PROGRESS', 'WAITING', 'DONE', 'CANCELLED') NOT NULL DEFAULT 'TODO',
    `startAt` DATETIME(3) NULL,
    `dueAt` DATETIME(3) NULL,
    `estimateMinutes` INTEGER NULL,
    `completedAt` DATETIME(3) NULL,
    `sourceType` VARCHAR(191) NULL,
    `sourceId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Task_organizationId_assigneeId_status_idx`(`organizationId`, `assigneeId`, `status`),
    INDEX `Task_matterId_idx`(`matterId`),
    INDEX `Task_dueAt_idx`(`dueAt`),
    INDEX `Task_sourceType_sourceId_idx`(`sourceType`, `sourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskChecklistItem` (
    `id` CHAR(36) NOT NULL,
    `taskId` CHAR(36) NOT NULL,
    `order` INTEGER NOT NULL,
    `title` LONGTEXT NOT NULL,
    `doneAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskDependency` (
    `taskId` CHAR(36) NOT NULL,
    `dependsOnId` CHAR(36) NOT NULL,

    PRIMARY KEY (`taskId`, `dependsOnId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Document` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `matterId` CHAR(36) NULL,
    `clientId` CHAR(36) NULL,
    `category` ENUM('COURT', 'CLIENT', 'EVIDENCE', 'CONTRACT', 'LEGAL_MEMO', 'CORRESPONDENCE', 'JUDGMENT', 'INVOICE', 'POWER_OF_ATTORNEY', 'EXPERT_REPORT', 'SUBMISSION', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `title` LONGTEXT NOT NULL,
    `description` LONGTEXT NULL,
    `tags` JSON NOT NULL,
    `confidentiality` ENUM('STANDARD', 'CONFIDENTIAL', 'HIGHLY_CONFIDENTIAL') NOT NULL DEFAULT 'STANDARD',
    `status` ENUM('DRAFT', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'SUBMITTED') NOT NULL DEFAULT 'DRAFT',
    `currentVersion` INTEGER NOT NULL DEFAULT 1,
    `portalShared` BOOLEAN NOT NULL DEFAULT false,
    `searchText` LONGTEXT NULL,
    `createdById` CHAR(36) NULL,
    `updatedById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Document_organizationId_matterId_deletedAt_idx`(`organizationId`, `matterId`, `deletedAt`),
    INDEX `Document_organizationId_status_idx`(`organizationId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocumentVersion` (
    `id` CHAR(36) NOT NULL,
    `documentId` CHAR(36) NOT NULL,
    `version` INTEGER NOT NULL,
    `fileName` LONGTEXT NOT NULL,
    `storageKey` VARCHAR(191) NOT NULL,
    `mimeType` LONGTEXT NOT NULL,
    `sizeBytes` BIGINT NOT NULL,
    `checksumSha256` LONGTEXT NOT NULL,
    `status` ENUM('DRAFT', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'SUBMITTED') NOT NULL DEFAULT 'DRAFT',
    `comment` LONGTEXT NULL,
    `uploadedById` CHAR(36) NULL,
    `extractedText` LONGTEXT NULL,
    `pageTexts` JSON NULL,
    `textStatus` ENUM('NOT_REQUIRED', 'PENDING', 'PROCESSING', 'DONE', 'FAILED', 'UNAVAILABLE') NOT NULL DEFAULT 'PENDING',
    `pageCount` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DocumentVersion_storageKey_key`(`storageKey`),
    UNIQUE INDEX `DocumentVersion_documentId_version_key`(`documentId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocumentPermission` (
    `id` CHAR(36) NOT NULL,
    `documentId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NULL,
    `roleId` CHAR(36) NULL,
    `access` ENUM('VIEW', 'EDIT', 'DENY') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DocumentPermission_documentId_idx`(`documentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Comment` (
    `id` CHAR(36) NOT NULL,
    `authorId` CHAR(36) NOT NULL,
    `matterId` CHAR(36) NULL,
    `documentId` CHAR(36) NULL,
    `taskId` CHAR(36) NULL,
    `body` LONGTEXT NOT NULL,
    `mentions` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `editedAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Comment_matterId_idx`(`matterId`),
    INDEX `Comment_documentId_idx`(`documentId`),
    INDEX `Comment_taskId_idx`(`taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Note` (
    `id` CHAR(36) NOT NULL,
    `matterId` CHAR(36) NOT NULL,
    `authorId` CHAR(36) NOT NULL,
    `visibility` ENUM('PRIVATE', 'TEAM', 'CLIENT') NOT NULL DEFAULT 'TEAM',
    `body` LONGTEXT NOT NULL,
    `pinned` BOOLEAN NOT NULL DEFAULT false,
    `sharedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Note_matterId_visibility_idx`(`matterId`, `visibility`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Activity` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `matterId` CHAR(36) NULL,
    `actorId` CHAR(36) NULL,
    `type` LONGTEXT NOT NULL,
    `entityType` LONGTEXT NOT NULL,
    `entityId` CHAR(36) NULL,
    `data` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Activity_organizationId_createdAt_idx`(`organizationId`, `createdAt`),
    INDEX `Activity_matterId_createdAt_idx`(`matterId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `category` ENUM('CRITICAL', 'DEADLINE', 'HEARING', 'TASK', 'DOCUMENT', 'CLIENT', 'FINANCE', 'SYSTEM') NOT NULL,
    `title` LONGTEXT NOT NULL,
    `body` LONGTEXT NULL,
    `link` LONGTEXT NULL,
    `entityType` LONGTEXT NULL,
    `entityId` CHAR(36) NULL,
    `dedupeKey` VARCHAR(191) NULL,
    `readAt` DATETIME(3) NULL,
    `snoozedUntil` DATETIME(3) NULL,
    `requiresAck` BOOLEAN NOT NULL DEFAULT false,
    `acknowledgedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_readAt_createdAt_idx`(`userId`, `readAt`, `createdAt`),
    UNIQUE INDEX `Notification_userId_dedupeKey_key`(`userId`, `dedupeKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotificationDelivery` (
    `id` CHAR(36) NOT NULL,
    `notificationId` CHAR(36) NOT NULL,
    `channel` LONGTEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `error` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Communication` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `matterId` CHAR(36) NULL,
    `clientId` CHAR(36) NULL,
    `channel` LONGTEXT NOT NULL,
    `direction` VARCHAR(191) NOT NULL DEFAULT 'OUTBOUND',
    `subject` LONGTEXT NULL,
    `body` LONGTEXT NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `userId` CHAR(36) NULL,
    `externalRef` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Communication_matterId_occurredAt_idx`(`matterId`, `occurredAt`),
    INDEX `Communication_clientId_occurredAt_idx`(`clientId`, `occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Invoice` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `clientId` CHAR(36) NOT NULL,
    `matterId` CHAR(36) NULL,
    `issueDate` DATETIME(3) NOT NULL,
    `dueDate` DATETIME(3) NOT NULL,
    `status` ENUM('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID') NOT NULL DEFAULT 'DRAFT',
    `currency` VARCHAR(191) NOT NULL DEFAULT 'AED',
    `subtotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `discount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `vatRate` DECIMAL(5, 2) NOT NULL DEFAULT 5,
    `vatAmount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `amountPaid` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `notes` LONGTEXT NULL,
    `portalVisible` BOOLEAN NOT NULL DEFAULT false,
    `createdById` CHAR(36) NULL,
    `updatedById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Invoice_organizationId_status_dueDate_idx`(`organizationId`, `status`, `dueDate`),
    UNIQUE INDEX `Invoice_organizationId_number_key`(`organizationId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InvoiceItem` (
    `id` CHAR(36) NOT NULL,
    `invoiceId` CHAR(36) NOT NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'FEE',
    `description` LONGTEXT NOT NULL,
    `quantity` DECIMAL(10, 2) NOT NULL DEFAULT 1,
    `unitPrice` DECIMAL(14, 2) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `timeEntryId` CHAR(36) NULL,
    `expenseId` CHAR(36) NULL,
    `order` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `InvoiceItem_timeEntryId_key`(`timeEntryId`),
    UNIQUE INDEX `InvoiceItem_expenseId_key`(`expenseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `invoiceId` CHAR(36) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `method` LONGTEXT NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL,
    `reference` LONGTEXT NULL,
    `notes` LONGTEXT NULL,
    `isRefund` BOOLEAN NOT NULL DEFAULT false,
    `recordedById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Payment_organizationId_receivedAt_idx`(`organizationId`, `receivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Expense` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `matterId` CHAR(36) NULL,
    `category` LONGTEXT NOT NULL,
    `description` LONGTEXT NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `incurredAt` DATETIME(3) NOT NULL,
    `billable` BOOLEAN NOT NULL DEFAULT true,
    `receiptDocumentId` CHAR(36) NULL,
    `createdById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Expense_organizationId_incurredAt_idx`(`organizationId`, `incurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TimeEntry` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `matterId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `activity` LONGTEXT NOT NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `endedAt` DATETIME(3) NULL,
    `minutes` INTEGER NOT NULL DEFAULT 0,
    `billable` BOOLEAN NOT NULL DEFAULT true,
    `rate` DECIMAL(10, 2) NULL,
    `notes` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `TimeEntry_organizationId_userId_startedAt_idx`(`organizationId`, `userId`, `startedAt`),
    INDEX `TimeEntry_matterId_idx`(`matterId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PipelineStage` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `name` LONGTEXT NOT NULL,
    `nameAr` LONGTEXT NULL,
    `order` INTEGER NOT NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'OPEN',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Lead` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `name` LONGTEXT NOT NULL,
    `email` LONGTEXT NULL,
    `phone` LONGTEXT NULL,
    `source` LONGTEXT NULL,
    `inquiry` LONGTEXT NULL,
    `service` LONGTEXT NULL,
    `estimatedValue` DECIMAL(14, 2) NULL,
    `assignedToId` CHAR(36) NULL,
    `stageId` CHAR(36) NOT NULL,
    `nextFollowUpAt` DATETIME(3) NULL,
    `lostReason` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Lead_organizationId_stageId_idx`(`organizationId`, `stageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Template` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `kind` LONGTEXT NOT NULL,
    `name` LONGTEXT NOT NULL,
    `locale` VARCHAR(191) NOT NULL DEFAULT 'en',
    `body` LONGTEXT NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KnowledgeDocument` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `kind` LONGTEXT NOT NULL,
    `title` LONGTEXT NOT NULL,
    `body` LONGTEXT NOT NULL,
    `tags` JSON NOT NULL,
    `locale` VARCHAR(191) NOT NULL DEFAULT 'en',
    `confidentiality` ENUM('STANDARD', 'CONFIDENTIAL', 'HIGHLY_CONFIDENTIAL') NOT NULL DEFAULT 'STANDARD',
    `authorId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LegalResource` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `title` LONGTEXT NOT NULL,
    `titleAr` LONGTEXT NULL,
    `url` LONGTEXT NOT NULL,
    `category` LONGTEXT NOT NULL,
    `description` LONGTEXT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Integration` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `category` LONGTEXT NOT NULL,
    `config` JSON NOT NULL,
    `status` ENUM('CONNECTED', 'NOT_CONNECTED', 'REQUIRES_CONFIGURATION', 'UNSUPPORTED', 'ERROR') NOT NULL DEFAULT 'NOT_CONNECTED',
    `statusDetail` LONGTEXT NULL,
    `lastCheckedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Integration_organizationId_provider_key`(`organizationId`, `provider`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CourtImport` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `matterId` CHAR(36) NULL,
    `documentId` CHAR(36) NULL,
    `sourceType` LONGTEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING_REVIEW',
    `suggestions` JSON NOT NULL,
    `createdById` CHAR(36) NULL,
    `reviewedById` CHAR(36) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` CHAR(36) NOT NULL,
    `seq` BIGINT NOT NULL AUTO_INCREMENT,
    `organizationId` CHAR(36) NOT NULL,
    `actorId` CHAR(36) NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NULL,
    `entityId` VARCHAR(191) NULL,
    `matterId` CHAR(36) NULL,
    `ip` LONGTEXT NULL,
    `userAgent` LONGTEXT NULL,
    `sessionId` CHAR(36) NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `metadata` JSON NULL,
    `prevHash` LONGTEXT NULL,
    `hash` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_organizationId_createdAt_idx`(`organizationId`, `createdAt`),
    INDEX `AuditLog_actorId_createdAt_idx`(`actorId`, `createdAt`),
    INDEX `AuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `AuditLog_action_idx`(`action`),
    UNIQUE INDEX `AuditLog_seq_key`(`seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AccessRequest` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `matterId` CHAR(36) NOT NULL,
    `requesterId` CHAR(36) NOT NULL,
    `reason` LONGTEXT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `grantedRole` ENUM('OWNER', 'LEAD', 'ASSIGNED', 'ASSISTANT', 'OBSERVER', 'DOCUMENTS_ONLY') NULL,
    `expiresAt` DATETIME(3) NULL,
    `decidedById` CHAR(36) NULL,
    `decidedAt` DATETIME(3) NULL,
    `decisionNote` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AccessRequest_organizationId_status_idx`(`organizationId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Approval` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `kind` LONGTEXT NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` CHAR(36) NOT NULL,
    `matterId` CHAR(36) NULL,
    `title` LONGTEXT NOT NULL,
    `payload` JSON NULL,
    `requestedById` CHAR(36) NULL,
    `assignedToId` CHAR(36) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `comment` LONGTEXT NULL,
    `decidedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Approval_organizationId_status_idx`(`organizationId`, `status`),
    INDEX `Approval_entityType_entityId_idx`(`entityType`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIJob` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `matterId` CHAR(36) NULL,
    `kind` LONGTEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'QUEUED',
    `documentIds` JSON NOT NULL,
    `input` JSON NULL,
    `output` LONGTEXT NULL,
    `structured` JSON NULL,
    `citations` JSON NULL,
    `provider` LONGTEXT NULL,
    `model` LONGTEXT NULL,
    `inputTokens` INTEGER NULL,
    `outputTokens` INTEGER NULL,
    `error` LONGTEXT NULL,
    `reviewStatus` VARCHAR(191) NOT NULL DEFAULT 'REVIEW_REQUIRED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    INDEX `AIJob_organizationId_userId_createdAt_idx`(`organizationId`, `userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Automation` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` LONGTEXT NOT NULL,
    `nameAr` LONGTEXT NULL,
    `trigger` LONGTEXT NOT NULL,
    `conditions` JSON NOT NULL,
    `actions` JSON NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Automation_organizationId_key_key`(`organizationId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AutomationRun` (
    `id` CHAR(36) NOT NULL,
    `automationId` CHAR(36) NOT NULL,
    `entityId` LONGTEXT NULL,
    `status` LONGTEXT NOT NULL,
    `detail` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AutomationRun_automationId_createdAt_idx`(`automationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Counter` (
    `organizationId` CHAR(36) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`organizationId`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SavedView` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `module` LONGTEXT NOT NULL,
    `name` LONGTEXT NOT NULL,
    `filters` JSON NOT NULL,
    `columns` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BackupRecord` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `kind` LONGTEXT NOT NULL,
    `status` LONGTEXT NOT NULL,
    `location` LONGTEXT NULL,
    `sizeBytes` BIGINT NULL,
    `checksum` LONGTEXT NULL,
    `error` LONGTEXT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PrivacyRequest` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `kind` LONGTEXT NOT NULL,
    `subjectType` LONGTEXT NOT NULL,
    `subjectId` CHAR(36) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `notes` LONGTEXT NULL,
    `requestedById` CHAR(36) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BreachLog` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `detectedAt` DATETIME(3) NOT NULL,
    `description` LONGTEXT NOT NULL,
    `severity` LONGTEXT NOT NULL,
    `affectedData` LONGTEXT NULL,
    `actionsTaken` LONGTEXT NULL,
    `reportedToAuthorityAt` DATETIME(3) NULL,
    `recordedById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PracticeArea` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `titleEn` LONGTEXT NOT NULL,
    `titleAr` LONGTEXT NOT NULL,
    `summaryEn` LONGTEXT NULL,
    `summaryAr` LONGTEXT NULL,
    `bodyEn` LONGTEXT NULL,
    `bodyAr` LONGTEXT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `published` BOOLEAN NOT NULL DEFAULT false,
    `bookable` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PracticeArea_organizationId_slug_key`(`organizationId`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Article` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `locale` VARCHAR(191) NOT NULL,
    `title` LONGTEXT NOT NULL,
    `excerpt` LONGTEXT NULL,
    `body` LONGTEXT NOT NULL,
    `category` LONGTEXT NULL,
    `authorId` CHAR(36) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `publishedAt` DATETIME(3) NULL,
    `seoTitle` LONGTEXT NULL,
    `seoDescription` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Article_organizationId_locale_slug_key`(`organizationId`, `locale`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Faq` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `questionEn` LONGTEXT NOT NULL,
    `questionAr` LONGTEXT NOT NULL,
    `answerEn` LONGTEXT NOT NULL,
    `answerAr` LONGTEXT NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `published` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Testimonial` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `authorName` LONGTEXT NOT NULL,
    `quoteEn` LONGTEXT NULL,
    `quoteAr` LONGTEXT NULL,
    `published` BOOLEAN NOT NULL DEFAULT false,
    `order` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SiteSetting` (
    `organizationId` CHAR(36) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`organizationId`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BookingRequest` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `practiceAreaId` CHAR(36) NULL,
    `serviceLabel` LONGTEXT NULL,
    `preferredAt` DATETIME(3) NOT NULL,
    `mode` LONGTEXT NOT NULL,
    `name` LONGTEXT NOT NULL,
    `phone` LONGTEXT NOT NULL,
    `email` LONGTEXT NOT NULL,
    `description` LONGTEXT NULL,
    `locale` VARCHAR(191) NOT NULL DEFAULT 'ar',
    `status` VARCHAR(191) NOT NULL DEFAULT 'NEW',
    `leadId` CHAR(36) NULL,
    `consentAt` DATETIME(3) NOT NULL,
    `ip` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `BookingRequest_leadId_key`(`leadId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PushSubscription` ADD CONSTRAINT `PushSubscription_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Role` ADD CONSTRAINT `Role_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_permissionKey_fkey` FOREIGN KEY (`permissionKey`) REFERENCES `Permission`(`key`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Team` ADD CONSTRAINT `Team_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeamMember` ADD CONSTRAINT `TeamMember_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeamMember` ADD CONSTRAINT `TeamMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Jurisdiction` ADD CONSTRAINT `Jurisdiction_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Court` ADD CONSTRAINT `Court_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Court` ADD CONSTRAINT `Court_jurisdictionId_fkey` FOREIGN KEY (`jurisdictionId`) REFERENCES `Jurisdiction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CaseCategory` ADD CONSTRAINT `CaseCategory_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CaseType` ADD CONSTRAINT `CaseType_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CaseType` ADD CONSTRAINT `CaseType_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `CaseCategory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Workflow` ADD CONSTRAINT `Workflow_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Workflow` ADD CONSTRAINT `Workflow_jurisdictionId_fkey` FOREIGN KEY (`jurisdictionId`) REFERENCES `Jurisdiction`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Workflow` ADD CONSTRAINT `Workflow_caseTypeId_fkey` FOREIGN KEY (`caseTypeId`) REFERENCES `CaseType`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkflowStage` ADD CONSTRAINT `WorkflowStage_workflowId_fkey` FOREIGN KEY (`workflowId`) REFERENCES `Workflow`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChecklistTemplate` ADD CONSTRAINT `ChecklistTemplate_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChecklistTemplate` ADD CONSTRAINT `ChecklistTemplate_caseTypeId_fkey` FOREIGN KEY (`caseTypeId`) REFERENCES `CaseType`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChecklistTemplateItem` ADD CONSTRAINT `ChecklistTemplateItem_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `ChecklistTemplate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Client` ADD CONSTRAINT `Client_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Client` ADD CONSTRAINT `Client_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Contact` ADD CONSTRAINT `Contact_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Contact` ADD CONSTRAINT `Contact_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContactRelation` ADD CONSTRAINT `ContactRelation_fromId_fkey` FOREIGN KEY (`fromId`) REFERENCES `Contact`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContactRelation` ADD CONSTRAINT `ContactRelation_toId_fkey` FOREIGN KEY (`toId`) REFERENCES `Contact`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Matter` ADD CONSTRAINT `Matter_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Matter` ADD CONSTRAINT `Matter_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Matter` ADD CONSTRAINT `Matter_caseTypeId_fkey` FOREIGN KEY (`caseTypeId`) REFERENCES `CaseType`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Matter` ADD CONSTRAINT `Matter_jurisdictionId_fkey` FOREIGN KEY (`jurisdictionId`) REFERENCES `Jurisdiction`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Matter` ADD CONSTRAINT `Matter_courtId_fkey` FOREIGN KEY (`courtId`) REFERENCES `Court`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Matter` ADD CONSTRAINT `Matter_stageId_fkey` FOREIGN KEY (`stageId`) REFERENCES `WorkflowStage`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Matter` ADD CONSTRAINT `Matter_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Matter` ADD CONSTRAINT `Matter_leadLawyerId_fkey` FOREIGN KEY (`leadLawyerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MatterMember` ADD CONSTRAINT `MatterMember_matterId_fkey` FOREIGN KEY (`matterId`) REFERENCES `Matter`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MatterMember` ADD CONSTRAINT `MatterMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MatterMember` ADD CONSTRAINT `MatterMember_grantedById_fkey` FOREIGN KEY (`grantedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MatterParty` ADD CONSTRAINT `MatterParty_matterId_fkey` FOREIGN KEY (`matterId`) REFERENCES `Matter`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MatterParty` ADD CONSTRAINT `MatterParty_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `Contact`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MatterChecklistItem` ADD CONSTRAINT `MatterChecklistItem_matterId_fkey` FOREIGN KEY (`matterId`) REFERENCES `Matter`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimelineEvent` ADD CONSTRAINT `TimelineEvent_matterId_fkey` FOREIGN KEY (`matterId`) REFERENCES `Matter`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Hearing` ADD CONSTRAINT `Hearing_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Hearing` ADD CONSTRAINT `Hearing_matterId_fkey` FOREIGN KEY (`matterId`) REFERENCES `Matter`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Hearing` ADD CONSTRAINT `Hearing_courtId_fkey` FOREIGN KEY (`courtId`) REFERENCES `Court`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Hearing` ADD CONSTRAINT `Hearing_attendingLawyerId_fkey` FOREIGN KEY (`attendingLawyerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Hearing` ADD CONSTRAINT `Hearing_previousHearingId_fkey` FOREIGN KEY (`previousHearingId`) REFERENCES `Hearing`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deadline` ADD CONSTRAINT `Deadline_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deadline` ADD CONSTRAINT `Deadline_matterId_fkey` FOREIGN KEY (`matterId`) REFERENCES `Matter`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deadline` ADD CONSTRAINT `Deadline_hearingId_fkey` FOREIGN KEY (`hearingId`) REFERENCES `Hearing`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deadline` ADD CONSTRAINT `Deadline_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deadline` ADD CONSTRAINT `Deadline_verifiedById_fkey` FOREIGN KEY (`verifiedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Appointment` ADD CONSTRAINT `Appointment_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Appointment` ADD CONSTRAINT `Appointment_lawyerId_fkey` FOREIGN KEY (`lawyerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Appointment` ADD CONSTRAINT `Appointment_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Appointment` ADD CONSTRAINT `Appointment_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Appointment` ADD CONSTRAINT `Appointment_matterId_fkey` FOREIGN KEY (`matterId`) REFERENCES `Matter`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReminderPolicy` ADD CONSTRAINT `ReminderPolicy_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reminder` ADD CONSTRAINT `Reminder_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reminder` ADD CONSTRAINT `Reminder_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_matterId_fkey` FOREIGN KEY (`matterId`) REFERENCES `Matter`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskChecklistItem` ADD CONSTRAINT `TaskChecklistItem_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskDependency` ADD CONSTRAINT `TaskDependency_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskDependency` ADD CONSTRAINT `TaskDependency_dependsOnId_fkey` FOREIGN KEY (`dependsOnId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Document` ADD CONSTRAINT `Document_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Document` ADD CONSTRAINT `Document_matterId_fkey` FOREIGN KEY (`matterId`) REFERENCES `Matter`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Document` ADD CONSTRAINT `Document_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentVersion` ADD CONSTRAINT `DocumentVersion_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `Document`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentVersion` ADD CONSTRAINT `DocumentVersion_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentPermission` ADD CONSTRAINT `DocumentPermission_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `Document`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentPermission` ADD CONSTRAINT `DocumentPermission_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentPermission` ADD CONSTRAINT `DocumentPermission_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_matterId_fkey` FOREIGN KEY (`matterId`) REFERENCES `Matter`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `Document`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Note` ADD CONSTRAINT `Note_matterId_fkey` FOREIGN KEY (`matterId`) REFERENCES `Matter`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Note` ADD CONSTRAINT `Note_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Activity` ADD CONSTRAINT `Activity_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Activity` ADD CONSTRAINT `Activity_matterId_fkey` FOREIGN KEY (`matterId`) REFERENCES `Matter`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Activity` ADD CONSTRAINT `Activity_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotificationDelivery` ADD CONSTRAINT `NotificationDelivery_notificationId_fkey` FOREIGN KEY (`notificationId`) REFERENCES `Notification`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Communication` ADD CONSTRAINT `Communication_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Communication` ADD CONSTRAINT `Communication_matterId_fkey` FOREIGN KEY (`matterId`) REFERENCES `Matter`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Communication` ADD CONSTRAINT `Communication_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_matterId_fkey` FOREIGN KEY (`matterId`) REFERENCES `Matter`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvoiceItem` ADD CONSTRAINT `InvoiceItem_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvoiceItem` ADD CONSTRAINT `InvoiceItem_timeEntryId_fkey` FOREIGN KEY (`timeEntryId`) REFERENCES `TimeEntry`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvoiceItem` ADD CONSTRAINT `InvoiceItem_expenseId_fkey` FOREIGN KEY (`expenseId`) REFERENCES `Expense`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_matterId_fkey` FOREIGN KEY (`matterId`) REFERENCES `Matter`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_receiptDocumentId_fkey` FOREIGN KEY (`receiptDocumentId`) REFERENCES `Document`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimeEntry` ADD CONSTRAINT `TimeEntry_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimeEntry` ADD CONSTRAINT `TimeEntry_matterId_fkey` FOREIGN KEY (`matterId`) REFERENCES `Matter`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimeEntry` ADD CONSTRAINT `TimeEntry_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PipelineStage` ADD CONSTRAINT `PipelineStage_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_stageId_fkey` FOREIGN KEY (`stageId`) REFERENCES `PipelineStage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Template` ADD CONSTRAINT `Template_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KnowledgeDocument` ADD CONSTRAINT `KnowledgeDocument_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LegalResource` ADD CONSTRAINT `LegalResource_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Integration` ADD CONSTRAINT `Integration_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CourtImport` ADD CONSTRAINT `CourtImport_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_matterId_fkey` FOREIGN KEY (`matterId`) REFERENCES `Matter`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccessRequest` ADD CONSTRAINT `AccessRequest_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccessRequest` ADD CONSTRAINT `AccessRequest_matterId_fkey` FOREIGN KEY (`matterId`) REFERENCES `Matter`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccessRequest` ADD CONSTRAINT `AccessRequest_requesterId_fkey` FOREIGN KEY (`requesterId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccessRequest` ADD CONSTRAINT `AccessRequest_decidedById_fkey` FOREIGN KEY (`decidedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Approval` ADD CONSTRAINT `Approval_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Approval` ADD CONSTRAINT `Approval_matterId_fkey` FOREIGN KEY (`matterId`) REFERENCES `Matter`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Approval` ADD CONSTRAINT `Approval_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Approval` ADD CONSTRAINT `Approval_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIJob` ADD CONSTRAINT `AIJob_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIJob` ADD CONSTRAINT `AIJob_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIJob` ADD CONSTRAINT `AIJob_matterId_fkey` FOREIGN KEY (`matterId`) REFERENCES `Matter`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Automation` ADD CONSTRAINT `Automation_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AutomationRun` ADD CONSTRAINT `AutomationRun_automationId_fkey` FOREIGN KEY (`automationId`) REFERENCES `Automation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Counter` ADD CONSTRAINT `Counter_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SavedView` ADD CONSTRAINT `SavedView_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SavedView` ADD CONSTRAINT `SavedView_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BackupRecord` ADD CONSTRAINT `BackupRecord_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PrivacyRequest` ADD CONSTRAINT `PrivacyRequest_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BreachLog` ADD CONSTRAINT `BreachLog_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PracticeArea` ADD CONSTRAINT `PracticeArea_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Article` ADD CONSTRAINT `Article_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Article` ADD CONSTRAINT `Article_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Faq` ADD CONSTRAINT `Faq_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Testimonial` ADD CONSTRAINT `Testimonial_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteSetting` ADD CONSTRAINT `SiteSetting_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookingRequest` ADD CONSTRAINT `BookingRequest_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookingRequest` ADD CONSTRAINT `BookingRequest_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- Audit history is append-only. Runtime users must not have DROP/ALTER privileges:
-- MySQL TRUNCATE is DDL and does not invoke DELETE triggers.
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON `AuditLog`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditLog is append-only';
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON `AuditLog`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditLog is append-only';
CREATE TRIGGER `Client_no_hard_delete` BEFORE DELETE ON `Client`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked; use soft delete or archive';
CREATE TRIGGER `Matter_no_hard_delete` BEFORE DELETE ON `Matter`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked; use soft delete or archive';
CREATE TRIGGER `Document_no_hard_delete` BEFORE DELETE ON `Document`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked; use soft delete or archive';
CREATE TRIGGER `DocumentVersion_no_hard_delete` BEFORE DELETE ON `DocumentVersion`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked; use soft delete or archive';
CREATE TRIGGER `Hearing_no_hard_delete` BEFORE DELETE ON `Hearing`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked; use soft delete or archive';
CREATE TRIGGER `Deadline_no_hard_delete` BEFORE DELETE ON `Deadline`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked; use soft delete or archive';
CREATE TRIGGER `Invoice_no_hard_delete` BEFORE DELETE ON `Invoice`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked; use soft delete or archive';
CREATE TRIGGER `Payment_no_hard_delete` BEFORE DELETE ON `Payment`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked; use soft delete or archive';
CREATE TRIGGER `TimelineEvent_no_hard_delete` BEFORE DELETE ON `TimelineEvent`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked; use soft delete or archive';
CREATE TRIGGER `Note_no_hard_delete` BEFORE DELETE ON `Note`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked; use soft delete or archive';
CREATE TRIGGER `Communication_no_hard_delete` BEFORE DELETE ON `Communication`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked; use soft delete or archive';
CREATE TRIGGER `Approval_no_hard_delete` BEFORE DELETE ON `Approval`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hard delete blocked; use soft delete or archive';
CREATE TRIGGER `Payment_validate_insert` BEFORE INSERT ON `Payment` FOR EACH ROW
BEGIN
  IF NEW.`amount` = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment amount must be nonzero';
  END IF;
END;
CREATE TRIGGER `Payment_validate_update` BEFORE UPDATE ON `Payment` FOR EACH ROW
BEGIN
  IF NEW.`amount` = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment amount must be nonzero';
  END IF;
END;
CREATE TRIGGER `InvoiceItem_validate_insert` BEFORE INSERT ON `InvoiceItem` FOR EACH ROW
BEGIN
  IF NEW.`quantity` <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invoice quantity must be positive';
  END IF;
END;
CREATE TRIGGER `InvoiceItem_validate_update` BEFORE UPDATE ON `InvoiceItem` FOR EACH ROW
BEGIN
  IF NEW.`quantity` <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invoice quantity must be positive';
  END IF;
END;
CREATE TRIGGER `TimeEntry_validate_insert` BEFORE INSERT ON `TimeEntry` FOR EACH ROW
BEGIN
  IF NEW.`minutes` < 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Time minutes must be nonnegative';
  END IF;
END;
CREATE TRIGGER `TimeEntry_validate_update` BEFORE UPDATE ON `TimeEntry` FOR EACH ROW
BEGIN
  IF NEW.`minutes` < 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Time minutes must be nonnegative';
  END IF;
END;
CREATE TRIGGER `Expense_validate_insert` BEFORE INSERT ON `Expense` FOR EACH ROW
BEGIN
  IF NEW.`amount` <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Expense amount must be positive';
  END IF;
END;
CREATE TRIGGER `Expense_validate_update` BEFORE UPDATE ON `Expense` FOR EACH ROW
BEGIN
  IF NEW.`amount` <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Expense amount must be positive';
  END IF;
END;
CREATE TRIGGER `Deadline_validate_insert` BEFORE INSERT ON `Deadline` FOR EACH ROW
BEGIN
  IF NEW.`source` IN ('AI','IMPORT') AND NEW.`verification` = 'CONFIRMED' AND NEW.`verifiedById` IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AI/import deadlines require a verifier';
  END IF;
END;
CREATE TRIGGER `Deadline_validate_update` BEFORE UPDATE ON `Deadline` FOR EACH ROW
BEGIN
  IF NEW.`source` IN ('AI','IMPORT') AND NEW.`verification` = 'CONFIRMED' AND NEW.`verifiedById` IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AI/import deadlines require a verifier';
  END IF;
END;
