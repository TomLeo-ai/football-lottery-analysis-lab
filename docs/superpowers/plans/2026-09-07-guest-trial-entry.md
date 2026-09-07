# Guest Trial Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing public introduction page send visitors directly into the trial without credentials or authentication state.

**Architecture:** Keep the current `/` marketing page and `/dashboard` route. Change only the two existing Vue Router call-to-action labels and lock the no-auth contract in the focused MarketingHome test.

**Tech Stack:** Vue 3, Vue Router, TypeScript, Vitest.

---

### Task 1: Rename the direct trial entry actions

**Files:**
- Modify: `apps/web/src/views/MarketingHome.spec.ts`
- Modify: `apps/web/src/views/MarketingHome.vue`

- [ ] **Step 1: Write the failing no-auth entry test**

Replace the existing single dashboard-link assertion with:

```ts
const trialLinks = wrapper.findAll('a[href="/dashboard"]');
expect(trialLinks).toHaveLength(2);
expect(trialLinks.every((link) => link.text() === '免登录进入试用')).toBe(true);
expect(wrapper.find('input[type="email"]').exists()).toBe(false);
expect(wrapper.find('input[type="password"]').exists()).toBe(false);
expect(wrapper.text()).not.toContain('验证码');
```

- [ ] **Step 2: Run the focused test and observe RED**

Run:

```powershell
npm.cmd run test -w apps/web -- src/views/MarketingHome.spec.ts
```

Expected: FAIL because both current links still display `进入工作台`.

- [ ] **Step 3: Change only the two action labels**

In `MarketingHome.vue`, keep both `to="/dashboard"` destinations and replace
their visible content with:

```vue
免登录进入试用
```

Do not add a login route, form, API, store, cookie, token, or redirect.

- [ ] **Step 4: Run the same focused test and observe GREEN**

Run:

```powershell
npm.cmd run test -w apps/web -- src/views/MarketingHome.spec.ts
```

Expected: one test file passes with no failed tests.

- [ ] **Step 5: Check and commit the atomic change**

```powershell
git diff --check -- apps/web/src/views/MarketingHome.vue apps/web/src/views/MarketingHome.spec.ts
git add apps/web/src/views/MarketingHome.vue apps/web/src/views/MarketingHome.spec.ts docs/superpowers/plans/2026-09-07-guest-trial-entry.md
git commit -m "feat: make the public trial entry passwordless"
```

After the commit, push `codex/guest-trial-entry`, open a Ready PR to `main`, wait
only for GitHub check `verify`, and squash merge on success. If CI fails, inspect
and retest only the failing scope.
