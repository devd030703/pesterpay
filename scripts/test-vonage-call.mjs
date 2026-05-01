import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Vonage } from "@vonage/server-sdk";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function findRepoRoot(startDir) {
  let currentDir = startDir;

  while (true) {
    const packagePath = path.join(currentDir, "package.json");
    if (existsSync(packagePath)) {
      const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
      if (packageJson.name === "pesterpay") {
        return currentDir;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error("Could not find the PesterPay repo root from scripts/test-vonage-call.mjs.");
    }
    currentDir = parentDir;
  }
}

function parseEnvValue(rawValue) {
  let value = rawValue.trim();
  const quote = value[0];
  if ((quote === "\"" || quote === "'") && value.endsWith(quote)) {
    value = value.slice(1, -1);
  }
  return value;
}

function loadLocalEnv(repoRoot) {
  const envPath = path.join(repoRoot, ".env.local");
  if (!existsSync(envPath)) {
    return { envPath, loaded: false, keysLoaded: [] };
  }

  const keysLoaded = [];
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed
      .slice(0, separatorIndex)
      .trim()
      .replace(/^export\s+/, "");
    const value = parseEnvValue(trimmed.slice(separatorIndex + 1));
    if (process.env[key] === undefined) {
      process.env[key] = value;
      keysLoaded.push(key);
    }
  }

  return { envPath, loaded: true, keysLoaded };
}

function requireValue(name, value, envInfo) {
  if (!value) {
    const envMessage = envInfo.loaded ? `.env.local was loaded from ${envInfo.envPath}` : `.env.local was not found at ${envInfo.envPath}`;
    throw new Error(`${name} is required. ${envMessage}.`);
  }
  return value;
}

function normalizePhoneNumber(value) {
  return value?.replace(/[^\d]/g, "") ?? "";
}

function boolLabel(value) {
  return value ? "yes" : "no";
}

function printValidationSummary(summary) {
  console.log(
    JSON.stringify(
      {
        envFileFound: summary.envInfo.loaded,
        envFilePath: summary.envInfo.envPath,
        hasVonageApplicationId: boolLabel(process.env.VONAGE_APPLICATION_ID),
        hasVonagePrivateKeyPath: boolLabel(process.env.VONAGE_PRIVATE_KEY_PATH),
        hasVonageFromNumber: boolLabel(process.env.VONAGE_FROM_NUMBER),
        selectedTargetNumber: summary.to,
        normalizedTargetNumber: summary.normalizedTo,
        targetAllowlisted: summary.targetAllowlisted,
        privateKeyFileFound: summary.privateKeyFileFound,
        dryRun: summary.dryRun,
      },
      null,
      2,
    ),
  );
}

const repoRoot = findRepoRoot(scriptDir);
const envInfo = loadLocalEnv(repoRoot);
const dryRun = process.argv.includes("--dry-run") || process.env.VONAGE_DRY_RUN === "1";

const rawApplicationId = process.env.VONAGE_APPLICATION_ID;
const rawPrivateKeyPath = process.env.VONAGE_PRIVATE_KEY_PATH;
const rawFrom = process.env.VONAGE_FROM_NUMBER;
const rawTo = process.env.VONAGE_TEST_TO || process.env.DEMO_SAM_PHONE_NUMBER;
const privateKeyPath = rawPrivateKeyPath ? path.resolve(repoRoot, rawPrivateKeyPath) : undefined;
const from = normalizePhoneNumber(rawFrom);
const to = normalizePhoneNumber(rawTo);
const allowlist = [process.env.DEMO_SAM_PHONE_NUMBER, process.env.DEMO_DEV_PHONE_NUMBER]
  .filter(Boolean)
  .map(normalizePhoneNumber);
const targetAllowlisted = allowlist.includes(to);
const privateKeyFileFound = privateKeyPath ? existsSync(privateKeyPath) : false;

printValidationSummary({
  envInfo,
  to: process.env.VONAGE_TEST_TO || process.env.DEMO_SAM_PHONE_NUMBER,
  normalizedTo: to,
  targetAllowlisted,
  privateKeyFileFound,
  dryRun,
});

const applicationId = requireValue("VONAGE_APPLICATION_ID", rawApplicationId, envInfo);
requireValue("VONAGE_PRIVATE_KEY_PATH", rawPrivateKeyPath, envInfo);
requireValue("VONAGE_FROM_NUMBER", rawFrom, envInfo);
requireValue("DEMO_SAM_PHONE_NUMBER or VONAGE_TEST_TO", rawTo, envInfo);

if (!privateKeyFileFound) {
  throw new Error(`Private key not found at ${privateKeyPath}`);
}

if (!targetAllowlisted) {
  throw new Error("Refusing to call a number outside DEMO_SAM_PHONE_NUMBER or DEMO_DEV_PHONE_NUMBER.");
}

if (dryRun) {
  console.log("Dry run complete. No Vonage call was placed.");
  process.exit(0);
}

const vonage = new Vonage({
  applicationId,
  privateKey: privateKeyPath,
});

const response = await vonage.voice.createOutboundCall({
  to: [{ type: "phone", number: to }],
  from: { type: "phone", number: from },
  ncco: [
    {
      action: "talk",
      text: "PesterPay test call. Vonage Voice is connected and ready for the Dishoom demo.",
    },
  ],
});

console.log(
  JSON.stringify(
    {
      ok: true,
      provider: "vonage",
      to,
      uuid: response.uuid,
      conversationUuid: response.conversationUuid ?? response.conversation_uuid,
    },
    null,
    2,
  ),
);
