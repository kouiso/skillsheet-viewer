# Verification output

## gh pr view headRefName
```
/bin/bash: line 7: gh: command not found
```

## gh pr view mergeable
```
/bin/bash: line 12: gh: command not found
```

## pnpm --filter @skillsheet/web type-check
```
.                                        |  WARN  Unsupported engine: wanted: {"node":"22.x"} (current: {"node":"v20.20.2","pnpm":"10.33.0"})

> @skillsheet/web@0.0.0 type-check /workspace/skillsheet-viewer/apps/web
> tsc --noEmit

```

## pnpm --filter @skillsheet/web test
```
.                                        |  WARN  Unsupported engine: wanted: {"node":"22.x"} (current: {"node":"v20.20.2","pnpm":"10.33.0"})

> @skillsheet/web@0.0.0 test /workspace/skillsheet-viewer/apps/web
> vitest run


 RUN  v3.2.6 /workspace/skillsheet-viewer/apps/web

stderr | src/hooks/use-active-heading.test.ts > useActiveHeading > アクティブな見出しの更新 > 要素が交差した時にactiveIdが更新されること
An update to TestComponent inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://react.dev/link/wrap-tests-with-act

 ✓ src/context/theme-context.test.tsx (9 tests) 86ms
stderr | src/hooks/use-active-heading.test.ts > useActiveHeading > アクティブな見出しの更新 > 複数の要素が交差した時、最後の要素のIDが使われること
An update to TestComponent inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://react.dev/link/wrap-tests-with-act
An update to TestComponent inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://react.dev/link/wrap-tests-with-act

stderr | src/hooks/use-active-heading.test.ts > useActiveHeading > エッジケース > 同じ見出しIDが複数回交差してもactiveIdは同じであること
An update to TestComponent inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://react.dev/link/wrap-tests-with-act
An update to TestComponent inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://react.dev/link/wrap-tests-with-act

 ✓ src/hooks/use-active-heading.test.ts (16 tests) 253ms
 ✓ src/component/header.test.tsx (8 tests) 537ms
   ✓ Header > PDF機能 > クリックで onDownloadPdf が呼ばれること  318ms
stderr | src/component/pdf-export.test.tsx > SkillSheetPDF > should render PDF document with title
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
The tag <TEXT> is unrecognized in this browser. If you meant to render a React component, start its name with an uppercase letter.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
The tag <VIEW> is unrecognized in this browser. If you meant to render a React component, start its name with an uppercase letter.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
React does not recognize the `minPresenceAhead` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `minpresenceahead` instead. If you accidentally passed it from a parent component, remove it from the DOM element.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
Received `true` for a non-boolean attribute `fixed`.

If you want to write it to the DOM, pass a string instead: fixed="true" or fixed={value.toString()}.
Invalid value for prop `render` on <TEXT> tag. Either remove it from the element, or pass a string or number value to keep it in the DOM. For details, see https://react.dev/link/attribute-behavior 
<PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
The tag <PAGE> is unrecognized in this browser. If you meant to render a React component, start its name with an uppercase letter.
<DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
The tag <DOCUMENT> is unrecognized in this browser. If you meant to render a React component, start its name with an uppercase letter.

stderr | src/component/pdf-export.test.tsx > SkillSheetPDF > should handle empty content
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.

stderr | src/component/pdf-export.test.tsx > SkillSheetPDF > should handle content with only headings
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.

stderr | src/component/pdf-export.test.tsx > SkillSheetPDF > should handle content with lists
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.

stderr | src/component/pdf-export.test.tsx > SkillSheetPDF > should handle content with code blocks
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.

stderr | src/component/pdf-export.test.tsx > SkillSheetPDF > should handle content with blockquotes
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.

stderr | src/component/pdf-export.test.tsx > SkillSheetPDF > should handle content with horizontal rules
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.

stderr | src/component/pdf-export.test.tsx > SkillSheetPDF > should handle content with inline markdown
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<LINK /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.

stderr | src/component/pdf-export.test.tsx > SkillSheetPDF > should handle complex mixed content
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.

stderr | src/component/pdf-export.test.tsx > SkillSheetPDF > should render with special characters in title
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.

stderr | src/component/pdf-export.test.tsx > SkillSheetPDF > should handle very long content
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.

 ✓ src/component/pdf-export.test.tsx (11 tests) 500ms
 ✓ src/component/table-of-contents.test.tsx (5 tests) 895ms
 ✓ src/component/code-block.test.tsx (8 tests) 1006ms
   ✓ CodeBlock > レンダリング > 言語ラベルが表示されること  408ms
   ✓ CodeBlock > コピー機能 > ボタン押下でクリップボードにコードが書き込まれること  356ms
 ✓ app/builder/builder-client.test.tsx (5 tests) 888ms
   ✓ BuilderClient > 「ブロック追加」で空ブロックが増える  428ms
 ✓ src/component/skill-sheet-viewer.test.tsx (1 test) 132ms
stderr | src/component/pdf/skill-sheet-document.test.tsx > SkillSheetDocument > ページ高さを超えうる大きなテーブルを含む内容でもスローせず描画できる
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
The tag <TEXT> is unrecognized in this browser. If you meant to render a React component, start its name with an uppercase letter.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
The tag <VIEW> is unrecognized in this browser. If you meant to render a React component, start its name with an uppercase letter.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
React does not recognize the `minPresenceAhead` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `minpresenceahead` instead. If you accidentally passed it from a parent component, remove it from the DOM element.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
Received `true` for a non-boolean attribute `wrap`.

If you want to write it to the DOM, pass a string instead: wrap="true" or wrap={value.toString()}.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
Received `true` for a non-boolean attribute `fixed`.

If you want to write it to the DOM, pass a string instead: fixed="true" or fixed={value.toString()}.
Invalid value for prop `render` on <TEXT> tag. Either remove it from the element, or pass a string or number value to keep it in the DOM. For details, see https://react.dev/link/attribute-behavior 
<PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
The tag <PAGE> is unrecognized in this browser. If you meant to render a React component, start its name with an uppercase letter.
<DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
The tag <DOCUMENT> is unrecognized in this browser. If you meant to render a React component, start its name with an uppercase letter.

stderr | src/component/pdf/skill-sheet-document.test.tsx > SkillSheetDocument > 段落内ソフト改行を含む複数行パラグラフを描画できる
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<VIEW /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<TEXT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<PAGE /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.
<DOCUMENT /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.

 ✓ src/component/pdf/skill-sheet-document.test.tsx (5 tests) 161ms

 Test Files  9 passed (9)
      Tests  68 passed (68)
   Start at  15:14:00
   Duration  18.25s (transform 1.49s, setup 3.74s, collect 8.03s, tests 4.46s, environment 12.34s, prepare 1.89s)

```

## pnpm install --lockfile-only --offline
```
 WARN  Unsupported engine: wanted: {"node":"22.x"} (current: {"node":"v20.20.2","pnpm":"10.33.0"})
Scope: all 3 workspace projects
Progress: resolved 1, reused 0, downloaded 0, added 0
/workspace/skillsheet-viewer/apps/web:
 ERR_PNPM_NO_OFFLINE_META  Failed to resolve tailwindcss-animate@>=1.0.7 <2.0.0-0 in package mirror /root/.cache/pnpm/metadata-v1.3/registry.npmjs.org/tailwindcss-animate.json

This error happened while installing a direct dependency of /workspace/skillsheet-viewer/apps/web
Progress: resolved 51, reused 0, downloaded 0, added 0
```
