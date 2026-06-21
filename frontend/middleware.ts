import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/auth",
  },
});

// ✅ Protect ONLY dashboard tree
export const config = {
  matcher: ["/dashboard/:path*"],
};
