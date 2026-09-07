import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const source = "strava-app";
const output = "dist/goodwin-strava-api";
const entries = ["passenger.cjs", "app.js", "package.json", "package-lock.json", "README.md", "lib", "migrations", "seeds"];

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const entry of entries) cpSync(join(source, entry), join(output, entry), { recursive: true });

console.log(`Built isolated cPanel application in ${output}`);
