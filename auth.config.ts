import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config — no DB/bcrypt-dependent providers here so this
 * file can be safely imported from `proxy.ts` (route guard) without pulling
 * in the Credentials provider's Prisma/bcrypt dependency chain.
 *
 * The full config (with the Credentials provider) lives in `auth.ts`.
 */
export default {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnAdmin = nextUrl.pathname.startsWith("/admin");

      if (isOnAdmin) {
        return isLoggedIn;
      }

      return true;
    },
  },
  providers: [], // populated in auth.ts
} satisfies NextAuthConfig;
