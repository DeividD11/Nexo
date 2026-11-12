import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public frontend config exposes only the Supabase URL and publishable key", async () => {
  const config = await read("src/config/appConfig.js");
  assert.match(config, /https:\/\/zyfjffvqcprfcohgdrxx\.supabase\.co\/functions\/v1\/messenger-api/);
  assert.match(config, /sb_publishable_/);
  assert.doesNotMatch(config, /sb_secret_|service_role|RESEND_API_KEY|SUPABASE_ACCESS_TOKEN/);
});

test("static HTML uses relative modules and no-referrer for token-bearing reset URLs", async () => {
  for (const file of ["index.html", "reset-password.html"]) {
    const html = await read(file);
    assert.match(html, /<meta name="referrer" content="no-referrer">/);
    assert.match(html, /src="\.\/src\//);
    assert.match(html, /connect-src https:\/\/zyfjffvqcprfcohgdrxx\.supabase\.co/);
  }
});

test("Supabase config keeps custom-session JWT verification off and Storage private", async () => {
  const config = await read("supabase/config.toml");
  assert.match(config, /\[functions\.messenger-api\][\s\S]*?verify_jwt = false/);
  assert.match(config, /\[storage\.buckets\.messenger-private\][\s\S]*?public = false/);
  assert.match(config, /file_size_limit = "10MiB"/);
  assert.match(config, /application\/pdf/);
});

test("Pages workflow publishes only static frontend assets without a Node build", async () => {
  const workflow = await read(".github/workflows/pages.yml");
  assert.match(workflow, /actions\/upload-pages-artifact@v5/);
  assert.match(workflow, /actions\/deploy-pages@v5/);
  assert.match(workflow, /cp -R public src _site\//);
  assert.doesNotMatch(workflow, /npm (?:ci|install|run build)|node server|npm start/);
  assert.doesNotMatch(workflow, /supabase\/|RESEND_API_KEY|sb_secret_/);
});

test("production secret example is separated and documented as ignored", async () => {
  const example = await read("supabase/.env.production.example");
  const ignore = await read(".gitignore");
  assert.doesNotMatch(example, /APP_ALLOWED_ORIGINS=/);
  assert.match(example, /APP_BASE_URL=/);
  assert.match(example, /RESEND_API_KEY=/);
  assert.match(ignore, /supabase\/\.env\.production/m);
  assert.doesNotMatch(example, /sb_secret_|service_role|SUPABASE_ACCESS_TOKEN/);
});
