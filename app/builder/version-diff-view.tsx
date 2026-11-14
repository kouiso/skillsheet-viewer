import { type DocumentDifference, formatLocation } from './version-diff';

// 板「版の履歴と2版の比較」: 前の値は「−」・地 dels・文字 del、後の値は「＋」・地 adds・文字 add。
// アプリに同じ役割の色（danger / danger-soft / accent-text / accent-soft）が既にあるので、それを使う。
const row = 'flex items-start gap-2 px-3 py-2 text-[13px] leading-[1.6]';
const tone = {
  del: `${row} bg-danger-soft text-danger`,
  add: `${row} bg-accent-soft text-accent-text`,
};

// 数値は IBM Plex Mono で出す。
const numeric = /^-?\d[\d,.]*$/;

function Line({ kind, text }: { kind: 'del' | 'add'; text: string }) {
  const Tag = kind === 'del' ? 'del' : 'ins';
  return (
    <div className={tone[kind]}>
      <span className="sr-only">{kind === 'del' ? '変更前' : '変更後'}</span>
      <span aria-hidden="true" className="w-3 shrink-0 text-center font-bold">
        {kind === 'del' ? '−' : '＋'}
      </span>
      <Tag className={`min-w-0 whitespace-pre-wrap break-words no-underline ${numeric.test(text) ? 'font-mono' : ''}`}>
        {text}
      </Tag>
    </div>
  );
}

/**
 * 変わった項目を、1項目1枠で全部並べる。見出し行に場所、その下に前（−）と後（＋）。
 * 値は引用符を付けず、改行は改行のまま出す。比較欄と、戻す前の確認の両方が使う。
 */
export function DiffFrames({
  differences,
  headingLevel = 3,
}: {
  differences: readonly DocumentDifference[];
  headingLevel?: 3 | 4;
}) {
  const Heading = headingLevel === 3 ? 'h3' : 'h4';
  return (
    <div className="space-y-3">
      {differences.map((d) => (
        <section key={d.key} className="min-w-0 overflow-hidden rounded-md border border-border bg-card">
          <Heading className="break-words bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
            {formatLocation(d.location)}
          </Heading>
          <Line kind="del" text={d.before} />
          <Line kind="add" text={d.after} />
        </section>
      ))}
    </div>
  );
}
