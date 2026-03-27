-- CreateTable
CREATE TABLE "credit_session" (
    "token" VARCHAR(64) NOT NULL,
    "wallet" VARCHAR NOT NULL,
    "credits" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(6) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_session_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE INDEX "IDX_credit_session_expires_at" ON "credit_session"("expiresAt");

-- CreateIndex
CREATE INDEX "IDX_credit_session_wallet" ON "credit_session"("wallet");
