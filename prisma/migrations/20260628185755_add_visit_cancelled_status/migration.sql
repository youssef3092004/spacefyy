-- AlterEnum
ALTER TYPE "VisitStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
