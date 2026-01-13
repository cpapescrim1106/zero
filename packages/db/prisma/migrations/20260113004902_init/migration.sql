-- CreateTable
CREATE TABLE "Bot" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strategyKey" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "riskConfig" JSONB NOT NULL,
    "schedule" JSONB,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotRun" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "configSnapshot" JSONB NOT NULL,
    "strategyVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "BotRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "runId" TEXT,
    "venue" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "externalId" TEXT,
    "clientOrderId" TEXT,
    "side" TEXT NOT NULL,
    "price" DECIMAL(38,18) NOT NULL,
    "size" DECIMAL(38,18) NOT NULL,
    "status" TEXT NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "meta" JSONB,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fill" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "txSig" TEXT NOT NULL,
    "qty" DECIMAL(38,18) NOT NULL,
    "price" DECIMAL(38,18) NOT NULL,
    "fees" DECIMAL(38,18),
    "realizedPnl" DECIMAL(38,18),
    "filledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB,

    CONSTRAINT "Fill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionSnapshot" (
    "id" TEXT NOT NULL,
    "botId" TEXT,
    "market" TEXT NOT NULL,
    "baseQty" DECIMAL(38,18) NOT NULL,
    "quoteQty" DECIMAL(38,18) NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "meta" JSONB,

    CONSTRAINT "PositionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventLog" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "botId" TEXT,
    "source" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotSnapshot" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "runId" TEXT,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "state" JSONB NOT NULL,
    "equity" DECIMAL(38,18),
    "pnlRealized" DECIMAL(38,18),
    "pnlUnrealized" DECIMAL(38,18),

    CONSTRAINT "BotSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountSnapshot" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "equity" DECIMAL(38,18),
    "balances" JSONB NOT NULL,
    "pnlRealized" DECIMAL(38,18),
    "pnlUnrealized" DECIMAL(38,18),

    CONSTRAINT "AccountSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskEvent" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "context" JSONB,

    CONSTRAINT "RiskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Bot_strategyKey_idx" ON "Bot"("strategyKey");

-- CreateIndex
CREATE INDEX "Bot_venue_market_idx" ON "Bot"("venue", "market");

-- CreateIndex
CREATE INDEX "Bot_status_idx" ON "Bot"("status");

-- CreateIndex
CREATE INDEX "BotRun_botId_startedAt_idx" ON "BotRun"("botId", "startedAt");

-- CreateIndex
CREATE INDEX "Order_botId_status_idx" ON "Order"("botId", "status");

-- CreateIndex
CREATE INDEX "Order_externalId_idx" ON "Order"("externalId");

-- CreateIndex
CREATE INDEX "Order_clientOrderId_idx" ON "Order"("clientOrderId");

-- CreateIndex
CREATE INDEX "Fill_orderId_idx" ON "Fill"("orderId");

-- CreateIndex
CREATE INDEX "Fill_txSig_idx" ON "Fill"("txSig");

-- CreateIndex
CREATE INDEX "PositionSnapshot_botId_ts_idx" ON "PositionSnapshot"("botId", "ts");

-- CreateIndex
CREATE INDEX "PositionSnapshot_market_ts_idx" ON "PositionSnapshot"("market", "ts");

-- CreateIndex
CREATE INDEX "EventLog_botId_ts_idx" ON "EventLog"("botId", "ts");

-- CreateIndex
CREATE INDEX "EventLog_kind_ts_idx" ON "EventLog"("kind", "ts");

-- CreateIndex
CREATE INDEX "BotSnapshot_botId_ts_idx" ON "BotSnapshot"("botId", "ts");

-- CreateIndex
CREATE INDEX "AccountSnapshot_walletId_ts_idx" ON "AccountSnapshot"("walletId", "ts");

-- CreateIndex
CREATE INDEX "RiskEvent_botId_ts_idx" ON "RiskEvent"("botId", "ts");

-- AddForeignKey
ALTER TABLE "BotRun" ADD CONSTRAINT "BotRun_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_runId_fkey" FOREIGN KEY ("runId") REFERENCES "BotRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotSnapshot" ADD CONSTRAINT "BotSnapshot_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotSnapshot" ADD CONSTRAINT "BotSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "BotRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskEvent" ADD CONSTRAINT "RiskEvent_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
