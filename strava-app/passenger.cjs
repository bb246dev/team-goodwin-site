"use strict";

function importFailureCategory(error) {
  if (error?.code === "ERR_MODULE_NOT_FOUND") return "ES module dependency missing";
  if (error?.code === "ERR_UNKNOWN_FILE_EXTENSION") return "ES module format failure";
  if (error?.name === "SyntaxError") return "ES module syntax failure";
  return "ES module import failure";
}

function report(category) {
  process.stderr.write(`[goodwin-strava passenger] ${category}\n`);
}

async function main() {
  let applicationModule;
  try {
    applicationModule = await import("./app.js");
  } catch (error) {
    report(importFailureCategory(error));
    process.exitCode = 1;
    return;
  }

  if (typeof applicationModule.startApplication !== "function") {
    report("startup function unavailable");
    process.exitCode = 1;
    return;
  }

  try {
    await applicationModule.startApplication();
  } catch {
    report("application startup failure");
    process.exitCode = 1;
  }
}

void main();
