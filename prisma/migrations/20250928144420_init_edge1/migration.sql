-- CreateTable
CREATE TABLE "public"."EdgeSensorReading" (
    "id" TEXT NOT NULL,
    "edgeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EdgeSensorReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EdgeSyncLog" (
    "id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EdgeSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EdgeCommand" (
    "id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "EdgeCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EdgeSensorReading_edgeId_type_createdAt_idx" ON "public"."EdgeSensorReading"("edgeId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "EdgeSyncLog_direction_createdAt_idx" ON "public"."EdgeSyncLog"("direction", "createdAt");
