-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `avatar` VARCHAR(2048) NULL,
    `themePreference` ENUM('LIGHT', 'DARK') NOT NULL DEFAULT 'LIGHT',
    `retentionHours` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Download` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `platform` ENUM('YOUTUBE', 'INSTAGRAM', 'FACEBOOK') NOT NULL,
    `sourceUrlCiphertext` TEXT NOT NULL,
    `sourceUrlIv` VARCHAR(64) NOT NULL,
    `sourceUrlTag` VARCHAR(64) NOT NULL,
    `sourceUrlKeyVersion` VARCHAR(32) NOT NULL,
    `title` VARCHAR(512) NULL,
    `selectedFormatId` VARCHAR(128) NOT NULL,
    `targetContainer` VARCHAR(16) NULL,
    `targetHeight` INTEGER NULL,
    `status` ENUM('QUEUED', 'PROCESSING', 'READY', 'FAILED', 'MEDIA_DELETED', 'EXPIRED', 'DELETE_FAILED') NOT NULL DEFAULT 'QUEUED',
    `storageObjectKey` VARCHAR(512) NULL,
    `fileName` VARCHAR(255) NULL,
    `mimeType` VARCHAR(127) NULL,
    `sizeBytes` BIGINT NULL,
    `retentionHoursSnapshot` INTEGER NULL,
    `completedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `failureCode` VARCHAR(128) NULL,
    `replayOfId` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Download_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `Download_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `Download_status_expiresAt_idx`(`status`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Download` ADD CONSTRAINT `Download_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Download` ADD CONSTRAINT `Download_replayOfId_fkey` FOREIGN KEY (`replayOfId`) REFERENCES `Download`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
