# PR #589 /builder before/after evidence (CI Playwright e2e artifacts)

Source: the `headless-e2e-evidence` artifact of the CI workflow (job `Node (e2e)`), taken as is. No new screenshots were made and the prod deploy was not opened.
Viewport: desktop 1280x800, light theme (`design-audit.spec.ts`, file name `audit-<name>-light-desktop.png`).

| File | Side | Test name | Run URL | Run head SHA |
|---|---|---|---|---|
| base-list.png | before (main) | design-audit.spec.ts > Claude Design 全画面監査 > /view シート一覧 | https://github.com/kouiso/skillsheet-viewer/actions/runs/39521648129 | 9a5284c77cf626d54cb614c4fac8864129a5953d |
| base-edit.png | before (main) | design-audit.spec.ts > Claude Design 全画面監査 > builder /builder（編集画面） | https://github.com/kouiso/skillsheet-viewer/actions/runs/39521648129 | 9a5284c77cf626d54cb614c4fac8864129a5953d |
| head-list.png | after (PR #589) | design-audit.spec.ts > Claude Design 全画面監査 > /view シート一覧 | https://github.com/kouiso/skillsheet-viewer/actions/runs/39525815382 | 20f7e89d866d747a6d1c6db16cfcfa3e11e9d9d8 |
| head-edit.png | after (PR #589) | design-audit.spec.ts > Claude Design 全画面監査 > builder /builder（編集画面） | https://github.com/kouiso/skillsheet-viewer/actions/runs/39525815382 | 20f7e89d866d747a6d1c6db16cfcfa3e11e9d9d8 |

Notes
- The app has no separate list page under /builder. The sheet list is `/view` (スキルシート一覧). The `/builder?sheet=<id>` page is the editor.
- Console errors: 0 on both sides. `design-audit.spec.ts` collects `console.error` and asserts `toEqual([])` per viewport and theme. All of these tests passed (base 94 expected / 0 unexpected, head 94 / 0). `e2e/results.json` `browserErrors` is [] on both sides (login, viewer-auth).
- The head run is a `pull_request` event, so GitHub tested the merge ref of 20f7e89 into main.
- Personal info: none. The data is synthetic test fixtures (Adversarial … sheet, 実データボリューム検証シート fixture title + UUID) and placeholder examples (例: 見本 花子（架空）).
- Visual diff: none seen. The only difference is the generated sheet name/UUID, which comes from the test run.
