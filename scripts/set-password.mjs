// Create a user or reset their password.
// Usage: node --env-file=.env scripts/set-password.mjs <email> <password> [name]
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const [email, password, name] = process.argv.slice(2);
if (!email || !password) {
  console.error("Usage: node --env-file=.env scripts/set-password.mjs <email> <password> [name]");
  process.exit(1);
}

const client = await new MongoClient(process.env.MONGODB_URI).connect();
const users = client.db(process.env.DB_NAME || "catalog").collection("users");
const key = email.trim().toLowerCase();
const password_hash = await bcrypt.hash(password, 10);

const existing = await users.findOne({ email: key });
if (existing) {
  await users.updateOne({ _id: existing._id }, { $set: { password_hash } });
  console.log(`Password updated for ${key}`);
} else {
  await users.insertOne({ _id: randomUUID(), email: key, name: name || key.split("@")[0], role: "admin", password_hash, created_at: new Date() });
  console.log(`Created user ${key}`);
}
await client.close();
