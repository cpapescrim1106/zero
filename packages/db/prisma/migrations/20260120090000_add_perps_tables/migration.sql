-- CreateTable
CREATE TABLE "PerpsAccount" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "subaccountId" INTEGER NOT NULL,
    "venue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "meta" JSONB,

    CONSTRAINT "PerpsAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerpsPosition" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "baseQty" DECIMAL(38,18) NOT NULL,
    "quoteQty" DECIMAL(38,18) NOT NULL,
    "entryPrice" DECIMAL(38,18),
    "markPrice" DECIMAL(38,18),
    "leverage" DECIMAL(38,18),
    "liqPrice" DECIMAL(38,18),
    "pnlUnrealized" DECIMAL(38,18),
    "pnlRealized" DECIMAL(38,18),
    "pnlFunding" DECIMAL(38,18),
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB,

    CONSTRAINT "PerpsPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerpsMarginSnapshot" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "equity" DECIMAL(38,18),
    "marginUsed" DECIMAL(38,18),
    "healthRatio" DECIMAL(38,18),
    "leverage" DECIMAL(38,18),
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB,

    CONSTRAINT "PerpsMarginSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerpsFundingSnapshot" (
    "id" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "fundingRate" DECIMAL(38,18),
    "nextFundingAt" TIMESTAMP(3),
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB,

    CONSTRAINT "PerpsFundingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerpsObjective" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "meta" JSONB,

    CONSTRAINT "PerpsObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerpsRiskConfig" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerpsRiskConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PerpsAccount_botId_key" ON "PerpsAccount"("botId");

-- CreateIndex
CREATE INDEX "PerpsAccount_walletId_idx" ON "PerpsAccount"("walletId");

-- CreateIndex
CREATE INDEX "PerpsAccount_subaccountId_idx" ON "PerpsAccount"("subaccountId");

-- CreateIndex
CREATE INDEX "PerpsPosition_botId_ts_idx" ON "PerpsPosition"("botId", "ts");

-- CreateIndex
CREATE INDEX "PerpsPosition_market_ts_idx" ON "PerpsPosition"("market", "ts");

-- CreateIndex
CREATE INDEX "PerpsMarginSnapshot_botId_ts_idx" ON "PerpsMarginSnapshot"("botId", "ts");

-- CreateIndex
CREATE INDEX "PerpsFundingSnapshot_market_ts_idx" ON "PerpsFundingSnapshot"("market", "ts");

-- CreateIndex
CREATE INDEX "PerpsObjective_botId_createdAt_idx" ON "PerpsObjective"("botId", "createdAt");
