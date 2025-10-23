/*
  Warnings:

  - Added the required column `deviceKey` to the `EdgeCommand` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `EdgeCommand` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."EdgeCommand" ADD COLUMN     "deviceKey" TEXT NOT NULL,
ADD COLUMN     "type" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "EdgeCommand_deviceKey_idx" ON "public"."EdgeCommand"("deviceKey");
