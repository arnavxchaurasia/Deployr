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
