/*
  Warnings:

  - The `status` column on the `EdgeCommand` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `deviceKey` to the `EdgeSensorReading` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `type` on the `EdgeSensorReading` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `direction` on the `EdgeSyncLog` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `status` on the `EdgeSyncLog` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "public"."ReadingType" AS ENUM ('temperature', 'humidity', 'energy_kwh', 'cost_mnt', 'heart_rate', 'co2', 'voc', 'noise', 'light', 'custom');

-- CreateEnum
CREATE TYPE "public"."SyncDirection" AS ENUM ('outbound', 'inbound');

-- CreateEnum
CREATE TYPE "public"."SyncStatus" AS ENUM ('queued', 'sending', 'sent', 'acked', 'failed');

-- CreateEnum
CREATE TYPE "public"."EdgeCmdStatus" AS ENUM ('queued', 'processing', 'done', 'error');

-- DropIndex
DROP INDEX "public"."EdgeSensorReading_edgeId_type_createdAt_idx";

-- AlterTable
ALTER TABLE "public"."EdgeCommand" ADD COLUMN     "correlationId" TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" "public"."EdgeCmdStatus" NOT NULL DEFAULT 'queued';

-- AlterTable
ALTER TABLE "public"."EdgeSensorReading" ADD COLUMN     "deviceKey" TEXT NOT NULL,
ADD COLUMN     "syncBatch" TEXT,
ADD COLUMN     "synced" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
DROP COLUMN "type",
ADD COLUMN     "type" "public"."ReadingType" NOT NULL;

-- AlterTable
ALTER TABLE "public"."EdgeSyncLog" ADD COLUMN     "meta" JSONB,
DROP COLUMN "direction",
ADD COLUMN     "direction" "public"."SyncDirection" NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "public"."SyncStatus" NOT NULL;

-- CreateTable
CREATE TABLE "public"."EdgeIdentity" (
    "id" TEXT NOT NULL,
    "householdId" TEXT,
    "siteId" TEXT,
    "name" TEXT,
    "mainBaseUrl" TEXT,
    "sharedSecret" TEXT,
    "jwtAccessToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EdgeIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EdgeConfig" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EdgeConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "public"."LatestEdgeSensor" (
    "id" TEXT NOT NULL,
    "edgeId" TEXT NOT NULL,
    "deviceKey" TEXT NOT NULL,
    "type" "public"."ReadingType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LatestEdgeSensor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EdgeOutbox" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "public"."SyncStatus" NOT NULL DEFAULT 'queued',
    "tryCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EdgeOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LatestEdgeSensor_edgeId_updatedAt_idx" ON "public"."LatestEdgeSensor"("edgeId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LatestEdgeSensor_edgeId_deviceKey_key" ON "public"."LatestEdgeSensor"("edgeId", "deviceKey");

-- CreateIndex
CREATE INDEX "EdgeOutbox_status_nextAttemptAt_idx" ON "public"."EdgeOutbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "EdgeOutbox_createdAt_idx" ON "public"."EdgeOutbox"("createdAt");

-- CreateIndex
CREATE INDEX "EdgeCommand_status_createdAt_idx" ON "public"."EdgeCommand"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EdgeCommand_correlationId_idx" ON "public"."EdgeCommand"("correlationId");

-- CreateIndex
CREATE INDEX "EdgeSensorReading_edgeId_ts_idx" ON "public"."EdgeSensorReading"("edgeId", "ts");

-- CreateIndex
CREATE INDEX "EdgeSensorReading_edgeId_deviceKey_ts_idx" ON "public"."EdgeSensorReading"("edgeId", "deviceKey", "ts");

-- CreateIndex
CREATE INDEX "EdgeSensorReading_synced_ts_idx" ON "public"."EdgeSensorReading"("synced", "ts");

-- CreateIndex
CREATE INDEX "EdgeSensorReading_syncBatch_idx" ON "public"."EdgeSensorReading"("syncBatch");

-- CreateIndex
CREATE INDEX "EdgeSyncLog_direction_createdAt_idx" ON "public"."EdgeSyncLog"("direction", "createdAt");

-- CreateIndex
CREATE INDEX "EdgeSyncLog_status_createdAt_idx" ON "public"."EdgeSyncLog"("status", "createdAt");
