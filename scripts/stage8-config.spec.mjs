import { existsSync, readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const workflow = readFileSync(new URL('../.github/workflows/compliance.yml', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const serverReadme = readFileSync(new URL('../apps/server/README.md', import.meta.url), 'utf8');
const databaseDoc = readFileSync(new URL('../docs/database.md', import.meta.url), 'utf8');
const aiSafetyDoc = readFileSync(new URL('../docs/ai-safety.md', import.meta.url), 'utf8');
const complianceDoc = readFileSync(new URL('../docs/compliance.md', import.meta.url), 'utf8');
const promptPolicyDoc = readFileSync(new URL('../docs/llm-prompt-policy.md', import.meta.url), 'utf8');
const serverApplicationConfig = readFileSync(
  new URL('../apps/server/src/main/resources/application.yml', import.meta.url),
  'utf8'
);
const serverEnvExampleUrl = new URL('../apps/server/.env.example', import.meta.url);

assert.ok(packageJson.scripts['smoke:stage8'], 'package.json must expose smoke:stage8');
assert.ok(packageJson.scripts['smoke:deepseek'], 'package.json must expose smoke:deepseek');
assert.ok(packageJson.scripts['test:deepseek-smoke'], 'package.json must expose test:deepseek-smoke');
assert.ok(packageJson.scripts['verify:stage8'], 'package.json must expose verify:stage8');
assert.ok(
  packageJson.scripts['verify:stage8'].includes('npm run smoke:stage8'),
  'verify:stage8 must include the Stage 8 smoke check'
);
assert.ok(workflow.includes('npm run verify:stage8'), 'CI workflow must run verify:stage8');
assert.ok(readme.includes('Stage 8'), 'README must describe Stage 8 as current release scope');
assert.ok(readme.includes('npm run verify:stage8'), 'README must document the Stage 8 verification command');
assert.ok(readme.includes('not intended for minors'), 'README must state the minors protection boundary');
assert.ok(readme.includes('H2 Embedded File database'), 'README must describe the default H2 database mode');
assert.ok(serverReadme.includes('apps/server/data/'), 'server README must document the local database file location');
assert.ok(databaseDoc.includes('H2 Console'), 'database doc must document H2 Console access');
assert.match(
  serverApplicationConfig,
  /server:\s*[\s\S]*?address:\s*127\.0\.0\.1/,
  'default server config must bind the local H2 development runtime to 127.0.0.1'
);
assert.ok(databaseDoc.includes('application-mysql.example.yml'), 'database doc must document the MySQL migration template');
assert.ok(readme.includes('/model-settings'), 'README must document the model settings page');
assert.ok(readme.includes('OPENAI_COMPATIBLE'), 'README must document the OpenAI-compatible engine mode');
assert.ok(readme.includes('DEEPSEEK_API_KEY'), 'README must document the DeepSeek API key environment variable');
assert.ok(readme.includes('deepseek-v4-pro'), 'README must document the DeepSeek target model');
assert.ok(readme.includes('npm run smoke:deepseek'), 'README must document the DeepSeek integration smoke command');
assert.ok(serverReadme.includes('GET /api/model-providers'), 'server README must document model provider APIs');
assert.ok(serverReadme.includes('OPENAI_API_KEY'), 'server README must document model provider environment variables');
assert.ok(serverReadme.includes('DEEPSEEK_API_KEY'), 'server README must document DeepSeek environment variables');
assert.ok(serverReadme.includes('deepseek-v4-pro'), 'server README must document the DeepSeek target model');
assert.ok(serverReadme.includes('npm run smoke:deepseek'), 'server README must document the DeepSeek integration smoke command');
assert.ok(serverReadme.includes('llm_invocation_audit'), 'server README must document LLM audit persistence');
assert.ok(aiSafetyDoc.includes('LlmOutputValidator'), 'AI safety doc must document structured output validation');
assert.ok(aiSafetyDoc.includes('safetyStatus=BLOCKED'), 'AI safety doc must document blocked LLM output handling');
assert.ok(aiSafetyDoc.includes('markdown fenced JSON'), 'AI safety doc must document fenced JSON normalization');
assert.ok(complianceDoc.includes('llm_invocation_audit'), 'compliance doc must document LLM audit records');
assert.ok(complianceDoc.includes('USER_SCREENSHOT_CONFIRMED'), 'compliance doc must document confirmed-snapshot boundaries');
assert.ok(complianceDoc.includes('未成年人'), 'compliance doc must document the minors protection boundary');
assert.ok(promptPolicyDoc.includes('danche-prediction-v1'), 'prompt policy must document prediction prompt version');
assert.ok(promptPolicyDoc.includes('danche-review-insight-v1'), 'prompt policy must document review prompt version');
assert.ok(promptPolicyDoc.includes('inputHash'), 'prompt policy must document hash-only prompt/output audit rules');
assert.ok(promptPolicyDoc.includes('markdown fenced JSON'), 'prompt policy must document provider fenced JSON compatibility');
assert.ok(existsSync(serverEnvExampleUrl), 'server .env.example must exist for model provider setup');
const serverEnvExample = readFileSync(serverEnvExampleUrl, 'utf8');
assert.ok(serverEnvExample.includes('OPENAI_API_KEY'), 'server .env.example must include OPENAI_API_KEY');
assert.ok(serverEnvExample.includes('DEEPSEEK_API_KEY'), 'server .env.example must include DEEPSEEK_API_KEY');
assert.ok(serverEnvExample.includes('LOCAL_OPENAI_COMPATIBLE_API_KEY'), 'server .env.example must include local provider key example');
