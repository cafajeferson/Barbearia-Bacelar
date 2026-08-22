-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN     "noShowSweepGraceHours" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "recurringGenerationWindowDays" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "reminderHoursBefore" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "retentionCouponDaysInactive" INTEGER NOT NULL DEFAULT 30;
