import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const securityPolicyUrl = 'https://github.com/TomLeo-ai/football-lottery-analysis-lab/security/policy';
const moduleOptions = [
  'Frontend / 前端', 'Backend / 后端', 'OCR', 'Analysis engine / 分析引擎',
  'Simulated plan / 模拟方案', 'Result provider / 赛果同步', 'Review workflow / 复盘流程',
  'LLM integration / 大模型集成', 'Documentation / 文档', 'Other / 其他'
];

async function readRepositoryText(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

async function readRepositoryYaml(relativePath) {
  return YAML.parse(await readRepositoryText(relativePath));
}

function fieldById(form, id) {
  return form.body.find((field) => field.id === id);
}

function assertField(form, id, type, required) {
  const field = fieldById(form, id);
  assert.ok(field, `missing field: ${id}`);
  assert.equal(field.type, type, `unexpected type for ${id}`);
  assert.equal(field.validations?.required === true, required, `unexpected required state for ${id}`);
  return field;
}

function assertRequiredCheckboxLabels(form, id, label, labels) {
  const field = assertField(form, id, 'checkboxes', true);
  assert.deepEqual(field.attributes, { label, options: labels.map((option) => ({ label: option, required: true })) }, `${id} attributes must match the approved policy contract`);
  assert.deepEqual(field.validations, { required: true }, `${id} validations must match the approved policy contract`);
  for (const option of field.attributes.options) {
    assert.equal(option.required, true, `${id} options must all be required`);
  }
  return field;
}

function assertEnglishBeforeChinese(value, english, chinese) {
  assert.equal(typeof value, 'string', 'user-visible value must be a string');
  const englishIndex = value.indexOf(english);
  const chineseIndex = value.indexOf(chinese);
  assert.ok(englishIndex >= 0, `missing English text: ${english}`);
  assert.ok(chineseIndex > englishIndex, `Chinese text must follow English text: ${chinese}`);
}

function assertExactIntro(form, value) {
  assert.equal(form.body[0]?.type, 'markdown', 'first form item must be markdown');
  assert.equal(form.body[0]?.attributes?.value, value, 'intro Markdown must match the approved policy contract');
}

function assertUniqueIds(form) {
  const ids = form.body.map((field) => field.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, 'field IDs must be unique');
}

function assertApprovedFields(form, approvedFields) {
  for (const { id, type, attributes, validations } of approvedFields) {
    const field = fieldById(form, id);
    assert.equal(field.type, type, `unexpected type for ${id}`);
    assert.deepEqual(field.attributes, attributes, `attributes for ${id} must match the approved contract`);
    assert.deepEqual(field.validations, validations, `validations for ${id} must match the approved contract`);
  }
}

function assertBodyOrder(form, expected) {
  assert.deepEqual(form.body.map((field) => ({ id: field.id ?? null, type: field.type })), expected, 'body field order, IDs, and types must match the approved contract');
}

const bugFields = [
  { id: 'version', type: 'input', attributes: { label: 'Project version / 项目版本', description: 'Provide a Release, commit SHA, or branch / 请填写 Release、提交 SHA 或分支', placeholder: 'Example / 示例: v0.1.1 or d4d4097' }, validations: { required: true } },
  { id: 'area', type: 'dropdown', attributes: { label: 'Affected area / 影响模块', options: moduleOptions }, validations: { required: true } },
  { id: 'environment', type: 'textarea', attributes: { label: 'Environment / 运行环境', description: 'Include OS, browser, Node, Java, and relevant database configuration without secrets / 请填写操作系统、浏览器、Node、Java 和必要的数据库配置，但不要包含秘密信息' }, validations: { required: true } },
  { id: 'reproduction', type: 'textarea', attributes: { label: 'Reproduction steps / 复现步骤', description: 'Provide the smallest repeatable sequence / 请提供最小且可重复的操作步骤' }, validations: { required: true } },
  { id: 'expected', type: 'textarea', attributes: { label: 'Expected behavior / 预期行为', description: 'Describe the observable correct result / 描述可观察到的正确结果' }, validations: { required: true } },
  { id: 'actual', type: 'textarea', attributes: { label: 'Actual behavior / 实际行为', description: 'Describe what actually happened / 描述实际发生的情况' }, validations: { required: true } },
  { id: 'frequency', type: 'dropdown', attributes: { label: 'Frequency / 出现频率', options: ['Every time / 每次出现', 'Intermittent / 偶发', 'First run only / 仅首次运行', 'Unknown / 尚不确定'] }, validations: undefined },
  { id: 'logs', type: 'textarea', attributes: { label: 'Sanitized logs / 已脱敏日志', description: 'Remove credentials, cookies, private paths, and user data before pasting / 粘贴前请删除凭据、Cookie、私人路径和用户数据', render: 'shell' }, validations: undefined },
  { id: 'additional_context', type: 'textarea', attributes: { label: 'Additional context / 补充信息', description: 'Add only information that is safe to publish / 仅添加适合公开的信息' }, validations: undefined }
];
const featureFields = [
  { id: 'problem', type: 'textarea', attributes: { label: 'Problem or need / 问题或需求', description: 'Explain the current limitation / 说明当前限制' }, validations: { required: true } },
  { id: 'use_case', type: 'textarea', attributes: { label: 'Use case / 使用场景', description: 'Explain who needs the outcome and in which workflow / 说明谁在什么流程中需要该结果' }, validations: { required: true } },
  { id: 'proposed_outcome', type: 'textarea', attributes: { label: 'Proposed outcome / 期望结果', description: 'Describe the user-visible result without prescribing implementation / 描述用户可见结果，无需规定内部实现' }, validations: { required: true } },
  { id: 'acceptance_criteria', type: 'textarea', attributes: { label: 'Acceptance criteria / 验收标准', description: 'Provide runnable, observable, repeatable conditions / 提供可运行、可观察、可重复的验收条件' }, validations: { required: true } },
  { id: 'alternatives', type: 'textarea', attributes: { label: 'Alternatives considered / 已考虑的替代方案', description: 'Describe existing workarounds / 描述现有绕行方法' }, validations: undefined },
  { id: 'scope_area', type: 'dropdown', attributes: { label: 'Scope area / 所属模块', options: moduleOptions }, validations: { required: true } },
  { id: 'additional_context', type: 'textarea', attributes: { label: 'Additional context / 补充信息', description: 'Add only public, authorized references / 仅添加可公开且已获授权的参考信息' }, validations: undefined }
];
const adoptionFields = [
  { id: 'version', type: 'input', attributes: { label: 'Version used / 使用版本', description: 'Provide a Release, commit SHA, or branch / 请填写 Release、提交 SHA 或分支' }, validations: { required: true } },
  { id: 'relationship', type: 'dropdown', attributes: { label: 'Relationship to the project / 与项目的关系', options: ['Independent user / 独立用户', 'Organization user / 组织使用者', 'Integrator / 集成者', 'Contributor / 贡献者', 'Maintainer / 维护者', 'Other / 其他'] }, validations: { required: true } },
  { id: 'environment', type: 'dropdown', attributes: { label: 'Environment / 使用环境', options: ['Local use / 本地使用', 'Test environment / 测试环境', 'Learning experiment / 学习实验', 'Internal evaluation / 内部评估', 'Other / 其他'] }, validations: { required: true } },
  { id: 'use_case', type: 'textarea', attributes: { label: 'Use case / 使用场景', description: 'Describe the real purpose without private business or user data / 描述真实使用目的，但不要包含私人业务或用户数据' }, validations: { required: true } },
  { id: 'experience', type: 'textarea', attributes: { label: 'Experience and feedback / 使用体验与反馈', description: 'Explain what was useful and what needs improvement / 说明哪些部分有用、哪些部分需要改进' }, validations: { required: true } },
  { id: 'limitations', type: 'textarea', attributes: { label: 'Limitations encountered / 遇到的限制', description: 'Describe obstacles or shortcomings / 描述遇到的阻碍或不足' }, validations: undefined },
  { id: 'public_reference', type: 'input', attributes: { label: 'Optional public reference / 可选公开参考', description: 'Public repository, article, demo, or integration URL you may publish / 你有权公开的仓库、文章、演示或集成链接' }, validations: undefined },
  { id: 'additional_context', type: 'textarea', attributes: { label: 'Additional context / 补充信息', description: 'Add only information that is safe to publish / 仅添加适合公开的信息' }, validations: undefined }
];

test('Bug Issue Form matches the approved bilingual diagnostic and policy contract', async () => {
  const form = await readRepositoryYaml('.github/ISSUE_TEMPLATE/bug-report.yml');
  assert.equal(form.name, 'Bug Report / 缺陷报告');
  assert.equal(form.description, 'Report a reproducible problem with sanitized evidence / 报告可复现的问题并提供已脱敏证据');
  assert.equal(form.title, '[Bug]: ');
  assertBodyOrder(form, [{ id: null, type: 'markdown' }, ...bugFields.map(({ id, type }) => ({ id, type })), { id: 'acknowledgements', type: 'checkboxes' }]);
  assertApprovedFields(form, bugFields);
  assertExactIntro(form, `Search existing Issues first. Security vulnerabilities must follow the [Security Policy](${securityPolicyUrl}) and must not be disclosed publicly.\nDo not submit API keys, tokens, cookies, private data, real betting records, official lottery screenshots, logos, copied assets, or official datasets.\n\n请先搜索已有 Issues。安全漏洞必须按照[安全策略](${securityPolicyUrl})报告，不得公开披露。\n请勿提交 API Key、Token、Cookie、私人数据、真实投注记录、官方彩票截图、Logo、复制素材或官方数据集。\n`);
  const version = assertField(form, 'version', 'input', true);
  assert.equal(version.attributes.label, 'Project version / 项目版本');
  assertEnglishBeforeChinese(version.attributes.placeholder, 'Example', '示例');
  const area = assertField(form, 'area', 'dropdown', true);
  assert.deepEqual(area.attributes.options, moduleOptions);
  for (const id of ['environment', 'reproduction', 'expected', 'actual']) assertField(form, id, 'textarea', true);
  const frequency = assertField(form, 'frequency', 'dropdown', false);
  assert.deepEqual(frequency.attributes.options, ['Every time / 每次出现', 'Intermittent / 偶发', 'First run only / 仅首次运行', 'Unknown / 尚不确定']);
  assertField(form, 'logs', 'textarea', false);
  assert.equal(fieldById(form, 'logs').attributes.render, 'shell');
  assertField(form, 'additional_context', 'textarea', false);
  assertRequiredCheckboxLabels(form, 'acknowledgements', 'Required acknowledgements / 必须确认', [
    'I searched existing Issues and did not find the same problem. / 我已搜索现有 Issues，未发现相同问题。',
    'I removed API keys, tokens, cookies, private information, and real user data. / 我已删除 API Key、Token、Cookie、私人信息和真实用户数据。',
    'I did not attach official lottery screenshots, logos, copied assets, or official datasets. / 我未上传官方彩票截图、Logo、复制素材或官方数据集。',
    'This report contains no real purchase, payment, ticketing, betting record, profit promise, or winning guarantee. / 本报告不包含真实购买、支付、出票、投注记录、收益承诺或中奖保证。',
    'I agree to follow the Code of Conduct and Contributing guide. / 我同意遵守行为准则和贡献指南。'
  ]);
  assertUniqueIds(form);
});

test('Feature Issue Form matches the approved simulation-only policy contract', async () => {
  const form = await readRepositoryYaml('.github/ISSUE_TEMPLATE/feature-request.yml');
  assert.equal(form.name, 'Feature Request / 功能建议');
  assert.equal(form.description, 'Propose a verifiable improvement within the simulation-only boundary / 在仅模拟边界内提出可验证改进');
  assert.equal(form.title, '[Feature]: ');
  assertBodyOrder(form, [{ id: null, type: 'markdown' }, ...featureFields.map(({ id, type }) => ({ id, type })), { id: 'scope_confirmation', type: 'checkboxes' }]);
  assertApprovedFields(form, featureFields);
  assertExactIntro(form, 'Describe the user problem and observable outcome. Keep proposals within research, fictional samples, simulation, and review workflows.\nDo not request real purchase, payment, ticketing, official-data crawling, access-control bypass, profit promises, or winning guarantees.\n\n请描述用户问题和可观察结果。建议必须限定在研究、虚构样例、模拟和复盘流程内。\n不得要求真实购买、支付、出票、官方数据抓取、绕过访问控制、收益承诺或中奖保证。\n');
  for (const id of ['problem', 'use_case', 'proposed_outcome', 'acceptance_criteria']) assertField(form, id, 'textarea', true);
  assertField(form, 'alternatives', 'textarea', false);
  const scopeArea = assertField(form, 'scope_area', 'dropdown', true);
  assert.deepEqual(scopeArea.attributes.options, moduleOptions);
  assertField(form, 'additional_context', 'textarea', false);
  assertRequiredCheckboxLabels(form, 'scope_confirmation', 'Required scope confirmation / 必须确认范围', [
    'This proposal remains within analysis, research, fictional samples, simulation, or review workflows. / 本建议仍属于分析、研究、虚构样例、模拟或复盘流程。',
    'It does not request real purchase, payment, ticketing, proxy purchase, following orders, deposit, or withdrawal. / 本建议不要求真实购买、支付、出票、代购、跟单、充值或提现。',
    'It does not request crawling, access-control bypass, caching, mirroring, or republication of official lottery data. / 本建议不要求抓取、绕过访问控制、缓存、镜像或重新发布官方彩票数据。',
    'It contains no profit, certainty, recovery-of-loss, accuracy, or winning guarantee. / 本建议不包含利润、确定性、回本、准确率或中奖保证。',
    'It contains no secrets, private data, or restricted material. / 本建议不包含秘密信息、私人数据或受限制素材。',
    'I agree to follow the Code of Conduct and Contributing guide. / 我同意遵守行为准则和贡献指南。'
  ]);
  assert.equal(fieldById(form, 'conduct_confirmation'), undefined, 'Feature conduct acknowledgement belongs in scope_confirmation');
  assertUniqueIds(form);
});

test('Adoption Issue Form matches the approved privacy and optional-ledger contract', async () => {
  const form = await readRepositoryYaml('.github/ISSUE_TEMPLATE/adoption-report.yml');
  assert.equal(form.name, 'Adoption Report / 使用与采用反馈');
  assert.equal(form.description, 'Share real use and optionally permit a verified public evidence link / 分享真实使用情况，并可选择授权公开证据引用');
  assert.equal(form.title, '[Adoption]: ');
  assertBodyOrder(form, [{ id: null, type: 'markdown' }, ...adoptionFields.map(({ id, type }) => ({ id, type })), { id: 'privacy_confirmation', type: 'checkboxes' }, { id: 'evidence_consent', type: 'checkboxes' }, { id: 'conduct_confirmation', type: 'checkboxes' }]);
  assertApprovedFields(form, adoptionFields);
  assert.equal(form.labels, undefined, 'Adoption form must not depend on a repository label that may not exist');
  assertExactIntro(form, 'An Adoption Issue is feedback, not automatic proof. Maintainers verify consent, relationship, version, use case, and public references before updating the Public Evidence Ledger.\nDo not submit API keys, tokens, cookies, private data, real user screenshots, real betting records, personal financial information, or guaranteed outcomes.\n\nAdoption Issue 是使用反馈，不会自动成为采用证明。维护者必须核验授权、关系、版本、场景和公开参考，才能更新公开证据账本。\n请勿提交 API Key、Token、Cookie、私人数据、真实用户截图、真实投注记录、个人财务信息或结果保证。\n');
  assertField(form, 'version', 'input', true);
  assertField(form, 'relationship', 'dropdown', true);
  assert.deepEqual(fieldById(form, 'relationship').attributes.options, ['Independent user / 独立用户', 'Organization user / 组织使用者', 'Integrator / 集成者', 'Contributor / 贡献者', 'Maintainer / 维护者', 'Other / 其他']);
  assertField(form, 'environment', 'dropdown', true);
  assert.deepEqual(fieldById(form, 'environment').attributes.options, ['Local use / 本地使用', 'Test environment / 测试环境', 'Learning experiment / 学习实验', 'Internal evaluation / 内部评估', 'Other / 其他']);
  for (const id of ['use_case', 'experience']) assertField(form, id, 'textarea', true);
  assertField(form, 'limitations', 'textarea', false);
  assertField(form, 'public_reference', 'input', false);
  assertField(form, 'additional_context', 'textarea', false);
  assertRequiredCheckboxLabels(form, 'privacy_confirmation', 'Required privacy and evidence confirmation / 必须确认隐私与证据边界', [
    'The content contains no API key, token, cookie, private data, or real user screenshot. / 内容不包含 API Key、Token、Cookie、私人数据或真实用户截图。',
    'The content contains no real betting record, personal financial information, or gambling outcome. / 内容不包含真实投注记录、个人财务信息或博彩结果。',
    'The report makes no accuracy, profit, winning, or loss-recovery guarantee. / 本报告不声称项目能够保证准确率、利润、中奖或损失追回。',
    'I have permission to publish any supplied public reference. / 如果填写公开参考链接，我确认有权公开该链接。'
  ]);
  const consent = assertField(form, 'evidence_consent', 'checkboxes', false);
  assert.equal(consent.attributes.label, 'Optional Public Evidence Ledger consent / 可选公开证据账本授权');
  assert.equal(consent.attributes.description, 'Leaving this unchecked does not block submission. Consent permits a link only after maintainer verification and can be withdrawn. / 不勾选也可正常提交。授权只允许维护者核验后引用，且可以撤回。');
  assert.deepEqual(consent.attributes.options, [{ label: "I authorize maintainers to link this public Issue from the repository's Public Evidence Ledger after verification. / 在维护者完成核验后，我同意维护者从仓库的公开采用证据账本中引用此公开 Issue。" }]);
  assert.deepEqual(consent.attributes, {
    label: 'Optional Public Evidence Ledger consent / 可选公开证据账本授权',
    description: 'Leaving this unchecked does not block submission. Consent permits a link only after maintainer verification and can be withdrawn. / 不勾选也可正常提交。授权只允许维护者核验后引用，且可以撤回。',
    options: [{ label: "I authorize maintainers to link this public Issue from the repository's Public Evidence Ledger after verification. / 在维护者完成核验后，我同意维护者从仓库的公开采用证据账本中引用此公开 Issue。" }]
  }, 'evidence consent attributes must match the approved contract');
  assert.strictEqual(consent.validations, undefined, 'evidence consent must not declare validations');
  assertRequiredCheckboxLabels(form, 'conduct_confirmation', 'Code of Conduct / 行为准则', ['I agree to follow the Code of Conduct. / 我同意遵守行为准则。']);
  assertUniqueIds(form);
});

test('Issue chooser disables blank Issues and directs security reports privately', async () => {
  const chooser = await readRepositoryYaml('.github/ISSUE_TEMPLATE/config.yml');
  assert.equal(chooser.blank_issues_enabled, false);
  assert.deepEqual(chooser.contact_links, [{
    name: 'Security report / 安全漏洞报告',
    url: securityPolicyUrl,
    about: 'Report vulnerabilities privately through the Security Policy / 请按照安全策略私下报告漏洞'
  }]);
});
