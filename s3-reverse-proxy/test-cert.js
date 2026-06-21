const devcert = require('devcert');

async function test() {
  try {
    const ssl = await devcert.certificateFor('localhost');
    console.log("SUCCESS");
    console.log("Key length:", ssl.key.length);
    console.log("Cert length:", ssl.cert.length);
  } catch (err) {
    console.error("ERROR:", err);
  }
}
test();
