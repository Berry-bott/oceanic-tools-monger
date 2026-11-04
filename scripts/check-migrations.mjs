import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const base = process.env.GITHUB_BASE_REF;
if (!base) {
  console.log("Migration safety check skipped: this is not a pull request.");
  process.exit(0);
}

const files = execFileSync("git", ["diff", "--name-only", `origin/${base}...HEAD`], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter((file) => /^backend\/prisma\/migrations\/.*\/migration\.sql$/.test(file));

const destructivePatterns = [
  /\bDROP\s+(TABLE|COLUMN|TYPE|SCHEMA|DATABASE)\b/i,
  /\bTRUNCATE\b/i,
  /\bALTER\s+TABLE\b[^;]*\bDROP\s+COLUMN\b/i,
];
const unsafeNotNull = /\bADD\s+COLUMN\b[^;]*\bNOT\s+NULL\b(?![^;]*\bDEFAULT\b)/i;
const flagged = [];

for (const file of files) {
  let sql;
  try {
    sql = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (destructivePatterns.some((pattern) => pattern.test(sql)) || unsafeNotNull.test(sql)) {
    flagged.push(file);
  }
}

if (flagged.length) {
  console.error("Migration contains potentially destructive DDL or a required column without a default. Split into an expand/backfill/contract rollout and obtain manual review:");
  for (const file of flagged) console.error(`- ${file}`);
  process.exit(1);
}

console.log(`Migration safety check passed (${files.length} changed migration file(s)).`);
