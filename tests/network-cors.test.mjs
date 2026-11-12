import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ApiClient } from "../src/services/ApiClient.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

async function walk(directory) {
  const found = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, item.name);
    if (item.isDirectory()) found.push(...await walk(full));
    else found.push(full);
  }
  return found;
}

test("Edge Function source is complete and all relative TypeScript imports exist", async () => {
  const functionRoot = path.join(root, "supabase/functions/messenger-api");
  const files = await walk(functionRoot);
  const tsFiles = files.filter((file) => file.endsWith(".ts"));
  assert.ok(tsFiles.some((file) => file.endsWith(`${path.sep}index.ts`)));
  for (const sourceFile of tsFiles) {
    const source = await readFile(sourceFile, "utf8");
    for (const match of source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)) {
      const specifier = match[1];
      const target = path.resolve(path.dirname(sourceFile), specifier);
      await stat(target).catch(() => assert.fail(`Missing import ${specifier} from ${path.relative(root, sourceFile)}`));
    }
  }
  for (const module of ["auth", "accounts", "messaging", "groups", "files", "notifications", "settings", "search"]) {
    assert.ok(tsFiles.some((file) => file.includes(`${path.sep}${module}${path.sep}`)), `Missing module ${module}`);
  }
});

test("Edge Function answers preflight globally without cookie credentials", async () => {
  const source = await read("supabase/functions/messenger-api/index.ts");
  assert.match(source, /"Access-Control-Allow-Origin": "\*"/);
  assert.match(source, /"Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-requested-with, x-device-label"/);
  assert.match(source, /"Access-Control-Allow-Methods": "POST, OPTIONS"/);
  assert.match(source, /if \(req\.method === "OPTIONS"\) return new Response\(null, \{ status: 204, headers: CORS \}\)/);
  assert.match(source, /headers\.set\("Access-Control-Allow-Origin", "\*"\)/);
  assert.doesNotMatch(source, /Access-Control-Allow-Credentials/);
  assert.doesNotMatch(source, /ORIGIN_NOT_ALLOWED|getAllowedOrigins|configuredOrigins/);
  assert.match(source, /Bearer token opaco y lo valida en servidor/);
});

test("API client explains likely CORS/URL failures instead of claiming the network is offline", async () => {
  const source = await read("src/services/ApiClient.js");
  assert.match(source, /NETWORK_OR_CORS_ERROR/);
  assert.match(source, /globalThis\.location\?\.origin/);
  assert.match(source, /navigator\.onLine === false/);
  assert.doesNotMatch(source, /No fue posible conectar con el servidor\. Comprueba tu conexión\./);
});

test("API client distinguishes offline state from a browser fetch/CORS rejection", async () => {
  const previousFetch = globalThis.fetch;
  const previousWarn = console.warn;
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const previousLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
  console.warn = () => {};
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: true } });
  Object.defineProperty(globalThis, "location", { configurable: true, value: { origin: "https://example.github.io" } });
  const client = new ApiClient({ get: () => null });
  try {
    await assert.rejects(
      client.request("auth.login", { identifier: "user", password: "x" }, { auth: false }),
      (error) => error.code === "NETWORK_OR_CORS_ERROR" && error.message.includes("https://example.github.io"),
    );
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: false } });
    await assert.rejects(
      client.request("auth.login", { identifier: "user", password: "x" }, { auth: false }),
      (error) => error.code === "OFFLINE" && error.message.includes("Internet"),
    );
  } finally {
    globalThis.fetch = previousFetch;
    console.warn = previousWarn;
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else delete globalThis.navigator;
    if (previousLocation) Object.defineProperty(globalThis, "location", previousLocation);
    else delete globalThis.location;
  }
});
