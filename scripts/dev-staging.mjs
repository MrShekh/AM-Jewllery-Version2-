import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const envPath = path.resolve(process.cwd(), ".env.staging");
if (!fs.existsSync(envPath)) {
  console.error("[STAGING] Missing .env.staging. Copy .env.staging.example to .env.staging first.");
  process.exit(1);
}

const raw = fs.readFileSync(envPath, "utf8");
for (const line of raw.split(/\r?\n/)) {
  const m = /^\s*([A-Za-z0-9_]+)=(.*)$/.exec(line);
  if (!m) continue;
  const key = m[1];
  const val = m[2].trim().replace(/^"(.*)"$/, "$1");
  process.env[key] = val;
}

if (process.env.APP_ENV !== "staging" || !process.env.STAGING_DB_IDENTITY) {
  console.error("[STAGING] Refusing to start: APP_ENV must be 'staging' and STAGING_DB_IDENTITY must be set in .env.staging.");
  process.exit(1);
}

// Ensure staging never falls back to production Cloudinary keys from .env
delete process.env.CLOUDINARY_CLOUD_NAME;
delete process.env.CLOUDINARY_API_KEY;
delete process.env.CLOUDINARY_API_SECRET;

console.log(`[STAGING] Starting Next.js dev server against ${process.env.STAGING_DB_IDENTITY} (port 3001)...`);

const child = spawn("npx", ["next", "dev", "-H", "0.0.0.0", "-p", "3001"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));
