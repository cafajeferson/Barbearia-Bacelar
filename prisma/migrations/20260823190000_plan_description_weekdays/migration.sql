-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "description" TEXT,
ADD COLUMN     "allowedWeekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
