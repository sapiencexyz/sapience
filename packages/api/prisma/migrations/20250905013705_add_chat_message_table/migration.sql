-- CreateTable
CREATE TABLE "chat_message" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "text" TEXT NOT NULL,
    "address" VARCHAR,
    "timestamp" BIGINT NOT NULL,

    CONSTRAINT "chat_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IDX_chat_message_timestamp" ON "chat_message"("timestamp");

-- CreateIndex
CREATE INDEX "IDX_chat_message_address" ON "chat_message"("address");
