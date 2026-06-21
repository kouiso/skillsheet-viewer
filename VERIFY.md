# Verification Log

Cloud-executable repository changes only. Live-preview, E2E, external-account, secret, PR-ready, remote CI confirmation, and merge operations were not performed from this environment.

## Commands and real output

### `gh pr view 34 -R kouiso/skillsheet-viewer --json headRefName -q .headRefName`

```text
/bin/bash: line 1: gh: command not found
```

### `gh api repos/kouiso/skillsheet-viewer/compare/main...feat/skillsheet-mandate`

```text
Not run: GitHub CLI is not installed in this environment. A direct GitHub API request also failed with `Tunnel connection failed: 403 Forbidden`.
```

### `git fetch origin <branch> && git checkout <branch>`

```text
Not run: PR head branch could not be resolved because GitHub CLI is unavailable and GitHub API access is blocked by the environment proxy. The local checkout also has no configured `origin` remote.
```

### `sudo apt-get update && sudo apt-get install -y gh`

```text
E: The repository 'http://archive.ubuntu.com/ubuntu noble InRelease' is no longer signed.
E: Failed to fetch http://archive.ubuntu.com/ubuntu/dists/noble/InRelease  403  Forbidden [IP: 172.30.3.99 8080]
E: The repository 'http://archive.ubuntu.com/ubuntu noble-updates InRelease' is no longer signed.
E: Failed to fetch http://archive.ubuntu.com/ubuntu/dists/noble-updates/InRelease  403  Forbidden [IP: 172.30.3.99 8080]
E: Failed to fetch http://archive.ubuntu.com/ubuntu/dists/noble-backports/InRelease  403  Forbidden [IP: 172.30.3.99 8080]
E: The repository 'http://archive.ubuntu.com/ubuntu noble-backports InRelease' is no longer signed.
E: Failed to fetch http://security.ubuntu.com/ubuntu/dists/noble-security/InRelease  403  Forbidden [IP: 172.30.3.99 8080]
E: The repository 'http://security.ubuntu.com/ubuntu noble-security InRelease' is no longer signed.
```

### `pnpm type-check`

```text
WARN Unsupported engine: wanted: {"node":"22.x"} (current: {"node":"v20.20.2","pnpm":"10.33.0"})
> skillsheet-viewer@1.0.0 type-check /workspace/skillsheet-viewer
> pnpm -r type-check
Scope: 2 of 3 workspace projects
packages/db type-check$ tsc --noEmit
packages/db type-check: Done
apps/web type-check$ tsc --noEmit
apps/web type-check: Done
```

Result: pass.

### `pnpm test`

```text
WARN Unsupported engine: wanted: {"node":"22.x"} (current: {"node":"v20.20.2","pnpm":"10.33.0"})
> skillsheet-viewer@1.0.0 test /workspace/skillsheet-viewer
> pnpm -r --if-present test
Scope: 2 of 3 workspace projects
packages/db test$ vitest run
packages/db test: Test Files 1 passed (1)
packages/db test: Tests 3 passed (3)
apps/web test$ vitest run
apps/web test: Test Files 9 passed (9)
apps/web test: Tests 68 passed (68)
apps/web test: Done
```

Result: pass. The command emitted existing React/JSDOM stderr warnings from PDF and hook tests, but exited successfully.
