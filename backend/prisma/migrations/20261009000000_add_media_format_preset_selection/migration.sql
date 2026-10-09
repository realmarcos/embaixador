-- AlterTable
ALTER TABLE `Download`
    ADD COLUMN `selectedPresetId` VARCHAR(64) NULL,
    ADD COLUMN `targetWidth` INTEGER NULL,
    ADD COLUMN `targetAudioOnly` BOOLEAN NOT NULL DEFAULT false;