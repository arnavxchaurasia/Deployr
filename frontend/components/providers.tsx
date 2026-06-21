"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { SocketProvider } from "./socket-provider";

export function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <SocketProvider>
          {children}
          <Toaster 
            position="top-center" 
            richColors
            theme="dark" 
            toastOptions={{
              className: "border-zinc-800 bg-zinc-950 text-zinc-100 rounded-xl",
            }}
          />
        </SocketProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
