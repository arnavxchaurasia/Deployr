import { NextResponse } from "next/server";

// Signup is handled directly by the api-server (port 9000).
// This route exists only as a safety net in case any client-side code
// accidentally hits the Next.js API route instead of the backend.

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const res = await fetch("http://localhost:9000/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Signup failed" },
      { status: 500 }
    );
  }
}
