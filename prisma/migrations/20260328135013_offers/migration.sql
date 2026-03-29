-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "category" TEXT,
    "title" JSONB NOT NULL,
    "description" JSONB NOT NULL,
    "extra" JSONB,
    "priceNet" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION,
    "method" TEXT,
    "country" TEXT,
    "accountType" TEXT,
    "accountRegion" TEXT,
    "voiceChat" BOOLEAN,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageUrl" TEXT,
    "sellerEmail" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeUntil" TIMESTAMP(3),

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Offer_offerId_key" ON "Offer"("offerId");

-- CreateIndex
CREATE INDEX "Offer_sellerEmail_idx" ON "Offer"("sellerEmail");

-- CreateIndex
CREATE INDEX "Offer_status_idx" ON "Offer"("status");

-- CreateIndex
CREATE INDEX "Offer_game_idx" ON "Offer"("game");

-- CreateIndex
CREATE INDEX "Offer_mode_idx" ON "Offer"("mode");

-- CreateIndex
CREATE INDEX "Offer_category_idx" ON "Offer"("category");

-- CreateIndex
CREATE INDEX "Offer_createdAt_idx" ON "Offer"("createdAt");
