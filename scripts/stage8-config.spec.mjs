import { existsSync, readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { isMap, isScalar, isSeq, parseDocument, Scalar } from 'yaml';

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
assert.equal(
  packageJson.scripts['check:community-templates'],
  'node scripts/community-templates-check.mjs'
);
assert.equal(
  packageJson.scripts['test:community-templates'],
  'node --test scripts/community-templates-check.spec.mjs'
);
assert.equal(
  packageJson.scripts['verify:community-templates'],
  'npm run check:community-templates && npm run test:community-templates'
);
const expectedStage8Command =
  'npm run verify:community-templates && npm run compliance:scan && npm run lint:web && npm run test:web && npm run build:web && npm run verify:server && npm run test:stage8-config && npm run smoke:stage8';
assert.equal(
  packageJson.scripts['verify:stage8'],
  expectedStage8Command,
  'verify:stage8 must run community validation first and preserve the existing verification order'
);
assert.equal(
  packageJson.scripts['verify:stage8'].split('npm run verify:community-templates').length - 1,
  1,
  'verify:stage8 must run community template validation exactly once'
);

const normalizeWorkflowRun = (run) => run.trim().replace(/\s+/g, ' ');
const approvedWorkflowSteps = [
  { name: 'Checkout', uses: 'actions/checkout@v4' },
  {
    name: 'Setup Node.js',
    uses: 'actions/setup-node@v4',
    with: { 'node-version': 20, cache: 'npm' }
  },
  {
    name: 'Setup Java',
    uses: 'actions/setup-java@v4',
    with: { distribution: 'temurin', 'java-version': 17, cache: 'maven' }
  },
  { name: 'Install dependencies', run: 'npm ci' },
  { name: 'Install Playwright Chromium', run: 'npx playwright install --with-deps chromium' },
  {
    name: 'Run Stage 8 verification (includes community templates)',
    run: 'npm run verify:stage8'
  }
];
const approvedWorkflowRunSteps = approvedWorkflowSteps
  .filter((step) => Object.hasOwn(step, 'run'))
  .map((step) => ({ name: step.name, run: step.run }));

function assertWorkflowContract(workflowSource) {
  const workflowDocument = parseDocument(workflowSource, { keepSourceTokens: true });
  assert.equal(
    workflowDocument.errors.length,
    0,
    `CI workflow must be valid YAML: ${workflowDocument.errors.map((error) => error.message).join('; ')}`
  );
  assert.equal(
    workflowDocument.warnings.length,
    0,
    `CI workflow must not contain YAML warnings: ${workflowDocument.warnings
      .map((warning) => warning.message)
      .join('; ')}`
  );

  const verifySteps = workflowDocument.getIn(['jobs', 'verify', 'steps'], true);
  assert.ok(isSeq(verifySteps), 'CI workflow jobs.verify.steps must be a sequence');
  const workflowRunSteps = [];
  for (const [index, step] of verifySteps.items.entries()) {
    assert.ok(isMap(step), `CI workflow jobs.verify.steps step ${index + 1} must be a mapping`);
    const hasRun = step.has('run');
    const hasUses = step.has('uses');
    assert.notEqual(
      hasRun,
      hasUses,
      `CI workflow jobs.verify.steps step ${index + 1} must define exactly one of run or uses`
    );

    if (hasUses) {
      const usesNode = step.get('uses', true);
      assert.ok(
        isScalar(usesNode) &&
          typeof usesNode.value === 'string' &&
          usesNode.value.trim().length > 0,
        `CI workflow jobs.verify.steps step ${index + 1} uses must be a non-empty string scalar`
      );
      continue;
    }

    const runNode = step.get('run', true);
    assert.ok(
      isScalar(runNode) && typeof runNode.value === 'string',
      `CI workflow jobs.verify.steps step ${index + 1} run must be a string scalar`
    );
    assert.equal(
      runNode.type,
      Scalar.PLAIN,
      `CI workflow jobs.verify.steps step ${index + 1} run must use a plain scalar`
    );

    const nameNode = step.get('name', true);
    assert.ok(
      isScalar(nameNode) && typeof nameNode.value === 'string',
      `CI workflow jobs.verify.steps step ${index + 1} name must be a string scalar`
    );
    workflowRunSteps.push({
      name: nameNode.value,
      run: normalizeWorkflowRun(runNode.value)
    });
  }
  assert.deepEqual(
    verifySteps.toJSON(),
    approvedWorkflowSteps,
    'CI workflow must keep the complete approved step sequence and semantics'
  );
  assert.deepEqual(
    workflowRunSteps,
    approvedWorkflowRunSteps,
    'CI workflow must keep the complete approved run-step sequence without duplicate commands'
  );
}

assertWorkflowContract(workflow);

const approvedStage8RunLine = '        run: npm run verify:stage8';
const replaceApprovedStage8Run = (replacement) => {
  const mutatedWorkflow = workflow.replace(approvedStage8RunLine, replacement);
  assert.notEqual(mutatedWorkflow, workflow, 'the Stage 8 workflow mutation must be applied');
  return mutatedWorkflow;
};
const workflowWithComments = workflow
  .replace('name: Verify', '# Workflow comments must not affect validation.\nname: Verify')
  .replace(approvedStage8RunLine, `${approvedStage8RunLine} # approved command`);
assert.doesNotThrow(
  () => assertWorkflowContract(workflowWithComments),
  'workflow comments must not affect the structured contract'
);

const rejectedWorkflowMutations = [
  {
    name: 'literal block run',
    source: replaceApprovedStage8Run('        run: |-\n          npm run verify:stage8'),
    messagePattern: /run must use a plain scalar/
  },
  {
    name: 'folded block run',
    source: replaceApprovedStage8Run('        run: >-\n          npm run verify:stage8'),
    messagePattern: /run must use a plain scalar/
  },
  {
    name: 'unknown custom run tag',
    source: replaceApprovedStage8Run('        run: !unexpected npm run verify:stage8'),
    messagePattern: /must not contain YAML warnings/
  },
  {
    name: 'extra name-only step',
    source: `${workflow.trimEnd()}\n\n      - name: Invalid extra\n`,
    messagePattern: /must define exactly one of run or uses/
  },
  {
    name: 'extra uses-null step',
    source: `${workflow.trimEnd()}\n\n      - name: Invalid extra\n        uses: null\n`,
    messagePattern: /uses must be a non-empty string scalar/
  },
  {
    name: 'run step with uses',
    source: replaceApprovedStage8Run(
      '        run: npm run verify:stage8\n        uses: actions/checkout@v4'
    ),
    messagePattern: /must define exactly one of run or uses/
  },
  {
    name: 'step with an unknown key',
    source: workflow.replace(
      '        uses: actions/checkout@v4',
      '        uses: actions/checkout@v4\n        unexpected: value'
    ),
    messagePattern: /complete approved step sequence/
  },
  {
    name: 'extra null step',
    source: `${workflow.trimEnd()}\n\n      - null\n`,
    messagePattern: /step 7 must be a mapping/
  },
  {
    name: 'extra scalar step',
    source: `${workflow.trimEnd()}\n\n      - invalid-extra\n`,
    messagePattern: /step 7 must be a mapping/
  },
  {
    name: 'extra run-null step',
    source: `${workflow.trimEnd()}\n\n      - name: Invalid extra\n        run: null\n`,
    messagePattern: /step 7 run must be a string scalar/
  }
];
for (const mutation of rejectedWorkflowMutations) {
  assert.throws(
    () => assertWorkflowContract(mutation.source),
    mutation.messagePattern,
    `CI workflow must reject ${mutation.name}`
  );
}

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
