/**
 * Migration script: Migrate legacy user referral data to unified ReferralCode table
 *
 * This script:
 * 1. Creates ReferralCode entries for users who have refCodeHash (their own codes)
 * 2. Links users who were referred (referredById) to the corresponding ReferralCode
 *
 * Run with: pnpm run migrate:referrals
 *
 * Safe to run multiple times (idempotent).
 */

import { PrismaClient } from '../../generated/prisma';

const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

interface MigrationStats {
  usersWithCodes: number;
  codesCreated: number;
  codesAlreadyExist: number;
  usersWithReferrals: number;
  referralsLinked: number;
  referralsAlreadyLinked: number;
  referralsSkipped: number;
  errors: string[];
}

async function migrateReferralCodes(): Promise<MigrationStats> {
  const stats: MigrationStats = {
    usersWithCodes: 0,
    codesCreated: 0,
    codesAlreadyExist: 0,
    usersWithReferrals: 0,
    referralsLinked: 0,
    referralsAlreadyLinked: 0,
    referralsSkipped: 0,
    errors: [],
  };

  console.log('Starting referral code migration...\n');

  // Step 1: Find all users who have created referral codes (have refCodeHash)
  const usersWithCodes = await prisma.user.findMany({
    where: {
      refCodeHash: { not: null },
    },
    select: {
      id: true,
      address: true,
      refCodeHash: true,
      maxReferrals: true,
    },
  });

  stats.usersWithCodes = usersWithCodes.length;
  console.log(
    `Found ${usersWithCodes.length} users with referral codes to migrate\n`
  );

  // Step 1a: Create ReferralCode entries for each user with refCodeHash
  for (const user of usersWithCodes) {
    if (!user.refCodeHash) continue;

    try {
      // Check if code already exists in ReferralCode table
      const existingCode = await prisma.referralCode.findFirst({
        where: { codeHash: user.refCodeHash },
      });

      if (existingCode) {
        console.log(
          `  [SKIP] Code for ${user.address} already exists (id: ${existingCode.id})`
        );
        stats.codesAlreadyExist++;
        continue;
      }

      // Create new ReferralCode entry
      const newCode = await prisma.referralCode.create({
        data: {
          codeHash: user.refCodeHash,
          code: null, // We don't have the plaintext
          createdBy: user.address.toLowerCase(),
          creatorType: 'user',
          maxClaims: user.maxReferrals,
          isActive: true,
        },
      });

      console.log(
        `  [CREATED] Code for ${user.address} -> ReferralCode id: ${newCode.id}`
      );
      stats.codesCreated++;
    } catch (error) {
      const msg = `Error creating code for user ${user.address}: ${error}`;
      console.error(`  [ERROR] ${msg}`);
      stats.errors.push(msg);
    }
  }

  console.log('\n--- Code Creation Complete ---\n');

  // Step 2: Find all users who were referred (have referredById)
  const referredUsers = await prisma.user.findMany({
    where: {
      referredById: { not: null },
    },
    select: {
      id: true,
      address: true,
      referredById: true,
      referredByCodeId: true,
    },
  });

  stats.usersWithReferrals = referredUsers.length;
  console.log(
    `Found ${referredUsers.length} users with referredById to migrate\n`
  );

  // Step 2a: Link each referred user to the appropriate ReferralCode
  for (const user of referredUsers) {
    if (user.referredById === null) continue;

    try {
      // Already linked?
      if (user.referredByCodeId !== null) {
        console.log(
          `  [SKIP] User ${user.address} already has referredByCodeId: ${user.referredByCodeId}`
        );
        stats.referralsAlreadyLinked++;
        continue;
      }

      // Find the referrer user
      const referrer = await prisma.user.findUnique({
        where: { id: user.referredById },
        select: {
          id: true,
          address: true,
          refCodeHash: true,
        },
      });

      if (!referrer) {
        console.log(
          `  [SKIP] User ${user.address}: referrer id ${user.referredById} not found`
        );
        stats.referralsSkipped++;
        continue;
      }

      if (!referrer.refCodeHash) {
        console.log(
          `  [SKIP] User ${user.address}: referrer ${referrer.address} has no refCodeHash`
        );
        stats.referralsSkipped++;
        continue;
      }

      // Find the corresponding ReferralCode
      const referralCode = await prisma.referralCode.findFirst({
        where: { codeHash: referrer.refCodeHash },
      });

      if (!referralCode) {
        console.log(
          `  [SKIP] User ${user.address}: no ReferralCode found for hash ${referrer.refCodeHash}`
        );
        stats.referralsSkipped++;
        continue;
      }

      // Update the user's referredByCodeId
      await prisma.user.update({
        where: { id: user.id },
        data: { referredByCodeId: referralCode.id },
      });

      console.log(
        `  [LINKED] User ${user.address} -> ReferralCode id: ${referralCode.id} (from ${referrer.address})`
      );
      stats.referralsLinked++;
    } catch (error) {
      const msg = `Error linking user ${user.address}: ${error}`;
      console.error(`  [ERROR] ${msg}`);
      stats.errors.push(msg);
    }
  }

  return stats;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Referral Code Migration Script');
  console.log('='.repeat(60));
  console.log();

  try {
    await prisma.$connect();
    console.log('Connected to database\n');

    const stats = await migrateReferralCodes();

    console.log('\n' + '='.repeat(60));
    console.log('Migration Summary');
    console.log('='.repeat(60));
    console.log(`Users with codes found:     ${stats.usersWithCodes}`);
    console.log(`  - Codes created:          ${stats.codesCreated}`);
    console.log(`  - Already existed:        ${stats.codesAlreadyExist}`);
    console.log();
    console.log(`Users with referrals found: ${stats.usersWithReferrals}`);
    console.log(`  - Referrals linked:       ${stats.referralsLinked}`);
    console.log(`  - Already linked:         ${stats.referralsAlreadyLinked}`);
    console.log(`  - Skipped (missing data): ${stats.referralsSkipped}`);
    console.log();

    if (stats.errors.length > 0) {
      console.log(`Errors: ${stats.errors.length}`);
      stats.errors.forEach((e) => console.log(`  - ${e}`));
    } else {
      console.log('Errors: 0');
    }

    console.log('='.repeat(60));
    console.log('Migration complete!');
  } catch (error) {
    console.error('Fatal error during migration:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
