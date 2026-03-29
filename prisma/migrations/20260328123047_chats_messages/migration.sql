-- CreateTable
CREATE TABLE "Chat" (
    "id" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "sellerEmail" TEXT NOT NULL,
    "offerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "official" BOOLEAN NOT NULL DEFAULT false,
    "deletedBy" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "fromUserId" TEXT,
    "fromUsername" TEXT,
    "fromRole" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'user',
    "messageType" TEXT NOT NULL DEFAULT 'user',
    "staffRole" TEXT,
    "text" TEXT NOT NULL DEFAULT '',
    "media" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "officialType" TEXT,
    "systemType" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Chat_buyerEmail_idx" ON "Chat"("buyerEmail");

-- CreateIndex
CREATE INDEX "Chat_sellerEmail_idx" ON "Chat"("sellerEmail");

-- CreateIndex
CREATE INDEX "Chat_offerId_idx" ON "Chat"("offerId");

-- CreateIndex
CREATE INDEX "Chat_official_idx" ON "Chat"("official");

-- CreateIndex
CREATE INDEX "Chat_createdAt_idx" ON "Chat"("createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_chatId_createdAt_idx" ON "ChatMessage"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_fromEmail_idx" ON "ChatMessage"("fromEmail");

-- CreateIndex
CREATE INDEX "ChatMessage_read_idx" ON "ChatMessage"("read");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
