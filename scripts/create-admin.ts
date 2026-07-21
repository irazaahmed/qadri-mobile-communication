/**
 * scripts/create-admin.ts
 *
 * ONE-TIME MANUAL PROVISIONING TOOL — NOT part of the build/seed pipeline.
 * This is deliberately NOT registered as `prisma.seed` in package.json and is
 * NEVER auto-run. There is no seed data for this project; the single admin
 * account must be created manually by running this script once per environment.
 *
 * Usage:
 *   npx tsx scripts/create-admin.ts <email> <password> [name]
 *
 * Example:
 *   npx tsx scripts/create-admin.ts admin@qadrimobile.com "S3curePass!" "Qadri Admin"
 *
 * Behavior: hashes the password with bcryptjs and upserts a User row by email
 * (safe to re-run to rotate the password for an existing admin).
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

async function main() {
  const [email, password, name] = process.argv.slice(2);

  if (!email || !password) {
    console.error(
      "Usage: npx tsx scripts/create-admin.ts <email> <password> [name]"
    );
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("Password must be at least 8 characters long.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, ...(name ? { name } : {}) },
    create: { email, passwordHash, name: name ?? null },
  });

  console.log(`Admin user ready: ${user.email} (id: ${user.id})`);
}

main()
  .catch((err) => {
    console.error("Failed to provision admin user:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
