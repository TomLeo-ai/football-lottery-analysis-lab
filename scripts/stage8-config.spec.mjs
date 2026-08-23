import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const serverReadme = readFileSync(new URL('../apps/server/README.md', import.meta.url), 'utf8');
const databaseDoc = readFileSync(new URL('../docs/database.md', import.meta.url), 'utf8');
const aiSafetyDoc = readFileSync(new URL('../docs/ai-safety.md', import.meta.url), 'utf8');
const complianceDoc = readFileSync(new URL('../docs/compliance.md', import.meta.url), 'utf8');
const promptPolicyDoc = readFileSync(new URL('../docs/llm-prompt-policy.md', import.meta.url), 'utf8');
const serverApplicationConfig = readFileSync(
  new URL('../apps/server/src/main/resources/application.yml', import.meta.url),
  'utf8',
);
const serverEnvExampleUrl = new URL('../apps/server/.env.example', import.meta.url);

assert.ok(packageJson.scripts['smoke:stage8'], 'package.json must preserve smoke:stage8');
assert.ok(packageJson.scripts['smoke:deepseek'], 'package.json must preserve smoke:deepseek');
assert.ok(packageJson.scripts['test:deepseek-smoke'], 'package.json must preserve test:deepseek-smoke');
assert.equal(
  packageJson.scripts['test:isolated-runtime'],
  'node --test scripts/lib/isolated-runtime.spec.mjs',
);
assert.equal(
  packageJson.scripts['verify:community-templates'],
  'npm run check:community-templates && npm run test:community-templates',
);
assert.equal(
  packageJson.scripts['verify:stage8'],
  'npm run verify:community-templates && npm run compliance:scan && npm run lint:web && npm run test:web && npm run build:web && npm run verify:server && npm run test:stage8-config && npm run smoke:stage8',
  'verify:stage8 must remain the immutable historical gate',
);
assert.equal(
  packageJson.scripts['verify:stage8'].split('npm run verify:community-templates').length - 1,
  1,
  'verify:stage8 must run community validation exactly once',
);

assert.ok(readme.includes('Stage 8'), 'README must retain Stage 8 history');
assert.ok(readme.includes('npm run verify:stage8'), 'README must document the historical Stage 8 command');
assert.ok(readme.includes('not intended for minors'), 'README must state the minors boundary');
assert.ok(readme.includes('H2 Embedded File database'), 'README must describe the default H2 database mode');
assert.ok(serverReadme.includes('apps/server/data/'), 'server README must document the local database location');
assert.ok(databaseDoc.includes('H2 Console'), 'database doc must document H2 Console access');
assert.match(
  serverApplicationConfig,
  /server:\s*[\s\S]*?address:\s*127\.0\.0\.1/u,
  'default server config must bind to 127.0.0.1',
);
assert.ok(databaseDoc.includes('application-mysql.example.yml'), 'database doc must retain MySQL migration guidance');
assert.ok(readme.includes('npm run smoke:deepseek'), 'README must retain optional DeepSeek smoke guidance');
assert.ok(serverReadme.includes('GET /api/model-providers'), 'server README must document model provider APIs');
assert.ok(serverReadme.includes('llm_invocation_audit'), 'server README must document LLM audit persistence');
assert.ok(aiSafetyDoc.includes('LlmOutputValidator'), 'AI safety doc must document output validation');
assert.ok(complianceDoc.includes('USER_SCREENSHOT_CONFIRMED'), 'compliance doc must document authority boundaries');
assert.ok(promptPolicyDoc.includes('inputHash'), 'prompt policy must document hash-only audit rules');
assert.ok(existsSync(serverEnvExampleUrl), 'server .env.example must exist');
const serverEnvExample = readFileSync(serverEnvExampleUrl, 'utf8');
assert.ok(serverEnvExample.includes('OPENAI_API_KEY'));
assert.ok(serverEnvExample.includes('DEEPSEEK_API_KEY'));
assert.ok(serverEnvExample.includes('LOCAL_OPENAI_COMPATIBLE_API_KEY'));

process.stdout.write('Stage 8 historical configuration check passed.\n');
