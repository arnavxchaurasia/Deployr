fetch("http://localhost:9000/auth/oauth-sync", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "test@test.com", name: "Test User" }),
})
.then(res => res.text())
.then(console.log)
.catch(console.error);
