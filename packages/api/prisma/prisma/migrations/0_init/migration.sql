-- CreateEnum
CREATE TYPE "transaction_type_enum" AS ENUM ('addLiquidity', 'removeLiquidity', 'long', 'short', 'settledPosition');

-- CreateTable
CREATE TABLE "cache_candle" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "candleType" VARCHAR NOT NULL,
    "interval" INTEGER NOT NULL,
    "trailingAvgTime" INTEGER,
    "resourceSlug" VARCHAR,
    "marketIdx" INTEGER,
    "timestamp" INTEGER NOT NULL,
    "open" VARCHAR NOT NULL,
    "high" VARCHAR NOT NULL,
    "low" VARCHAR NOT NULL,
    "close" VARCHAR NOT NULL,
    "endTimestamp" INTEGER NOT NULL,
    "lastUpdatedTimestamp" INTEGER NOT NULL,
    "sumUsed" DECIMAL(78,0),
    "sumFeePaid" DECIMAL(78,0),
    "trailingStartTimestamp" INTEGER,
    "address" VARCHAR,
    "chainId" INTEGER,
    "marketId" INTEGER,

    CONSTRAINT "PK_7cccb7fd4c9f01146f390945d47" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cache_param" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paramName" VARCHAR NOT NULL,
    "paramValueNumber" DECIMAL(78,0) NOT NULL,

    CONSTRAINT "PK_b54cfc9bf8c8a86647ef9d05bd4" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" VARCHAR NOT NULL,
    "slug" VARCHAR NOT NULL,

    CONSTRAINT "PK_9c4e4a89e3674fc9f382d733f03" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collateral_transfer" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transactionHash" VARCHAR NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "owner" VARCHAR NOT NULL,
    "collateral" DECIMAL(78,0) NOT NULL,

    CONSTRAINT "PK_802f4b29443f8febc65ab112e02" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crypto_prices" (
    "id" SERIAL NOT NULL,
    "ticker" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PK_89cb6d0cae37e526edadf4ce7c2" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockNumber" INTEGER NOT NULL,
    "transactionHash" VARCHAR NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "logData" JSON NOT NULL,
    "marketGroupId" INTEGER,

    CONSTRAINT "PK_30c2f3bbaf6d34a55f8ae6e4614" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marketId" INTEGER NOT NULL,
    "startTimestamp" INTEGER,
    "endTimestamp" INTEGER,
    "startingSqrtPriceX96" DECIMAL(78,0),
    "settlementPriceD18" DECIMAL(78,0),
    "settled" BOOLEAN,
    "baseAssetMinPriceTick" INTEGER,
    "baseAssetMaxPriceTick" INTEGER,
    "minPriceD18" DECIMAL(78,0),
    "maxPriceD18" DECIMAL(78,0),
    "marketGroupId" INTEGER,
    "marketParamsFeerate" INTEGER,
    "marketParamsAssertionliveness" DECIMAL(78,0),
    "marketParamsBondcurrency" VARCHAR,
    "marketParamsBondamount" DECIMAL(78,0),
    "marketParamsClaimstatement" VARCHAR,
    "marketParamsUniswappositionmanager" VARCHAR,
    "marketParamsUniswapswaprouter" VARCHAR,
    "marketParamsUniswapquoter" VARCHAR,
    "marketParamsOptimisticoraclev3" VARCHAR,
    "public" BOOLEAN NOT NULL DEFAULT true,
    "question" TEXT,
    "poolAddress" TEXT,
    "optionName" TEXT,
    "rules" TEXT,

    CONSTRAINT "PK_247e7fe519fa359ba924d04f289" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_group" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "address" VARCHAR,
    "vaultAddress" VARCHAR,
    "isYin" BOOLEAN NOT NULL DEFAULT false,
    "chainId" INTEGER NOT NULL,
    "deployTimestamp" INTEGER,
    "deployTxnBlockNumber" INTEGER,
    "owner" VARCHAR,
    "collateralAsset" VARCHAR,
    "resourceId" INTEGER,
    "marketParamsFeerate" INTEGER,
    "marketParamsAssertionliveness" DECIMAL(78,0),
    "marketParamsBondcurrency" VARCHAR,
    "marketParamsBondamount" DECIMAL(78,0),
    "marketParamsClaimstatement" VARCHAR,
    "marketParamsUniswappositionmanager" VARCHAR,
    "marketParamsUniswapswaprouter" VARCHAR,
    "marketParamsUniswapquoter" VARCHAR,
    "marketParamsOptimisticoraclev3" VARCHAR,
    "isCumulative" BOOLEAN NOT NULL DEFAULT false,
    "categoryId" INTEGER,
    "question" TEXT,
    "baseTokenName" VARCHAR,
    "quoteTokenName" VARCHAR,
    "collateralDecimals" INTEGER,
    "collateralSymbol" VARCHAR,
    "initializationNonce" VARCHAR,
    "factoryAddress" VARCHAR,
    "minTradeSize" DECIMAL(78,0),

    CONSTRAINT "PK_1e9a2963edfd331d92018e3abac" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_price" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timestamp" BIGINT NOT NULL,
    "value" DECIMAL(78,0) NOT NULL,

    CONSTRAINT "PK_2d0e67fad606926d3f44a79bab5" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migrations" (
    "id" SERIAL NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "name" VARCHAR NOT NULL,

    CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "positionId" INTEGER NOT NULL,
    "owner" VARCHAR,
    "isLP" BOOLEAN NOT NULL,
    "highPriceTick" DECIMAL(78,0),
    "lowPriceTick" DECIMAL(78,0),
    "isSettled" BOOLEAN,
    "lpBaseToken" DECIMAL(78,0),
    "lpQuoteToken" DECIMAL(78,0),
    "baseToken" DECIMAL(78,0),
    "quoteToken" DECIMAL(78,0),
    "borrowedBaseToken" DECIMAL(78,0),
    "borrowedQuoteToken" DECIMAL(78,0),
    "collateral" DECIMAL(78,0) NOT NULL,
    "marketId" INTEGER,

    CONSTRAINT "PK_b7f483581562b4dc62ae1a5b7e2" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "render_job" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobId" VARCHAR NOT NULL,
    "serviceId" VARCHAR NOT NULL,

    CONSTRAINT "PK_a00488019eafb11b27af1aa1a76" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" VARCHAR NOT NULL,
    "slug" VARCHAR NOT NULL,
    "categoryId" INTEGER,

    CONSTRAINT "PK_e2894a5867e06ae2e8889f1173f" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_price" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockNumber" INTEGER NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "value" DECIMAL(78,0) NOT NULL,
    "used" DECIMAL(78,0) NOT NULL,
    "feePaid" DECIMAL(78,0) NOT NULL,
    "resourceId" INTEGER,

    CONSTRAINT "PK_a0c8cbfc0d416996af73cae1e97" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tradeRatioD18" DECIMAL(78,0),
    "type" "transaction_type_enum" NOT NULL,
    "baseToken" DECIMAL(78,0),
    "quoteToken" DECIMAL(78,0),
    "borrowedBaseToken" DECIMAL(78,0),
    "borrowedQuoteToken" DECIMAL(78,0),
    "collateral" DECIMAL(78,0) NOT NULL,
    "lpBaseDeltaToken" DECIMAL(78,0),
    "lpQuoteDeltaToken" DECIMAL(78,0),
    "eventId" INTEGER,
    "positionId" INTEGER,
    "marketPriceId" INTEGER,
    "collateralTransferId" INTEGER,

    CONSTRAINT "PK_89eadb93a89810556e1cbcd6ab9" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IDX_116e57f9f620b605a2f6194c0b" ON "cache_candle"("chainId");

-- CreateIndex
CREATE INDEX "IDX_18b0607b3120ec8c19f4bda502" ON "cache_candle"("resourceSlug");

-- CreateIndex
CREATE INDEX "IDX_2ff6d3f51dade50ce5c1426303" ON "cache_candle"("address");

-- CreateIndex
CREATE INDEX "IDX_4d21c04139a79adbf94f86405a" ON "cache_candle"("marketId");

-- CreateIndex
CREATE INDEX "IDX_669fbaca35ec75202012edcbed" ON "cache_candle"("timestamp");

-- CreateIndex
CREATE INDEX "IDX_8a3905657db0bc8cac1e561280" ON "cache_candle"("trailingAvgTime");

-- CreateIndex
CREATE INDEX "IDX_b566d110c5729686ad4505a492" ON "cache_candle"("candleType");

-- CreateIndex
CREATE INDEX "IDX_beb912ef7d1246b726a6653ead" ON "cache_candle"("marketIdx");

-- CreateIndex
CREATE INDEX "IDX_f5454dd794058f6ea2a9dd8e5f" ON "cache_candle"("interval");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_60da794228fdbf7a92bc9fe57ad" ON "cache_candle"("candleType", "interval", "timestamp", "resourceSlug", "marketIdx", "trailingAvgTime");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_aed649af408ded722f22e882314" ON "cache_param"("paramName");

-- CreateIndex
CREATE INDEX "IDX_aed649af408ded722f22e88231" ON "cache_param"("paramName");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_23c05c292c439d77b0de816b500" ON "category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_cb73208f151aa71cdd78f662d70" ON "category"("slug");

-- CreateIndex
CREATE INDEX "IDX_cb73208f151aa71cdd78f662d7" ON "category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_1ebf6f07652ca11d9f4618b64a3" ON "collateral_transfer"("transactionHash");

-- CreateIndex
CREATE INDEX "IDX_1ebf6f07652ca11d9f4618b64a" ON "collateral_transfer"("transactionHash");

-- CreateIndex
CREATE INDEX "IDX_2c15918ff289396205521c5f3c" ON "event"("timestamp");

-- CreateIndex
CREATE INDEX "IDX_5430e2d7fe1df2bcada2c12deb" ON "event"("blockNumber");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_784b6bb8194a5c7b41a7be2ffa5" ON "event"("transactionHash", "marketGroupId", "blockNumber", "logIndex");

-- CreateIndex
CREATE INDEX "IDX_02755ce1b56a981eef76c0b59b" ON "market"("marketGroupId");

-- CreateIndex
CREATE INDEX "IDX_b8cf3f5b97db288fd5252e1cb0" ON "market"("marketId");

-- CreateIndex
CREATE INDEX "IDX_bf8c48db94805b3077cfe30fa6" ON "market"("marketGroupId");

-- CreateIndex
CREATE INDEX "IDX_f89ec06faf22da268399ae6a9b" ON "market"("marketId");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_0a0e1fcc7164cb26a957c806314" ON "market"("marketGroupId", "marketId");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_6e25995aba1162dc315f8214ee7" ON "market"("marketGroupId", "marketId");

-- CreateIndex
CREATE INDEX "IDX_4840554118be25e79d9f2cd8c1" ON "market_group"("address");

-- CreateIndex
CREATE INDEX "IDX_da0b448860ebff62a08819b65a" ON "market_group"("chainId");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_b1a3dbc95ad359ef11bfb72b307" ON "market_group"("address", "chainId");

-- CreateIndex
CREATE INDEX "IDX_a9346cdd1ea1e53a6b87e409ad" ON "market_price"("timestamp");

-- CreateIndex
CREATE INDEX "IDX_927edd2b828777f0052366195e" ON "position"("positionId");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_40d3e2f973bc69ff8e8d0f89dde" ON "position"("positionId", "marketId");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_c8ed18ff47475e2c4a7bf59daa0" ON "resource"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_82453de75cd894e19c42844e706" ON "resource"("slug");

-- CreateIndex
CREATE INDEX "IDX_82453de75cd894e19c42844e70" ON "resource"("slug");

-- CreateIndex
CREATE INDEX "IDX_187fa56af532560ce204719ea3" ON "resource_price"("resourceId");

-- CreateIndex
CREATE INDEX "IDX_5bbe200849d138539d19b7caa6" ON "resource_price"("blockNumber");

-- CreateIndex
CREATE INDEX "IDX_a369700ab879af9ef6061c6dbe" ON "resource_price"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_80c0fe66c45d0dd8f4e744bb30f" ON "resource_price"("resourceId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "REL_f8aba9691e84fbd42400be9ce8" ON "transaction"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "REL_91ebc2a6a20b2b1ac354cfae98" ON "transaction"("marketPriceId");

-- CreateIndex
CREATE UNIQUE INDEX "REL_23dff7d5a1d6601cf90eb5019a" ON "transaction"("collateralTransferId");

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "FK_be2327bfd127f45a55856b4c9de" FOREIGN KEY ("marketGroupId") REFERENCES "market_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "market" ADD CONSTRAINT "FK_02755ce1b56a981eef76c0b59b4" FOREIGN KEY ("marketGroupId") REFERENCES "market_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "market_group" ADD CONSTRAINT "FK_78409a3738729038b76742291f0" FOREIGN KEY ("resourceId") REFERENCES "resource"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "market_group" ADD CONSTRAINT "FK_f092ffcae41efef68cdc30bbd89" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "FK_0ad1a3735077091c74287ffc7ca" FOREIGN KEY ("marketId") REFERENCES "market"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "resource" ADD CONSTRAINT "FK_66faacb332a925bf732256594e5" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "resource_price" ADD CONSTRAINT "FK_187fa56af532560ce204719ea39" FOREIGN KEY ("resourceId") REFERENCES "resource"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "FK_23dff7d5a1d6601cf90eb5019a3" FOREIGN KEY ("collateralTransferId") REFERENCES "collateral_transfer"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "FK_91ebc2a6a20b2b1ac354cfae981" FOREIGN KEY ("marketPriceId") REFERENCES "market_price"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "FK_f8aba9691e84fbd42400be9ce8a" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "FK_ffeefe4d2253a6af172da38fc49" FOREIGN KEY ("positionId") REFERENCES "position"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

