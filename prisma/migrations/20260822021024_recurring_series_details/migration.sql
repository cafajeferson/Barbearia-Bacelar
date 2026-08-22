-- AlterTable
ALTER TABLE "RecurringSeries" ADD COLUMN     "startTime" TEXT NOT NULL DEFAULT '09:00';

-- CreateTable
CREATE TABLE "RecurringSeriesService" (
    "recurringSeriesId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,

    CONSTRAINT "RecurringSeriesService_pkey" PRIMARY KEY ("recurringSeriesId","serviceId")
);

-- AddForeignKey
ALTER TABLE "RecurringSeriesService" ADD CONSTRAINT "RecurringSeriesService_recurringSeriesId_fkey" FOREIGN KEY ("recurringSeriesId") REFERENCES "RecurringSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringSeriesService" ADD CONSTRAINT "RecurringSeriesService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
