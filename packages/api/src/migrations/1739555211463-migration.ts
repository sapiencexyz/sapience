import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1739555211463 implements MigrationInterface {
  name = 'Migration1739555211463';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "epoch" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "epochId" integer NOT NULL, "startTimestamp" integer, "endTimestamp" integer, "startingSqrtPriceX96" numeric(78,0), "settlementPriceD18" numeric(78,0), "settled" boolean, "baseAssetMinPriceTick" integer, "baseAssetMaxPriceTick" integer, "minPriceD18" numeric(78,0), "maxPriceD18" numeric(78,0), "marketId" integer, "marketParamsFeerate" integer, "marketParamsAssertionliveness" numeric(78,0), "marketParamsBondcurrency" character varying, "marketParamsBondamount" numeric(78,0), "marketParamsClaimstatement" character varying, "marketParamsUniswappositionmanager" character varying, "marketParamsUniswapswaprouter" character varying, "marketParamsUniswapquoter" character varying, "marketParamsOptimisticoraclev3" character varying, CONSTRAINT "UQ_6e25995aba1162dc315f8214ee7" UNIQUE ("marketId", "epochId"), CONSTRAINT "PK_247e7fe519fa359ba924d04f289" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "resource_price" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "blockNumber" integer NOT NULL, "timestamp" integer NOT NULL, "value" numeric(78,0) NOT NULL, "used" numeric(78,0) NOT NULL, "feePaid" numeric(78,0) NOT NULL, "resourceId" integer, CONSTRAINT "UQ_80c0fe66c45d0dd8f4e744bb30f" UNIQUE ("resourceId", "timestamp"), CONSTRAINT "PK_a0c8cbfc0d416996af73cae1e97" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "resource" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying NOT NULL, "slug" character varying NOT NULL, CONSTRAINT "UQ_c8ed18ff47475e2c4a7bf59daa0" UNIQUE ("name"), CONSTRAINT "UQ_82453de75cd894e19c42844e706" UNIQUE ("slug"), CONSTRAINT "PK_e2894a5867e06ae2e8889f1173f" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "market" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "address" character varying NOT NULL, "vaultAddress" character varying, "isYin" boolean NOT NULL DEFAULT false, "chainId" integer NOT NULL, "deployTimestamp" integer, "deployTxnBlockNumber" integer, "owner" character varying, "collateralAsset" character varying, "public" boolean NOT NULL DEFAULT false, "resourceId" integer, "marketParamsFeerate" integer, "marketParamsAssertionliveness" numeric(78,0), "marketParamsBondcurrency" character varying, "marketParamsBondamount" numeric(78,0), "marketParamsClaimstatement" character varying, "marketParamsUniswappositionmanager" character varying, "marketParamsUniswapswaprouter" character varying, "marketParamsUniswapquoter" character varying, "marketParamsOptimisticoraclev3" character varying, CONSTRAINT "UQ_035a4c41b4b11c5726c54d68ec4" UNIQUE ("address", "chainId"), CONSTRAINT "PK_1e9a2963edfd331d92018e3abac" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "event" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "blockNumber" integer NOT NULL, "transactionHash" character varying NOT NULL, "timestamp" bigint NOT NULL, "logIndex" integer NOT NULL, "logData" json NOT NULL, "marketId" integer, CONSTRAINT "UQ_d099d527f26583faa4f1ace4d08" UNIQUE ("transactionHash", "marketId", "blockNumber", "logIndex"), CONSTRAINT "PK_30c2f3bbaf6d34a55f8ae6e4614" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "market_price" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "timestamp" bigint NOT NULL, "value" numeric(78,0) NOT NULL, CONSTRAINT "PK_2d0e67fad606926d3f44a79bab5" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "collateral_transfer" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "transactionHash" character varying NOT NULL, "timestamp" integer NOT NULL, "owner" character varying NOT NULL, "collateral" numeric(78,0) NOT NULL, CONSTRAINT "UQ_1ebf6f07652ca11d9f4618b64a3" UNIQUE ("transactionHash"), CONSTRAINT "PK_802f4b29443f8febc65ab112e02" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TYPE "public"."transaction_type_enum" AS ENUM('addLiquidity', 'removeLiquidity', 'long', 'short', 'settledPosition')`
    );
    await queryRunner.query(
      `CREATE TABLE "transaction" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "tradeRatioD18" numeric(78,0), "type" "public"."transaction_type_enum" NOT NULL, "baseToken" numeric(78,0), "quoteToken" numeric(78,0), "borrowedBaseToken" numeric(78,0), "borrowedQuoteToken" numeric(78,0), "collateral" numeric(78,0) NOT NULL, "lpBaseDeltaToken" numeric(78,0), "lpQuoteDeltaToken" numeric(78,0), "eventId" integer, "positionId" integer, "marketPriceId" integer, "collateralTransferId" integer, CONSTRAINT "REL_f8aba9691e84fbd42400be9ce8" UNIQUE ("eventId"), CONSTRAINT "REL_91ebc2a6a20b2b1ac354cfae98" UNIQUE ("marketPriceId"), CONSTRAINT "REL_23dff7d5a1d6601cf90eb5019a" UNIQUE ("collateralTransferId"), CONSTRAINT "PK_89eadb93a89810556e1cbcd6ab9" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "position" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "positionId" integer NOT NULL, "owner" character varying, "isLP" boolean NOT NULL, "highPriceTick" numeric(78,0), "lowPriceTick" numeric(78,0), "isSettled" boolean, "lpBaseToken" numeric(78,0), "lpQuoteToken" numeric(78,0), "baseToken" numeric(78,0), "quoteToken" numeric(78,0), "borrowedBaseToken" numeric(78,0), "borrowedQuoteToken" numeric(78,0), "collateral" numeric(78,0) NOT NULL, "epochId" integer, CONSTRAINT "UQ_6e96ed27f3878b2e461f10d0199" UNIQUE ("positionId", "epochId"), CONSTRAINT "PK_b7f483581562b4dc62ae1a5b7e2" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "render_job" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "jobId" character varying NOT NULL, "serviceId" character varying NOT NULL, CONSTRAINT "PK_a00488019eafb11b27af1aa1a76" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `ALTER TABLE "epoch" ADD CONSTRAINT "FK_02755ce1b56a981eef76c0b59b4" FOREIGN KEY ("marketId") REFERENCES "market"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "resource_price" ADD CONSTRAINT "FK_187fa56af532560ce204719ea39" FOREIGN KEY ("resourceId") REFERENCES "resource"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "market" ADD CONSTRAINT "FK_9e81566b3fb87af12ce026d175c" FOREIGN KEY ("resourceId") REFERENCES "resource"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "event" ADD CONSTRAINT "FK_aa29b0dd2af5ee4ca69fabf546f" FOREIGN KEY ("marketId") REFERENCES "market"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "transaction" ADD CONSTRAINT "FK_f8aba9691e84fbd42400be9ce8a" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "transaction" ADD CONSTRAINT "FK_ffeefe4d2253a6af172da38fc49" FOREIGN KEY ("positionId") REFERENCES "position"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "transaction" ADD CONSTRAINT "FK_91ebc2a6a20b2b1ac354cfae981" FOREIGN KEY ("marketPriceId") REFERENCES "market_price"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "transaction" ADD CONSTRAINT "FK_23dff7d5a1d6601cf90eb5019a3" FOREIGN KEY ("collateralTransferId") REFERENCES "collateral_transfer"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "position" ADD CONSTRAINT "FK_f4b5c7e8a79b394e39676c52878" FOREIGN KEY ("epochId") REFERENCES "epoch"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "position" DROP CONSTRAINT "FK_f4b5c7e8a79b394e39676c52878"`
    );
    await queryRunner.query(
      `ALTER TABLE "transaction" DROP CONSTRAINT "FK_23dff7d5a1d6601cf90eb5019a3"`
    );
    await queryRunner.query(
      `ALTER TABLE "transaction" DROP CONSTRAINT "FK_91ebc2a6a20b2b1ac354cfae981"`
    );
    await queryRunner.query(
      `ALTER TABLE "transaction" DROP CONSTRAINT "FK_ffeefe4d2253a6af172da38fc49"`
    );
    await queryRunner.query(
      `ALTER TABLE "transaction" DROP CONSTRAINT "FK_f8aba9691e84fbd42400be9ce8a"`
    );
    await queryRunner.query(
      `ALTER TABLE "event" DROP CONSTRAINT "FK_aa29b0dd2af5ee4ca69fabf546f"`
    );
    await queryRunner.query(
      `ALTER TABLE "market" DROP CONSTRAINT "FK_9e81566b3fb87af12ce026d175c"`
    );
    await queryRunner.query(
      `ALTER TABLE "resource_price" DROP CONSTRAINT "FK_187fa56af532560ce204719ea39"`
    );
    await queryRunner.query(
      `ALTER TABLE "epoch" DROP CONSTRAINT "FK_02755ce1b56a981eef76c0b59b4"`
    );
    await queryRunner.query(`DROP TABLE "render_job"`);
    await queryRunner.query(`DROP TABLE "position"`);
    await queryRunner.query(`DROP TABLE "transaction"`);
    await queryRunner.query(`DROP TYPE "public"."transaction_type_enum"`);
    await queryRunner.query(`DROP TABLE "collateral_transfer"`);
    await queryRunner.query(`DROP TABLE "market_price"`);
    await queryRunner.query(`DROP TABLE "event"`);
    await queryRunner.query(`DROP TABLE "market"`);
    await queryRunner.query(`DROP TABLE "resource"`);
    await queryRunner.query(`DROP TABLE "resource_price"`);
    await queryRunner.query(`DROP TABLE "epoch"`);
  }
}
