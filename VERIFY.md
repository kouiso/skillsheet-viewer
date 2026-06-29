# VERIFY

実行日時: 2026-06-21 (UTC)
ブランチ: `fix/ci-security-labeler-workflows`

## Issue確認

`gh` CLI がコンテナに存在せず、GitHub/API/apt 経由の取得もプロキシ 403 でブロックされたため、Issue #10/#11/#12 の本文は取得できませんでした。ユーザー指示の「CI security scan / labeler workflows」に基づき、ローカルの `.github` 配下を確認して実装しました。

```text
$ which gh || true; gh issue view 12 --repo kouiso/skillsheet-viewer
/bin/bash: line 1: gh: command not found
```

```text
$ curl -sS https://api.github.com/repos/kouiso/skillsheet-viewer/issues/12
curl: (56) CONNECT tunnel failed, response 403
```

```text
$ apt-get update
Err:1 http://security.ubuntu.com/ubuntu noble-security InRelease
  403  Forbidden [IP: 172.30.1.67 8080]
...
E: The repository 'http://archive.ubuntu.com/ubuntu noble-backports InRelease' is no longer signed.
```

## 実装後の検証

### `pnpm install --frozen-lockfile`

Exit code: 0

```text
$ pnpm install --frozen-lockfile
 WARN  Unsupported engine: wanted: {"node":"22.x"} (current: {"node":"v20.20.2","pnpm":"10.33.0"})
Scope: all 3 workspace projects
Lockfile is up to date, resolution step is skipped
Already up to date
Done in 3.2s using pnpm v10.33.0
```

### `pnpm run lint`

Exit code: 0

```text
$ pnpm run lint
> skillsheet-viewer@1.0.0 lint /workspace/skillsheet-viewer
> biome check .

Checked 90 files in 151ms. No fixes applied.
Found 4 warnings.
```

既存警告の例:

```text
apps/web/src/component/pdf/skill-sheet-document.tsx:238:20 lint/suspicious/noArrayIndexKey
apps/web/src/component/pdf/skill-sheet-document.tsx:290:20 lint/suspicious/noArrayIndexKey
apps/web/src/component/skill-sheet-viewer.tsx:133:44 lint/suspicious/noExplicitAny
apps/web/src/component/skill-sheet-viewer.tsx:150:23 lint/performance/noImgElement
```

### `pnpm run type-check`

Exit code: 0

```text
$ pnpm run type-check
> skillsheet-viewer@1.0.0 type-check /workspace/skillsheet-viewer
> pnpm -r type-check

packages/db type-check$ tsc --noEmit
packages/db type-check: Done
apps/web type-check$ tsc --noEmit
apps/web type-check: Done
```

### `pnpm run build`

Exit code: 0

```text
$ pnpm run build
> skillsheet-viewer@1.0.0 build /workspace/skillsheet-viewer
> pnpm --filter @skillsheet/web build

> @skillsheet/web@0.0.0 build /workspace/skillsheet-viewer/apps/web
> next build

▲ Next.js 16.2.7 (Turbopack)

  Creating an optimized production build ...
✓ Compiled successfully in 27.1s
  Running TypeScript ...
  Finished TypeScript in 17.4s ...
  Collecting page data using 2 workers ...
Failed to fetch sheets: Error: Missing required GitHub env vars: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO
✓ Generating static pages using 2 workers (9/9) in 711ms
  Finalizing page optimization ...
```

### `pnpm run test`

Exit code: 0

```text
$ pnpm run test
> skillsheet-viewer@1.0.0 test /workspace/skillsheet-viewer
> pnpm -r --if-present test

packages/db test:  ✓ src/blocks.test.ts (3 tests) 5ms
packages/db test:  Test Files  1 passed (1)
packages/db test:       Tests  3 passed (3)
apps/web test:  ✓ src/context/theme-context.test.tsx (9 tests) 104ms
apps/web test:  ✓ src/hooks/use-active-heading.test.ts (16 tests) 276ms
apps/web test:  ✓ src/component/pdf-export.test.tsx (11 tests) 553ms
apps/web test:  ✓ src/component/table-of-contents.test.tsx (5 tests) 895ms
apps/web test:  ✓ src/component/code-block.test.tsx (8 tests) 983ms
apps/web test:  ✓ app/builder/builder-client.test.tsx (5 tests) 922ms
apps/web test:  ✓ src/component/skill-sheet-viewer.test.tsx (1 test) 121ms
apps/web test:  ✓ src/component/pdf/skill-sheet-document.test.tsx (5 tests) 166ms
apps/web test:  Test Files  9 passed (9)
apps/web test:       Tests  68 passed (68)
```

### ローカル security scan 相当: `pnpm audit --prod --audit-level high`

Exit code: 1 (環境制限: npm registry audit endpoint が 403)

```text
$ pnpm audit --prod --audit-level high
 ERR_PNPM_AUDIT_BAD_RESPONSE  The audit endpoint (at https://registry.npmjs.org/-/npm/v1/security/audits/quick) responded with 403: Forbidden. Fallback endpoint (at https://registry.npmjs.org/-/npm/v1/security/audits) responded with 403: Forbidden
audit exit=1
```

### workflow smoke check

Exit code: 0

```text
$ python3 - <<'PY'
from pathlib import Path
for p in ['.github/workflows/ci.yml','.github/workflows/labeler.yml','.github/workflows/security-scan.yml']:
    text=Path(p).read_text()
    assert 'permissions:' in text, p
    assert text.startswith('name:'), p
    print(f'{p}: ok ({len(text.splitlines())} lines)')
PY
.github/workflows/ci.yml: ok (55 lines)
.github/workflows/labeler.yml: ok (76 lines)
.github/workflows/security-scan.yml: ok (44 lines)
```
