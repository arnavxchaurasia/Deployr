import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

const handler = NextAuth({
  session: { strategy: "jwt" },


  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),

    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    Credentials({
      name: "credentials",
      credentials: {
        email: {},
        password: {},
      },

      async authorize(credentials) {
        const res = await fetch("http://localhost:9000/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentials),
        });

        if (!res.ok) return null;

        const user = await res.json();
        // must return { id, email, name }
        return user;
      },
    }),

    // SAML SSO: the /auth/saml/:orgId/acs endpoint validates the IdP's
    // assertion, then redirects the browser to /auth/sso-callback?code=...
    // That page calls signIn("sso", { code }), which lands here — this
    // provider never sees SAML itself, it just exchanges the short-lived
    // code (server-to-server, with INTERNAL_SECRET) for the user record.
    Credentials({
      id: "sso",
      name: "sso",
      credentials: { code: {} },

      async authorize(credentials) {
        const res = await fetch("http://localhost:9000/auth/sso/exchange", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": process.env.INTERNAL_SECRET || "",
          },
          body: JSON.stringify({ code: credentials?.code }),
        });

        if (!res.ok) return null;
        return res.json();
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, account }) {
      // OAuth login (Google/GitHub)
      if (account?.provider === "google" || account?.provider === "github") {
        try {
          const res = await fetch("http://localhost:9000/auth/oauth-sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: user?.email,
              name: user?.name,
              image: user?.image,
            }),
          });

          if (!res.ok) {
            console.error("OAuth Sync HTTP Error:", res.status, await res.text());
          } else {
            const dbUser = await res.json();
            token.id = dbUser.id;
          }
        } catch (err) {
          console.error("OAuth Sync Fetch Error:", err);
        }
      }

      // Credentials login
      if (user && !token.id) {
        token.id = user.id;
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },

  pages: {
    signIn: "/auth",
  },

  secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };
