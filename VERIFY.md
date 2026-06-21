# VERIFY

実行日時: 2026-06-21 (UTC)

## pnpm type-check
```text
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

## pnpm test
```text
 WARN  Unsupported engine: wanted: {"node":"22.x"} (current: {"node":"v20.20.2","pnpm":"10.33.0"})

> skillsheet-viewer@1.0.0 test /workspace/skillsheet-viewer
> pnpm -r --if-present test

.                                        |  WARN  Unsupported engine: wanted: {"node":"22.x"} (current: {"node":"v20.20.2","pnpm":"10.33.0"})
Scope: 2 of 3 workspace projects
packages/db test$ vitest run
packages/db test:  RUN  v3.2.6 /workspace/skillsheet-viewer/packages/db
packages/db test:  ✓ src/blocks.test.ts (3 tests) 7ms
packages/db test:  Test Files  1 passed (1)
packages/db test:       Tests  3 passed (3)
packages/db test:    Start at  15:12:34
packages/db test:    Duration  720ms (transform 100ms, setup 0ms, collect 90ms, tests 7ms, environment 0ms, prepare 135ms)
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
apps/web test:  ✓ src/context/theme-context.test.tsx (9 tests) 88ms
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
apps/web test:  ✓ src/hooks/use-active-heading.test.ts (16 tests) 272ms
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
apps/web test:  ✓ src/component/header.test.tsx (8 tests) 979ms
apps/web test:    ✓ Header > PDF機能 > クリックで onDownloadPdf が呼ばれること  592ms
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
apps/web test:  ✓ src/component/pdf-export.test.tsx (11 tests) 539ms
apps/web test:  ✓ src/component/table-of-contents.test.tsx (5 tests) 981ms
apps/web test:    ✓ TableOfContents（デスクトップ表示） > 「目次」見出しが表示されること  350ms
apps/web test:  ✓ src/component/code-block.test.tsx (8 tests) 990ms
apps/web test:    ✓ CodeBlock > レンダリング > 言語ラベルが表示されること  407ms
apps/web test:    ✓ CodeBlock > コピー機能 > ボタン押下でクリップボードにコードが書き込まれること  311ms
apps/web test:  ✓ app/builder/builder-client.test.tsx (5 tests) 900ms
apps/web test:    ✓ BuilderClient > 「ブロック追加」で空ブロックが増える  484ms
apps/web test:  ✓ src/component/skill-sheet-viewer.test.tsx (1 test) 124ms
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
apps/web test:  ✓ src/component/pdf/skill-sheet-document.test.tsx (5 tests) 204ms
apps/web test:  Test Files  9 passed (9)
apps/web test:       Tests  68 passed (68)
apps/web test:    Start at  15:12:36
apps/web test:    Duration  18.81s (transform 1.28s, setup 4.09s, collect 8.00s, tests 5.08s, environment 12.22s, prepare 1.84s)
apps/web test: Done
```

## pnpm lint
```text
 WARN  Unsupported engine: wanted: {"node":"22.x"} (current: {"node":"v20.20.2","pnpm":"10.33.0"})

> skillsheet-viewer@1.0.0 lint /workspace/skillsheet-viewer
> biome check .

apps/web/src/component/pdf/skill-sheet-document.tsx:238:20 lint/suspicious/noArrayIndexKey ━━━━━━━━━━

  ! Avoid using the index of an array as key property in an element.
  
    236 │     <View key={key} style={styles.list}>
    237 │       {(node.children ?? []).map((item, i) => (
  > 238 │         <View key={i} style={styles.listItem}>
        │                    ^
    239 │           <Text style={styles.listBullet}>{ordered ? `${i + 1}.` : '•'}</Text>
    240 │           <View style={styles.listContent}>{renderBlocks(item.children)}</View>
  
  i This is the source of the key value.
  
    235 │   return (
    236 │     <View key={key} style={styles.list}>
  > 237 │       {(node.children ?? []).map((item, i) => (
        │                                         ^
    238 │         <View key={i} style={styles.listItem}>
    239 │           <Text style={styles.listBullet}>{ordered ? `${i + 1}.` : '•'}</Text>
  
  i The order of the items may change, and this also affects performances and component state.
  
  i Check the React documentation. 
  

apps/web/src/component/pdf/skill-sheet-document.tsx:290:20 lint/suspicious/noArrayIndexKey ━━━━━━━━━━

  ! Avoid using the index of an array as key property in an element.
  
    288 │     <View key={key} style={styles.table} wrap={shouldTableWrap(rows.length)}>
    289 │       {rows.map((row, ri) => (
  > 290 │         <View key={ri} style={styles.tableRow}>
        │                    ^^
    291 │           {(row.children ?? []).map((cell, ci) => renderTableCell(cell, ci, columnCount, align, ri === 0))}
    292 │         </View>
  
  i This is the source of the key value.
  
    287 │   return (
    288 │     <View key={key} style={styles.table} wrap={shouldTableWrap(rows.length)}>
  > 289 │       {rows.map((row, ri) => (
        │                       ^^
    290 │         <View key={ri} style={styles.tableRow}>
    291 │           {(row.children ?? []).map((cell, ci) => renderTableCell(cell, ci, columnCount, align, ri === 0))}
  
  i The order of the items may change, and this also affects performances and component state.
  
  i Check the React documentation. 
  

apps/web/src/component/skill-sheet-viewer.tsx:133:44 lint/suspicious/noExplicitAny ━━━━━━━━━━━━━━━━━

  ! Unexpected any. Specify a different type.
  
    131 │                 code(props) {
    132 │                   const { className, children, ...rest } = props;
  > 133 │                   const inline = (props as any).inline;
        │                                            ^^^
    134 │                   if (inline) {
    135 │                     return (
  
  i any disables many type checking rules. Its use should be avoided.
  

apps/web/src/component/skill-sheet-viewer.tsx:150:23 lint/performance/noImgElement ━━━━━━━━━━━━━━━━━

  ! Don't use <img> element.
  
    148 │                       className="cursor-zoom-in border-0 bg-transparent p-0"
    149 │                     >
  > 150 │                       <img src={src} alt={alt} {...props} />
        │                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    151 │                     </button>
    152 │                   );
  
  i Using the <img> can lead to slower LCP and higher bandwidth. Consider using <Image /> from next/image to automatically optimize images.
  

Checked 90 files in 161ms. No fixes applied.
Found 4 warnings.
```

## pnpm build
```text
 WARN  Unsupported engine: wanted: {"node":"22.x"} (current: {"node":"v20.20.2","pnpm":"10.33.0"})

> skillsheet-viewer@1.0.0 build /workspace/skillsheet-viewer
> pnpm --filter @skillsheet/web build

.                                        |  WARN  Unsupported engine: wanted: {"node":"22.x"} (current: {"node":"v20.20.2","pnpm":"10.33.0"})

> @skillsheet/web@0.0.0 build /workspace/skillsheet-viewer/apps/web
> next build

Attention: Next.js now collects completely anonymous telemetry regarding usage.
This information is used to shape Next.js' roadmap and prioritize features.
You can learn more, including how to opt-out if you'd not like to participate in this anonymous program, by visiting the following URL:
https://nextjs.org/telemetry

▲ Next.js 16.2.7 (Turbopack)

  Creating an optimized production build ...
✓ Compiled successfully in 27.3s
  Running TypeScript ...
  Finished TypeScript in 17.4s ...
  Collecting page data using 2 workers ...
  Generating static pages using 2 workers (0/9) ...
  Generating static pages using 2 workers (2/9) 
Failed to fetch sheets: Error: Missing required GitHub env vars: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO
    at f (.next/server/chunks/ssr/[root-of-the-server]__1oqc5dt._.js:1:1648)
    at h (.next/server/chunks/ssr/[root-of-the-server]__1oqc5dt._.js:1:1951)
    at j.tags (.next/server/chunks/ssr/[root-of-the-server]__1oqc5dt._.js:1:3060)
    at <unknown> (.next/server/chunks/ssr/1fax_next_19086f9._.js:8:29925)
    at async e (.next/server/chunks/ssr/[root-of-the-server]__1_q4j0z._.js:1:4490)
  Generating static pages using 2 workers (4/9) 
  Generating static pages using 2 workers (6/9) 
✓ Generating static pages using 2 workers (9/9) in 699ms
  Finalizing page optimization ...

Route (app)             Revalidate  Expire
┌ ○ /
├ ○ /_not-found
├ ƒ /api/auth
├ ƒ /api/auth/[...all]
├ ƒ /api/logout
├ ƒ /builder
├ ƒ /compare
├ ○ /login
├ ○ /view                       1h      1y
├ ƒ /view/[path]
├ ƒ /view/db
└ ○ /viewer-auth


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

```
