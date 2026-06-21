# VERIFY

## PR branch checkout attempt
```text
$ gh pr view 4 -R kouiso/skillsheet-viewer --json headRefName -q .headRefName
/bin/bash: line 1: gh: command not found

$ git remote add origin https://github.com/kouiso/skillsheet-viewer.git && git fetch origin main pull/4/head:pr-4 && git checkout pr-4
fatal: unable to access 'https://github.com/kouiso/skillsheet-viewer.git/': CONNECT tunnel failed, response 403
```

## Environment
```text
$ node --version
v20.20.2
$ pnpm --version
10.33.0
```

## git rebase origin/main
```text
$ git rebase origin/main
fatal: invalid upstream 'origin/main'
```

## Typecheck
```text
$ pnpm type-check
 WARN  Unsupported engine: wanted: {"node":"22.x"} (current: {"node":"v20.20.2","pnpm":"10.33.0"})

> skillsheet-viewer@1.0.0 type-check /workspace/skillsheet-viewer
> pnpm -r type-check

.                                        |  WARN  Unsupported engine: wanted: {"node":"22.x"} (current: {"node":"v20.20.2","pnpm":"10.33.0"})
Scope: 2 of 3 workspace projects
packages/db type-check$ tsc --noEmit
packages/db type-check: Done
apps/web type-check$ tsc --noEmit
apps/web type-check: Done
```

## Tests
```text
$ pnpm test
 WARN  Unsupported engine: wanted: {"node":"22.x"} (current: {"node":"v20.20.2","pnpm":"10.33.0"})

> skillsheet-viewer@1.0.0 test /workspace/skillsheet-viewer
> pnpm -r --if-present test

.                                        |  WARN  Unsupported engine: wanted: {"node":"22.x"} (current: {"node":"v20.20.2","pnpm":"10.33.0"})
Scope: 2 of 3 workspace projects
packages/db test$ vitest run
packages/db test:  RUN  v3.2.6 /workspace/skillsheet-viewer/packages/db
packages/db test:  ✓ src/blocks.test.ts (3 tests) 8ms
packages/db test:  Test Files  1 passed (1)
packages/db test:       Tests  3 passed (3)
packages/db test:    Start at  15:14:07
packages/db test:    Duration  1.01s (transform 147ms, setup 0ms, collect 124ms, tests 8ms, environment 0ms, prepare 206ms)
packages/db test: Done
apps/web test$ vitest run
apps/web test:  RUN  v3.2.6 /workspace/skillsheet-viewer/apps/web
apps/web test: stderr | src/hooks/use-active-heading.test.ts > useActiveHeading > アクティブな見出しの更新 > 要素が交差した時にactiveIdが更新されること
apps/web test: An update to TestComponent inside a test was not wrapped in act(...).
apps/web test: When testing, code that causes React state updates should be wrapped into act(...):
apps/web test: act(() => {
apps/web test:   /* fire events that update state */
apps/web test: });
apps/web test: /* assert on the output */
apps/web test: This ensures that you're testing the behavior the user would see in the browser. Learn more at https://react.dev/link/wrap-tests-with-act
apps/web test:  ✓ src/context/theme-context.test.tsx (9 tests) 102ms
apps/web test: stderr | src/hooks/use-active-heading.test.ts > useActiveHeading > アクティブな見出しの更新 > 複数の要素が交差した時、最後の要素のIDが使われること
apps/web test: An update to TestComponent inside a test was not wrapped in act(...).
apps/web test: When testing, code that causes React state updates should be wrapped into act(...):
apps/web test: act(() => {
apps/web test:   /* fire events that update state */
apps/web test: });
apps/web test: /* assert on the output */
apps/web test: This ensures that you're testing the behavior the user would see in the browser. Learn more at https://react.dev/link/wrap-tests-with-act
apps/web test: An update to TestComponent inside a test was not wrapped in act(...).
apps/web test: When testing, code that causes React state updates should be wrapped into act(...):
apps/web test: act(() => {
apps/web test:   /* fire events that update state */
apps/web test: });
apps/web test: /* assert on the output */
apps/web test: This ensures that you're testing the behavior the user would see in the browser. Learn more at https://react.dev/link/wrap-tests-with-act
apps/web test: stderr | src/hooks/use-active-heading.test.ts > useActiveHeading > エッジケース > 同じ見出しIDが複数回交差してもactiveIdは同じであること
apps/web test: An update to TestComponent inside a test was not wrapped in act(...).
apps/web test: When testing, code that causes React state updates should be wrapped into act(...):
apps/web test: act(() => {
apps/web test:   /* fire events that update state */
apps/web test: });
apps/web test: /* assert on the output */
apps/web test: This ensures that you're testing the behavior the user would see in the browser. Learn more at https://react.dev/link/wrap-tests-with-act
apps/web test: An update to TestComponent inside a test was not wrapped in act(...).
apps/web test: When testing, code that causes React state updates should be wrapped into act(...):
apps/web test: act(() => {
apps/web test:   /* fire events that update state */
apps/web test: });
apps/web test: /* assert on the output */
apps/web test: This ensures that you're testing the behavior the user would see in the browser. Learn more at https://react.dev/link/wrap-tests-with-act
apps/web test:  ✓ src/hooks/use-active-heading.test.ts (16 tests) 278ms
apps/web test: stderr | src/component/pdf-export.test.tsx > SkillSheetPDF > should render PDF document with title
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: The tag <TEXT> is unrecognized in this browser. If you meant to render a React component, start its name with an uppercase letter.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: The tag <VIEW> is unrecognized in this browser. If you meant to render a React component, start its name with an uppercase letter.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: React does not recognize the `minPresenceAhead` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `minpresenceahead` instead. If you accidentally passed it from a parent component, remove it from the DOM element.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: Received `true` for a non-boolean attribute `fixed`.
apps/web test: If you want to write it to the DOM, pass a string instead: fixed="true" or fixed={value.toString()}.
apps/web test: Invalid value for prop `render` on <TEXT> tag. Either remove it from the element, or pass a string or number value to keep it in the DOM. For details, see https://react.dev/link/attribute-behavior 
apps/web test: <PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: The tag <PAGE> is unrecognized in this browser. If you meant to render a React component, start its name with an uppercase letter.
apps/web test: <DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: The tag <DOCUMENT> is unrecognized in this browser. If you meant to render a React component, start its name with an uppercase letter.
apps/web test: stderr | src/component/pdf-export.test.tsx > SkillSheetPDF > should handle empty content
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: stderr | src/component/pdf-export.test.tsx > SkillSheetPDF > should handle content with only headings
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: stderr | src/component/pdf-export.test.tsx > SkillSheetPDF > should handle content with lists
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: stderr | src/component/pdf-export.test.tsx > SkillSheetPDF > should handle content with code blocks
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: stderr | src/component/pdf-export.test.tsx > SkillSheetPDF > should handle content with blockquotes
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: stderr | src/component/pdf-export.test.tsx > SkillSheetPDF > should handle content with horizontal rules
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: stderr | src/component/pdf-export.test.tsx > SkillSheetPDF > should handle content with inline markdown
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <LINK /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: stderr | src/component/pdf-export.test.tsx > SkillSheetPDF > should handle complex mixed content
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: stderr | src/component/pdf-export.test.tsx > SkillSheetPDF > should render with special characters in title
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: stderr | src/component/pdf-export.test.tsx > SkillSheetPDF > should handle very long content
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test:  ✓ src/component/pdf-export.test.tsx (11 tests) 580ms
apps/web test:  ✓ src/component/header.test.tsx (8 tests) 1149ms
apps/web test:    ✓ Header > PDF機能 > クリックで onDownloadPdf が呼ばれること  861ms
apps/web test:  ✓ src/component/table-of-contents.test.tsx (5 tests) 1221ms
apps/web test:    ✓ TableOfContents（デスクトップ表示） > 「目次」見出しが表示されること  402ms
apps/web test:    ✓ TableOfContents（デスクトップ表示） > 全ての見出しがボタンとして表示されること  370ms
apps/web test:  ✓ src/component/code-block.test.tsx (8 tests) 1082ms
apps/web test:    ✓ CodeBlock > レンダリング > 言語ラベルが表示されること  485ms
apps/web test:    ✓ CodeBlock > コピー機能 > ボタン押下でクリップボードにコードが書き込まれること  325ms
apps/web test:  ✓ app/builder/builder-client.test.tsx (5 tests) 1009ms
apps/web test:    ✓ BuilderClient > 「ブロック追加」で空ブロックが増える  488ms
apps/web test:  ✓ src/component/skill-sheet-viewer.test.tsx (1 test) 135ms
apps/web test: stderr | src/component/pdf/skill-sheet-document.test.tsx > SkillSheetDocument > ページ高さを超えうる大きなテーブルを含む内容でもスローせず描画できる
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: The tag <TEXT> is unrecognized in this browser. If you meant to render a React component, start its name with an uppercase letter.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: The tag <VIEW> is unrecognized in this browser. If you meant to render a React component, start its name with an uppercase letter.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: React does not recognize the `minPresenceAhead` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `minpresenceahead` instead. If you accidentally passed it from a parent component, remove it from the DOM element.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: Received `true` for a non-boolean attribute `wrap`.
apps/web test: If you want to write it to the DOM, pass a string instead: wrap="true" or wrap={value.toString()}.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: Received `true` for a non-boolean attribute `fixed`.
apps/web test: If you want to write it to the DOM, pass a string instead: fixed="true" or fixed={value.toString()}.
apps/web test: Invalid value for prop `render` on <TEXT> tag. Either remove it from the element, or pass a string or number value to keep it in the DOM. For details, see https://react.dev/link/attribute-behavior 
apps/web test: <PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: The tag <PAGE> is unrecognized in this browser. If you meant to render a React component, start its name with an uppercase letter.
apps/web test: <DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: The tag <DOCUMENT> is unrecognized in this browser. If you meant to render a React component, start its name with an uppercase letter.
apps/web test: stderr | src/component/pdf/skill-sheet-document.test.tsx > SkillSheetDocument > 段落内ソフト改行を含む複数行パラグラフを描画できる
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test: <DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
apps/web test:  ✓ src/component/pdf/skill-sheet-document.test.tsx (5 tests) 192ms
apps/web test:  Test Files  9 passed (9)
apps/web test:       Tests  68 passed (68)
apps/web test:    Start at  15:14:09
apps/web test:    Duration  21.53s (transform 1.68s, setup 4.86s, collect 10.43s, tests 5.75s, environment 13.34s, prepare 2.20s)
apps/web test: Done
```
