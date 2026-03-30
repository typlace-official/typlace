-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'moderator', 'support', 'resolution', 'admin', 'super_admin');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "usernameNormalized" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "avatarDataUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usernameChangedAt" TIMESTAMP(3),
    "online" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviewsCount" INTEGER NOT NULL DEFAULT 0,
    "blockedUsers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notifySite" BOOLEAN NOT NULL DEFAULT true,
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyTelegram" BOOLEAN NOT NULL DEFAULT false,
    "telegramChatId" TEXT,
    "telegramUsername" TEXT,
    "telegramFirstName" TEXT,
    "telegramLinkedAt" TIMESTAMP(3),
    "lang" TEXT NOT NULL DEFAULT 'ru',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "tempUsername" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSentAt" TIMESTAMP(3) NOT NULL,
    "tries" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "PendingCode_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "sellerEmail" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "commission" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "disputeStatus" TEXT NOT NULL DEFAULT 'none',
    "disputeTicketId" TEXT,
    "resolutionAssignedTo" TEXT,
    "resolutionRequestedAt" TIMESTAMP(3),
    "resolutionAssignedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offerSnapshot" JSONB,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sellerEmail" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminLog" (
    "id" TEXT NOT NULL,
    "actorEmail" TEXT,
    "actorUsername" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "shortId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'support',
    "userEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "orderId" TEXT,
    "userId" TEXT,
    "offerId" TEXT,
    "chatId" TEXT,
    "orderInternalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "reopenCount" INTEGER NOT NULL DEFAULT 0,
    "assignedTo" TEXT,
    "assignedRole" TEXT,
    "assignedAt" TIMESTAMP(3),
    "resolutionAssignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "avatarDataUrl" TEXT,
    "text" TEXT NOT NULL,
    "attachments" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportLog" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_usernameNormalized_key" ON "User"("usernameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "User_userId_key" ON "User"("userId");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_email_idx" ON "Session"("email");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PendingCode_email_key" ON "PendingCode"("email");

-- CreateIndex
CREATE INDEX "PendingCode_expiresAt_idx" ON "PendingCode"("expiresAt");

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

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_offerId_idx" ON "Order"("offerId");

-- CreateIndex
CREATE INDEX "Order_buyerEmail_idx" ON "Order"("buyerEmail");

-- CreateIndex
CREATE INDEX "Order_sellerEmail_idx" ON "Order"("sellerEmail");

-- CreateIndex
CREATE INDEX "Order_chatId_idx" ON "Order"("chatId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_disputeStatus_idx" ON "Order"("disputeStatus");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_orderId_key" ON "Review"("orderId");

-- CreateIndex
CREATE INDEX "Review_sellerEmail_idx" ON "Review"("sellerEmail");

-- CreateIndex
CREATE INDEX "Review_buyerEmail_idx" ON "Review"("buyerEmail");

-- CreateIndex
CREATE INDEX "Review_createdAt_idx" ON "Review"("createdAt");

-- CreateIndex
CREATE INDEX "AdminLog_actorEmail_idx" ON "AdminLog"("actorEmail");

-- CreateIndex
CREATE INDEX "AdminLog_action_idx" ON "AdminLog"("action");

-- CreateIndex
CREATE INDEX "AdminLog_targetType_idx" ON "AdminLog"("targetType");

-- CreateIndex
CREATE INDEX "AdminLog_targetId_idx" ON "AdminLog"("targetId");

-- CreateIndex
CREATE INDEX "AdminLog_createdAt_idx" ON "AdminLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_shortId_key" ON "SupportTicket"("shortId");

-- CreateIndex
CREATE INDEX "SupportTicket_userEmail_idx" ON "SupportTicket"("userEmail");

-- CreateIndex
CREATE INDEX "SupportTicket_assignedTo_idx" ON "SupportTicket"("assignedTo");

-- CreateIndex
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");

-- CreateIndex
CREATE INDEX "SupportTicket_kind_idx" ON "SupportTicket"("kind");

-- CreateIndex
CREATE INDEX "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportLog_ticketId_createdAt_idx" ON "SupportLog"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingCode" ADD CONSTRAINT "PendingCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportLog" ADD CONSTRAINT "SupportLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
