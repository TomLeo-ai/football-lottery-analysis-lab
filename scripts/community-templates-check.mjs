import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import YAML from 'yaml';

export const COMMUNITY_TEMPLATE_FILES = [
  '.github/ISSUE_TEMPLATE/bug-report.yml',
  '.github/ISSUE_TEMPLATE/feature-request.yml',
  '.github/ISSUE_TEMPLATE/adoption-report.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/pull_request_template.md'
];

const SECURITY_URL = 'https://github.com/TomLeo-ai/football-lottery-analysis-lab/security/policy';
const ALLOWED_TYPES = new Set(['markdown', 'input', 'textarea', 'dropdown', 'checkboxes']);
const DANGEROUS_ID = /(api[_-]?key|token|password|cookie|betting[_-]?record)/i;
const MODULE_OPTIONS = [
  'Frontend / 前端',
  'Backend / 后端',
  'OCR',
  'Analysis engine / 分析引擎',
  'Simulated plan / 模拟方案',
  'Result provider / 赛果同步',
  'Review workflow / 复盘流程',
  'LLM integration / 大模型集成',
  'Documentation / 文档',
  'Other / 其他'
];
const ISSUE_FORM_TOP_LEVEL_KEYS = {
  '.github/ISSUE_TEMPLATE/bug-report.yml': new Set(['name', 'description', 'title', 'labels', 'body']),
  '.github/ISSUE_TEMPLATE/feature-request.yml': new Set(['name', 'description', 'title', 'labels', 'body']),
  '.github/ISSUE_TEMPLATE/adoption-report.yml': new Set(['name', 'description', 'title', 'body'])
};
const CHOOSER_TOP_LEVEL_KEYS = new Set(['blank_issues_enabled', 'contact_links']);

const BUG_ACKNOWLEDGEMENTS = [
  'I searched existing Issues and did not find the same problem. / 我已搜索现有 Issues，未发现相同问题。',
  'I removed API keys, tokens, cookies, private information, and real user data. / 我已删除 API Key、Token、Cookie、私人信息和真实用户数据。',
  'I did not attach official lottery screenshots, logos, copied assets, or official datasets. / 我未上传官方彩票截图、Logo、复制素材或官方数据集。',
  'This report contains no real purchase, payment, ticketing, betting record, profit promise, or winning guarantee. / 本报告不包含真实购买、支付、出票、投注记录、收益承诺或中奖保证。',
  'I agree to follow the Code of Conduct and Contributing guide. / 我同意遵守行为准则和贡献指南。'
];
const FEATURE_CONFIRMATIONS = [
  'This proposal remains within analysis, research, fictional samples, simulation, or review workflows. / 本建议仍属于分析、研究、虚构样例、模拟或复盘流程。',
  'It does not request real purchase, payment, ticketing, proxy purchase, following orders, deposit, or withdrawal. / 本建议不要求真实购买、支付、出票、代购、跟单、充值或提现。',
  'It does not request crawling, access-control bypass, caching, mirroring, or republication of official lottery data. / 本建议不要求抓取、绕过访问控制、缓存、镜像或重新发布官方彩票数据。',
  'It contains no profit, certainty, recovery-of-loss, accuracy, or winning guarantee. / 本建议不包含利润、确定性、回本、准确率或中奖保证。',
  'It contains no secrets, private data, or restricted material. / 本建议不包含秘密信息、私人数据或受限制素材。',
  'I agree to follow the Code of Conduct and Contributing guide. / 我同意遵守行为准则和贡献指南。'
];
const ADOPTION_PRIVACY_CONFIRMATIONS = [
  'The content contains no API key, token, cookie, private data, or real user screenshot. / 内容不包含 API Key、Token、Cookie、私人数据或真实用户截图。',
  'The content contains no real betting record, personal financial information, or gambling outcome. / 内容不包含真实投注记录、个人财务信息或博彩结果。',
  'The report makes no accuracy, profit, winning, or loss-recovery guarantee. / 本报告不声称项目能够保证准确率、利润、中奖或损失追回。',
  'I have permission to publish any supplied public reference. / 如果填写公开参考链接，我确认有权公开该链接。'
];
const ADOPTION_CONDUCT_CONFIRMATIONS = [
  'I agree to follow the Code of Conduct. / 我同意遵守行为准则。'
];
const EVIDENCE_CONSENT_ATTRIBUTES = {
  label: 'Optional Public Evidence Ledger consent / 可选公开证据账本授权',
  description: 'Leaving this unchecked does not block submission. Consent permits a link only after maintainer verification and can be withdrawn. / 不勾选也可正常提交。授权只允许维护者核验后引用，且可以撤回。',
  options: [
    {
      label: "I authorize maintainers to link this public Issue from the repository's Public Evidence Ledger after verification. / 在维护者完成核验后，我同意维护者从仓库的公开采用证据账本中引用此公开 Issue。"
    }
  ]
};

function requiredField(id, type, attributes) {
  return { type, id, attributes, validations: { required: true } };
}

function optionalField(id, type, attributes) {
  return { type, id, attributes };
}

const FORM_RULES = {
  '.github/ISSUE_TEMPLATE/bug-report.yml': {
    name: 'Bug Report / 缺陷报告',
    description: 'Report a reproducible problem with sanitized evidence / 报告可复现的问题并提供已脱敏证据',
    title: '[Bug]: ',
    labels: ['bug'],
    intro: `Search existing Issues first. Security vulnerabilities must follow the [Security Policy](${SECURITY_URL}) and must not be disclosed publicly.\nDo not submit API keys, tokens, cookies, private data, real betting records, official lottery screenshots, logos, copied assets, or official datasets.\n\n请先搜索已有 Issues。安全漏洞必须按照[安全策略](${SECURITY_URL})报告，不得公开披露。\n请勿提交 API Key、Token、Cookie、私人数据、真实投注记录、官方彩票截图、Logo、复制素材或官方数据集。\n`,
    fields: [
      requiredField('version', 'input', {
        label: 'Project version / 项目版本',
        description: 'Provide a Release, commit SHA, or branch / 请填写 Release、提交 SHA 或分支',
        placeholder: 'Example / 示例: v0.1.1 or d4d4097'
      }),
      requiredField('area', 'dropdown', {
        label: 'Affected area / 影响模块',
        options: MODULE_OPTIONS
      }),
      requiredField('environment', 'textarea', {
        label: 'Environment / 运行环境',
        description: 'Include OS, browser, Node, Java, and relevant database configuration without secrets / 请填写操作系统、浏览器、Node、Java 和必要的数据库配置，但不要包含秘密信息'
      }),
      requiredField('reproduction', 'textarea', {
        label: 'Reproduction steps / 复现步骤',
        description: 'Provide the smallest repeatable sequence / 请提供最小且可重复的操作步骤'
      }),
      requiredField('expected', 'textarea', {
        label: 'Expected behavior / 预期行为',
        description: 'Describe the observable correct result / 描述可观察到的正确结果'
      }),
      requiredField('actual', 'textarea', {
        label: 'Actual behavior / 实际行为',
        description: 'Describe what actually happened / 描述实际发生的情况'
      }),
      optionalField('frequency', 'dropdown', {
        label: 'Frequency / 出现频率',
        options: ['Every time / 每次出现', 'Intermittent / 偶发', 'First run only / 仅首次运行', 'Unknown / 尚不确定']
      }),
      optionalField('logs', 'textarea', {
        label: 'Sanitized logs / 已脱敏日志',
        description: 'Remove credentials, cookies, private paths, and user data before pasting / 粘贴前请删除凭据、Cookie、私人路径和用户数据',
        render: 'shell'
      }),
      optionalField('additional_context', 'textarea', {
        label: 'Additional context / 补充信息',
        description: 'Add only information that is safe to publish / 仅添加适合公开的信息'
      })
    ],
    checkboxGroups: [
      ['acknowledgements', 'Required acknowledgements / 必须确认', BUG_ACKNOWLEDGEMENTS]
    ]
  },
  '.github/ISSUE_TEMPLATE/feature-request.yml': {
    name: 'Feature Request / 功能建议',
    description: 'Propose a verifiable improvement within the simulation-only boundary / 在仅模拟边界内提出可验证改进',
    title: '[Feature]: ',
    labels: ['enhancement'],
    intro: 'Describe the user problem and observable outcome. Keep proposals within research, fictional samples, simulation, and review workflows.\nDo not request real purchase, payment, ticketing, official-data crawling, access-control bypass, profit promises, or winning guarantees.\n\n请描述用户问题和可观察结果。建议必须限定在研究、虚构样例、模拟和复盘流程内。\n不得要求真实购买、支付、出票、官方数据抓取、绕过访问控制、收益承诺或中奖保证。\n',
    fields: [
      requiredField('problem', 'textarea', {
        label: 'Problem or need / 问题或需求',
        description: 'Explain the current limitation / 说明当前限制'
      }),
      requiredField('use_case', 'textarea', {
        label: 'Use case / 使用场景',
        description: 'Explain who needs the outcome and in which workflow / 说明谁在什么流程中需要该结果'
      }),
      requiredField('proposed_outcome', 'textarea', {
        label: 'Proposed outcome / 期望结果',
        description: 'Describe the user-visible result without prescribing implementation / 描述用户可见结果，无需规定内部实现'
      }),
      requiredField('acceptance_criteria', 'textarea', {
        label: 'Acceptance criteria / 验收标准',
        description: 'Provide runnable, observable, repeatable conditions / 提供可运行、可观察、可重复的验收条件'
      }),
      optionalField('alternatives', 'textarea', {
        label: 'Alternatives considered / 已考虑的替代方案',
        description: 'Describe existing workarounds / 描述现有绕行方法'
      }),
      requiredField('scope_area', 'dropdown', {
        label: 'Scope area / 所属模块',
        options: MODULE_OPTIONS
      }),
      optionalField('additional_context', 'textarea', {
        label: 'Additional context / 补充信息',
        description: 'Add only public, authorized references / 仅添加可公开且已获授权的参考信息'
      })
    ],
    checkboxGroups: [
      ['scope_confirmation', 'Required scope confirmation / 必须确认范围', FEATURE_CONFIRMATIONS]
    ]
  },
  '.github/ISSUE_TEMPLATE/adoption-report.yml': {
    name: 'Adoption Report / 使用与采用反馈',
    description: 'Share real use and optionally permit a verified public evidence link / 分享真实使用情况，并可选择授权公开证据引用',
    title: '[Adoption]: ',
    labels: undefined,
    intro: 'An Adoption Issue is feedback, not automatic proof. Maintainers verify consent, relationship, version, use case, and public references before updating the Public Evidence Ledger.\nDo not submit API keys, tokens, cookies, private data, real user screenshots, real betting records, personal financial information, or guaranteed outcomes.\n\nAdoption Issue 是使用反馈，不会自动成为采用证明。维护者必须核验授权、关系、版本、场景和公开参考，才能更新公开证据账本。\n请勿提交 API Key、Token、Cookie、私人数据、真实用户截图、真实投注记录、个人财务信息或结果保证。\n',
    fields: [
      requiredField('version', 'input', {
        label: 'Version used / 使用版本',
        description: 'Provide a Release, commit SHA, or branch / 请填写 Release、提交 SHA 或分支'
      }),
      requiredField('relationship', 'dropdown', {
        label: 'Relationship to the project / 与项目的关系',
        options: ['Independent user / 独立用户', 'Organization user / 组织使用者', 'Integrator / 集成者', 'Contributor / 贡献者', 'Maintainer / 维护者', 'Other / 其他']
      }),
      requiredField('environment', 'dropdown', {
        label: 'Environment / 使用环境',
        options: ['Local use / 本地使用', 'Test environment / 测试环境', 'Learning experiment / 学习实验', 'Internal evaluation / 内部评估', 'Other / 其他']
      }),
      requiredField('use_case', 'textarea', {
        label: 'Use case / 使用场景',
        description: 'Describe the real purpose without private business or user data / 描述真实使用目的，但不要包含私人业务或用户数据'
      }),
      requiredField('experience', 'textarea', {
        label: 'Experience and feedback / 使用体验与反馈',
        description: 'Explain what was useful and what needs improvement / 说明哪些部分有用、哪些部分需要改进'
      }),
      optionalField('limitations', 'textarea', {
        label: 'Limitations encountered / 遇到的限制',
        description: 'Describe obstacles or shortcomings / 描述遇到的阻碍或不足'
      }),
      optionalField('public_reference', 'input', {
        label: 'Optional public reference / 可选公开参考',
        description: 'Public repository, article, demo, or integration URL you may publish / 你有权公开的仓库、文章、演示或集成链接'
      }),
      optionalField('additional_context', 'textarea', {
        label: 'Additional context / 补充信息',
        description: 'Add only information that is safe to publish / 仅添加适合公开的信息'
      })
    ],
    checkboxGroups: [
      ['privacy_confirmation', 'Required privacy and evidence confirmation / 必须确认隐私与证据边界', ADOPTION_PRIVACY_CONFIRMATIONS],
      ['conduct_confirmation', 'Code of Conduct / 行为准则', ADOPTION_CONDUCT_CONFIRMATIONS]
    ],
    optionalConsentField: 'evidence_consent'
  }
};

const PR_HEADINGS = [
  '## Summary / 变更摘要',
  '## Related Issue / 关联 Issue',
  '## Changes / 主要改动',
  '## Verification / 验证证据',
  '## Compliance and Data Safety / 合规与数据安全',
  '## AI Assistance Disclosure / AI 辅助披露',
  '## Release Impact / 发布影响',
  '## Reviewer Notes / 审阅说明'
];

const PR_SECTION_LINES = {
  '## Related Issue / 关联 Issue': [
    '<!-- Use `Closes #123` or `Refs #123`. Explain why no Issue exists when applicable. / 使用关联语法；如无 Issue，请说明原因。 -->'
  ],
  '## Verification / 验证证据': [
    '<!-- Record complete commands, observed results, test counts, and anything not verified. / 记录完整命令、实际结果、测试数量和未验证项目。 -->',
    'npm.cmd run verify:stage8',
    '- [ ] Full verification completed successfully. / 完整验证执行成功。',
    '- [ ] Test counts and failures are recorded above. / 已记录测试数量和失败情况。',
    '- [ ] Unverified behavior is explicitly listed. / 已明确列出未验证行为。'
  ],
  '## Compliance and Data Safety / 合规与数据安全': [
    '- [ ] This change remains non-official and simulation-only. / 本次变更继续保持非官方、仅模拟边界。',
    '- [ ] It does not add real purchase, payment, ticketing, proxy purchase, following orders, deposit, or withdrawal. / 本次变更不增加真实购买、支付、出票、代购、跟单、充值或提现能力。',
    '- [ ] It does not crawl, bypass controls, cache, mirror, or republish official lottery data. / 本次变更不抓取、绕过控制、缓存、镜像或重新发布官方彩票数据。',
    '- [ ] It contains no API keys, tokens, cookies, private data, real user screenshots, or restricted assets. / 本次变更不包含 API Key、Token、Cookie、私人数据、真实用户截图或受限制素材。',
    '- [ ] Fictional examples remain labeled `DEMO DATA / FICTIONAL SAMPLE`. / 虚构示例继续保留明确标记。',
    '- [ ] It makes no profit, certainty, recovery-of-loss, accuracy, or winning guarantee. / 本次变更不作出利润、确定性、回本、准确率或中奖保证。'
  ],
  '## AI Assistance Disclosure / AI 辅助披露': [
    'Select every applicable option and describe each tool and its scope. Select No AI assistance only when no AI tool was used. / 请选择所有适用项，并说明每个工具及其辅助范围。仅在完全未使用 AI 工具时勾选“未使用 AI 辅助”。',
    '- [ ] No AI assistance / 未使用 AI 辅助',
    '- [ ] Codex or OpenAI assistance / 使用 Codex 或 OpenAI 辅助',
    '- [ ] Other AI assistance / 使用其他 AI 辅助',
    'Assistance scope / 辅助范围：',
    '<!-- List each tool and its scope: exploration, code, tests, documentation, review, or other. AI output is advisory and does not replace human approval. / 请列出每个工具及其辅助范围：探索、代码、测试、文档、审阅或其他。AI 输出仅供参考，不能替代人工批准。 -->',
    'Maintainer-authored PRs are not external contribution or adoption evidence. / 维护者提交的 PR 不属于外部贡献或采用证据。'
  ],
  '## Release Impact / 发布影响': [
    'Select one. / 请选择一项。',
    '- [ ] No Release / 不发布版本',
    '- [ ] Patch Release / 补丁版本',
    '- [ ] Minor Release / 次版本',
    'Compatibility, upgrade notes, and known limitations / 兼容性、升级说明和已知限制：'
  ],
  '## Reviewer Notes / 审阅说明': [
    '<!-- Only the maintainer or actual reviewer should check these after completing review. These checkboxes do not replace GitHub review or branch protection. / 仅由维护者或实际审阅者在完成审阅后勾选。以下复选框不能替代 GitHub 审阅或分支保护。 -->',
    '- [ ] Human review covered the focused diff and verification evidence. / 人工审阅已覆盖聚焦差异和验证证据。',
    '- [ ] Human review covered compliance, privacy, and data boundaries. / 人工审阅已覆盖合规、隐私和数据边界。',
    '- [ ] AI-generated review did not replace maintainer approval. / AI 生成的审阅未替代维护者批准。'
  ]
};

const APPROVED_PR_TEMPLATE = [
  '## Summary / 变更摘要',
  '',
  '<!-- Describe the problem and user-observable outcome. / 描述问题和用户可观察到的结果。 -->',
  '',
  '## Related Issue / 关联 Issue',
  '',
  '<!-- Use `Closes #123` or `Refs #123`. Explain why no Issue exists when applicable. / 使用关联语法；如无 Issue，请说明原因。 -->',
  '',
  '## Changes / 主要改动',
  '',
  '-',
  '',
  '## Verification / 验证证据',
  '',
  '<!-- Record complete commands, observed results, test counts, and anything not verified. / 记录完整命令、实际结果、测试数量和未验证项目。 -->',
  '',
  '```powershell',
  'npm.cmd run verify:stage8',
  '```',
  '',
  '- [ ] Full verification completed successfully. / 完整验证执行成功。',
  '- [ ] Test counts and failures are recorded above. / 已记录测试数量和失败情况。',
  '- [ ] Unverified behavior is explicitly listed. / 已明确列出未验证行为。',
  '',
  '## Compliance and Data Safety / 合规与数据安全',
  '',
  '- [ ] This change remains non-official and simulation-only. / 本次变更继续保持非官方、仅模拟边界。',
  '- [ ] It does not add real purchase, payment, ticketing, proxy purchase, following orders, deposit, or withdrawal. / 本次变更不增加真实购买、支付、出票、代购、跟单、充值或提现能力。',
  '- [ ] It does not crawl, bypass controls, cache, mirror, or republish official lottery data. / 本次变更不抓取、绕过控制、缓存、镜像或重新发布官方彩票数据。',
  '- [ ] It contains no API keys, tokens, cookies, private data, real user screenshots, or restricted assets. / 本次变更不包含 API Key、Token、Cookie、私人数据、真实用户截图或受限制素材。',
  '- [ ] Fictional examples remain labeled `DEMO DATA / FICTIONAL SAMPLE`. / 虚构示例继续保留明确标记。',
  '- [ ] It makes no profit, certainty, recovery-of-loss, accuracy, or winning guarantee. / 本次变更不作出利润、确定性、回本、准确率或中奖保证。',
  '',
  '## AI Assistance Disclosure / AI 辅助披露',
  '',
  'Select every applicable option and describe each tool and its scope. Select No AI assistance only when no AI tool was used. / 请选择所有适用项，并说明每个工具及其辅助范围。仅在完全未使用 AI 工具时勾选“未使用 AI 辅助”。',
  '',
  '- [ ] No AI assistance / 未使用 AI 辅助',
  '- [ ] Codex or OpenAI assistance / 使用 Codex 或 OpenAI 辅助',
  '- [ ] Other AI assistance / 使用其他 AI 辅助',
  '',
  'Assistance scope / 辅助范围：',
  '',
  '<!-- List each tool and its scope: exploration, code, tests, documentation, review, or other. AI output is advisory and does not replace human approval. / 请列出每个工具及其辅助范围：探索、代码、测试、文档、审阅或其他。AI 输出仅供参考，不能替代人工批准。 -->',
  '',
  'Maintainer-authored PRs are not external contribution or adoption evidence. / 维护者提交的 PR 不属于外部贡献或采用证据。',
  '',
  '## Release Impact / 发布影响',
  '',
  'Select one. / 请选择一项。',
  '',
  '- [ ] No Release / 不发布版本',
  '- [ ] Patch Release / 补丁版本',
  '- [ ] Minor Release / 次版本',
  '',
  'Compatibility, upgrade notes, and known limitations / 兼容性、升级说明和已知限制：',
  '',
  '## Reviewer Notes / 审阅说明',
  '',
  '<!-- Only the maintainer or actual reviewer should check these after completing review. These checkboxes do not replace GitHub review or branch protection. / 仅由维护者或实际审阅者在完成审阅后勾选。以下复选框不能替代 GitHub 审阅或分支保护。 -->',
  '',
  '- [ ] Human review covered the focused diff and verification evidence. / 人工审阅已覆盖聚焦差异和验证证据。',
  '- [ ] Human review covered compliance, privacy, and data boundaries. / 人工审阅已覆盖合规、隐私和数据边界。',
  '- [ ] AI-generated review did not replace maintainer approval. / AI 生成的审阅未替代维护者批准。'
].join('\n') + '\n';

function problem(file, message) {
  return { file, message };
}

function isMapping(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isBilingual(value) {
  if (value === 'OCR') return true;
  if (typeof value !== 'string') return false;
  const separator = value.indexOf('/');
  const english = value.search(/[A-Za-z]/);
  const chinese = value.search(/[\u3400-\u9fff]/);
  return english >= 0 && separator > english && chinese > separator;
}

function validateVisibleText(value, location, file, errors) {
  if (!isBilingual(value)) {
    errors.push(problem(file, `${location} must contain English first and Chinese second`));
  }
}

function reportUnapprovedKeys(value, approvedKeys, location, file, errors) {
  if (!isMapping(value)) return 0;
  let count = 0;
  for (const key of Object.keys(value)) {
    if (!approvedKeys.has(key)) {
      errors.push(problem(file, `${location} contains unapproved key "${key}"`));
      count += 1;
    }
  }
  return count;
}

function validateBodyItemShape(field, index, file, errors) {
  if (!isMapping(field)) {
    errors.push(problem(file, `body item ${index} must be a mapping`));
    return false;
  }
  if (!ALLOWED_TYPES.has(field.type)) {
    errors.push(problem(file, `unsupported field type "${String(field.type)}" at body item ${index}`));
  }
  if (!isMapping(field.attributes)) {
    errors.push(problem(file, `body item ${index} attributes must be a mapping`));
  }
  if (field.validations !== undefined && !isMapping(field.validations)) {
    errors.push(problem(file, `body item ${index} validations must be a mapping when present`));
  } else if (field.validations?.required !== undefined && typeof field.validations.required !== 'boolean') {
    errors.push(problem(file, `body item ${index} validations.required must be a boolean`));
  }
  return true;
}

function validateFieldShape(field, file, errors) {
  if (!isMapping(field.attributes)) return;
  validateVisibleText(field.attributes.label, `field "${field.id}" label`, file, errors);
  for (const key of ['description', 'placeholder']) {
    if (field.attributes[key] !== undefined) {
      validateVisibleText(field.attributes[key], `field "${field.id}" ${key}`, file, errors);
    }
  }
  if (field.type === 'dropdown') {
    const options = field.attributes.options;
    if (!Array.isArray(options)) {
      errors.push(problem(file, `field "${field.id}" options must be an array`));
    } else if (options.length === 0) {
      errors.push(problem(file, `field "${field.id}" options must not be empty`));
    } else {
      options.forEach((option, index) => validateVisibleText(option, `field "${field.id}" option ${index}`, file, errors));
    }
  }
  if (field.type === 'checkboxes') {
    const options = field.attributes.options;
    if (!Array.isArray(options)) {
      errors.push(problem(file, `field "${field.id}" options must be an array`));
    } else if (options.length === 0) {
      errors.push(problem(file, `field "${field.id}" options must not be empty`));
    } else {
      options.forEach((option, index) => {
        if (!isMapping(option)) {
          errors.push(problem(file, `field "${field.id}" option ${index} must be a mapping`));
          return;
        }
        validateVisibleText(option.label, `field "${field.id}" option ${index} label`, file, errors);
        if (option.required !== undefined && typeof option.required !== 'boolean') {
          errors.push(problem(file, `field "${field.id}" option ${index} required must be a boolean`));
        }
      });
    }
  }
}

function validateExpectedField(field, expected, file, errors) {
  const { id, type, attributes, validations } = expected;
  const required = validations?.required === true;
  if (!field) {
    errors.push(problem(file, `missing ${required ? 'required' : 'optional'} field "${id}"`));
    return;
  }
  if (field.type !== type) {
    errors.push(problem(file, `field "${id}" must have type "${type}"`));
  }
  if (required) {
    if (field.validations === undefined || (isMapping(field.validations) && !isDeepStrictEqual(field.validations, validations))) {
      errors.push(problem(file, `field "${id}" must be required with validations.required true`));
    }
  } else if (field.validations !== undefined) {
    errors.push(problem(file, `field "${id}" must remain optional and omit validations`));
  }
  if (isMapping(field.attributes) && !isDeepStrictEqual(field.attributes, attributes)) {
    errors.push(problem(file, `field "${id}" must match the complete approved attributes contract`));
  }
  const approvedKeys = new Set(Object.keys(expected));
  for (const key of Object.keys(field)) {
    if (!approvedKeys.has(key)) {
      errors.push(problem(file, `field "${id}" contains unapproved key "${key}"`));
    }
  }
}

function validateCheckboxGroup(field, id, label, labels, file, errors) {
  if (!field) {
    errors.push(problem(file, `${id}: missing required checkbox group`));
    return;
  }
  const options = field?.attributes?.options;
  const requiredContractMismatch =
    field?.type !== 'checkboxes' ||
    !Array.isArray(options) ||
    options.length === 0 ||
    !isDeepStrictEqual(field.validations, { required: true }) ||
    options.some((option) => !isMapping(option) || option.required !== true);
  if (requiredContractMismatch) {
    errors.push(problem(file, `${id} must be a required checkbox group with every option required`));
  }
  const approvedAttributes = {
    label,
    options: labels.map((optionLabel) => ({ label: optionLabel, required: true }))
  };
  let extensionErrors = reportUnapprovedKeys(
    field,
    new Set(['type', 'id', 'attributes', 'validations']),
    id,
    file,
    errors
  );
  extensionErrors += reportUnapprovedKeys(
    field.attributes,
    new Set(['label', 'options']),
    `${id} attributes`,
    file,
    errors
  );
  if (Array.isArray(options)) {
    options.forEach((option, index) => {
      extensionErrors += reportUnapprovedKeys(
        option,
        new Set(['label', 'required']),
        `${id} option ${index}`,
        file,
        errors
      );
    });
  }
  const attributesMismatch = !isDeepStrictEqual(field?.attributes, approvedAttributes);
  if (attributesMismatch) {
    errors.push(problem(file, `${id} must preserve the complete approved policy options`));
  }
  const expected = { type: 'checkboxes', id, attributes: approvedAttributes, validations: { required: true } };
  const fieldContractMismatch = !isDeepStrictEqual(field, expected);
  if (!requiredContractMismatch && !attributesMismatch && extensionErrors === 0 && fieldContractMismatch) {
    errors.push(problem(file, `${id} must match the complete approved field contract`));
  }
}

export function validateIssueForm(form, source, file) {
  const errors = [];
  if (!Object.hasOwn(FORM_RULES, file) || !Object.hasOwn(ISSUE_FORM_TOP_LEVEL_KEYS, file)) {
    return [problem(file, 'no approved Issue Form rules are configured')];
  }
  const rules = FORM_RULES[file];
  const approvedTopLevelKeys = ISSUE_FORM_TOP_LEVEL_KEYS[file];
  if (!isMapping(form)) {
    return [problem(file, 'form root must be a mapping')];
  }
  for (const key of Object.keys(form)) {
    if (!approvedTopLevelKeys.has(key)) {
      errors.push(problem(file, `unapproved top-level key "${key}"`));
    }
  }

  for (const key of ['name', 'description', 'title']) {
    if (typeof form[key] !== 'string' || form[key].trim() === '') {
      errors.push(problem(file, `top-level "${key}" must be a non-empty string`));
    } else if (form[key] !== rules[key]) {
      errors.push(problem(file, `top-level "${key}" must match the approved contract`));
    }
  }
  validateVisibleText(form.name, 'top-level "name"', file, errors);
  validateVisibleText(form.description, 'top-level "description"', file, errors);
  if (approvedTopLevelKeys.has('labels') && !isDeepStrictEqual(form.labels, rules.labels)) {
    errors.push(problem(file, 'top-level "labels" must match the approved contract'));
  }
  if (!Array.isArray(form.body)) {
    errors.push(problem(file, 'top-level "body" must be an array'));
    return errors;
  }

  const fields = new Map();
  form.body.forEach((field, index) => {
    if (!validateBodyItemShape(field, index, file, errors)) return;
    if (field.type === 'markdown') {
      if (field.id !== undefined) errors.push(problem(file, `Markdown body item ${index} must not declare an id`));
      if (typeof field.attributes?.value !== 'string') {
        errors.push(problem(file, `Markdown body item ${index} value must be a string`));
      }
      return;
    }
    if (typeof field.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(field.id)) {
      errors.push(problem(file, `non-Markdown body item ${index} requires a valid id`));
      return;
    }
    if (fields.has(field.id)) {
      errors.push(problem(file, `duplicate field id "${field.id}"`));
    } else {
      fields.set(field.id, field);
    }
    if (DANGEROUS_ID.test(field.id)) {
      errors.push(problem(file, `dangerous field id "${field.id}" must not solicit restricted data`));
    }
    validateFieldShape(field, file, errors);
  });

  const markdownItems = form.body.filter((field) => isMapping(field) && field.type === 'markdown');
  if (markdownItems.length !== 1 || form.body[0] !== markdownItems[0]) {
    errors.push(problem(file, 'form must begin with exactly one Markdown policy introduction'));
  } else {
    const markdown = markdownItems[0];
    const approvedMarkdown = { type: 'markdown', attributes: { value: rules.intro } };
    let extensionErrors = reportUnapprovedKeys(
      markdown,
      new Set(['type', 'attributes']),
      'Markdown policy introduction',
      file,
      errors
    );
    extensionErrors += reportUnapprovedKeys(
      markdown.attributes,
      new Set(['value']),
      'Markdown policy introduction attributes',
      file,
      errors
    );
    const valueMismatch = markdown?.attributes?.value !== rules.intro;
    const fieldContractMismatch = !isDeepStrictEqual(markdown, approvedMarkdown);
    if (valueMismatch) {
      errors.push(problem(file, 'Markdown policy introduction must match the complete approved safety guidance'));
    }
    if (!valueMismatch && extensionErrors === 0 && fieldContractMismatch) {
      errors.push(problem(file, 'Markdown policy introduction must match the complete approved field contract'));
    }
  }

  const expectedIds = new Set([
    ...rules.fields.map(({ id }) => id),
    ...rules.checkboxGroups.map(([id]) => id),
    ...(rules.optionalConsentField ? [rules.optionalConsentField] : [])
  ]);
  for (const id of fields.keys()) {
    if (!expectedIds.has(id)) errors.push(problem(file, `unexpected field id "${id}"`));
  }
  for (const expected of rules.fields) {
    validateExpectedField(fields.get(expected.id), expected, file, errors);
  }
  for (const [id, label, labels] of rules.checkboxGroups) {
    validateCheckboxGroup(fields.get(id), id, label, labels, file, errors);
  }

  if (rules.optionalConsentField) {
    const consent = fields.get(rules.optionalConsentField);
    if (!consent) {
      errors.push(problem(file, 'missing optional evidence consent field'));
    } else {
      const consentOptions = consent.attributes?.options;
      let extensionErrors = reportUnapprovedKeys(
        consent,
        new Set(['type', 'id', 'attributes']),
        rules.optionalConsentField,
        file,
        errors
      );
      extensionErrors += reportUnapprovedKeys(
        consent.attributes,
        new Set(['label', 'description', 'options']),
        `${rules.optionalConsentField} attributes`,
        file,
        errors
      );
      if (Array.isArray(consentOptions)) {
        consentOptions.forEach((option, index) => {
          extensionErrors += reportUnapprovedKeys(
            option,
            new Set(['label']),
            `${rules.optionalConsentField} option ${index}`,
            file,
            errors
          );
        });
      }
      const optionalContractMismatch =
        consent.type !== 'checkboxes' ||
        consent.validations !== undefined ||
        (Array.isArray(consentOptions) && consentOptions.some((option) => option?.required !== undefined));
      if (optionalContractMismatch) {
        errors.push(problem(file, `${rules.optionalConsentField} must remain optional at both field and option levels with validations omitted`));
      }
      const attributesMismatch = !isDeepStrictEqual(consent.attributes, EVIDENCE_CONSENT_ATTRIBUTES);
      if (attributesMismatch) {
        errors.push(problem(file, `${rules.optionalConsentField} must preserve the complete approved Public Evidence Ledger consent`));
      }
      const approvedConsent = {
        type: 'checkboxes',
        id: rules.optionalConsentField,
        attributes: EVIDENCE_CONSENT_ATTRIBUTES
      };
      const fieldContractMismatch = !isDeepStrictEqual(consent, approvedConsent);
      if (!optionalContractMismatch && !attributesMismatch && extensionErrors === 0 && fieldContractMismatch) {
        errors.push(problem(file, `${rules.optionalConsentField} must match the complete approved field contract`));
      }
    }
  }

  return errors;
}

export function validateChooserConfig(config, file = '.github/ISSUE_TEMPLATE/config.yml') {
  const errors = [];
  if (!isMapping(config)) {
    return [problem(file, 'chooser root must be a mapping')];
  }
  for (const key of Object.keys(config)) {
    if (!CHOOSER_TOP_LEVEL_KEYS.has(key)) {
      errors.push(problem(file, `chooser contains unapproved top-level key "${key}"`));
    }
  }
  if (config.blank_issues_enabled !== false) {
    errors.push(problem(file, 'blank_issues_enabled must be false'));
  }
  if (Object.hasOwn(config, 'contact_links')) {
    errors.push(problem(file, "contact_links must be omitted because SECURITY.md provides GitHub's native private security route"));
  }
  return errors;
}

function normalizeLineEndings(source) {
  return source.replace(/\r\n?/g, '\n');
}

function splitPullRequestSections(source) {
  const sections = new Map();
  const matches = [...source.matchAll(/^## .+$/gm)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? source.length;
    sections.set(match[0], source.slice(start, end).split('\n'));
  }
  return { headings: matches.map((match) => match[0]), sections };
}

export function validatePullRequestTemplate(source, file = '.github/pull_request_template.md') {
  const errors = [];
  if (typeof source !== 'string') {
    return [problem(file, 'PR template source must be a string')];
  }
  const normalized = normalizeLineEndings(source);
  const { headings, sections } = splitPullRequestSections(normalized);
  for (const heading of PR_HEADINGS) {
    if (!headings.includes(heading)) {
      errors.push(problem(file, `missing PR heading "${heading}"`));
    }
  }
  if (!isDeepStrictEqual(headings, PR_HEADINGS)) {
    errors.push(problem(file, 'PR headings must appear exactly once in the approved order'));
  }
  for (const [heading, requiredLines] of Object.entries(PR_SECTION_LINES)) {
    const sectionLines = sections.get(heading);
    if (!sectionLines) continue;
    for (const line of requiredLines) {
      if (!sectionLines.includes(line)) {
        errors.push(problem(file, `${heading.slice(3)} section is missing approved governance line: ${line}`));
      }
    }
  }
  if (normalized !== APPROVED_PR_TEMPLATE) {
    errors.push(problem(file, 'PR template must match the complete approved normalized source'));
  }
  return errors;
}

async function readRequired(root, relativePath, errors) {
  try {
    return await readFile(path.join(root, relativePath), 'utf8');
  } catch (error) {
    errors.push(problem(relativePath, `cannot read required file: ${error.code ?? error.message}`));
    return null;
  }
}

function parseYaml(source, relativePath, errors) {
  try {
    return { ok: true, value: YAML.parse(source) };
  } catch (error) {
    errors.push(problem(relativePath, `invalid YAML: ${error.message}`));
    return { ok: false, value: undefined };
  }
}

export async function validateCommunityTemplates(root) {
  const errors = [];
  let filesChecked = 0;
  for (const relativePath of Object.keys(FORM_RULES)) {
    const source = await readRequired(root, relativePath, errors);
    if (source === null) continue;
    filesChecked += 1;
    const form = parseYaml(source, relativePath, errors);
    if (form.ok) errors.push(...validateIssueForm(form.value, source, relativePath));
  }

  const chooserPath = '.github/ISSUE_TEMPLATE/config.yml';
  const chooserSource = await readRequired(root, chooserPath, errors);
  if (chooserSource !== null) {
    filesChecked += 1;
    const chooser = parseYaml(chooserSource, chooserPath, errors);
    if (chooser.ok) errors.push(...validateChooserConfig(chooser.value, chooserPath));
  }

  const pullRequestPath = '.github/pull_request_template.md';
  const pullRequestSource = await readRequired(root, pullRequestPath, errors);
  if (pullRequestSource !== null) {
    filesChecked += 1;
    errors.push(...validatePullRequestTemplate(pullRequestSource, pullRequestPath));
  }
  return { errors, filesChecked };
}

export function formatValidationErrors(errors) {
  const grouped = new Map();
  for (const error of errors) {
    grouped.set(error.file, [...(grouped.get(error.file) ?? []), error.message]);
  }
  return [...grouped.entries()]
    .map(([file, messages]) => `${file}:\n${messages.map((message) => `  ${message}`).join('\n')}`)
    .join('\n\n');
}

export async function runCli(root = fileURLToPath(new URL('..', import.meta.url))) {
  const result = await validateCommunityTemplates(root);
  if (result.errors.length > 0) {
    console.error(formatValidationErrors(result.errors));
    return 1;
  }
  console.log(`Community template validation passed. Checked ${result.filesChecked} files.`);
  console.log('Policy gates: blank Issues disabled; native SECURITY.md routing preserved; Adoption evidence consent optional.');
  return 0;
}

const executedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === executedPath) {
  process.exitCode = await runCli();
}
