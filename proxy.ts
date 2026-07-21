import NextAuth from "next-auth";
import authConfig from "./auth.config";

// Edge-safe proxy: only uses `auth.config.ts` (no Prisma/bcrypt-dependent
// Credentials provider), guarding everything under /admin/*.
const { auth } = NextAuth(authConfig);

export { auth as proxy };

export const config = {
  matcher: ["/admin/:path*"],
};
