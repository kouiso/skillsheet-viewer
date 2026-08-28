interface ProcessLabelPartsProps {
  label: string;
}

/**
 * 「・」区切りの工程ラベル（例: 「実装・単体」「保守・運用」）を、「・」の直後にだけ
 * 改行可能な `<wbr />` を挟んで描画する。呼び出し側の要素に `break-keep` を付けて
 * 組み合わせることで、狭幅でも語中（「実装・単/体」等）では折れず、「・」の直後でだけ
 * 折り返せるようにする。ラップ用の要素は持たず、呼び出し側の span にそのまま展開する
 * （process-stepper.tsx と process-overview.tsx で既存の DOM 構造・スタイリングを崩さず
 * 共有するため）。
 *
 * process-stepper.tsx と process-overview.tsx が同じ折り返し要件を持つため、
 * 重複実装を避けてここに集約する（#152 S-5: ProcessOverview 側に未適用だった）。
 */
export function ProcessLabelParts({ label }: ProcessLabelPartsProps) {
  return (
    <>
      {label.split('・').map((part, j, parts) => {
        // 配列indexをkeyへ使わず、先頭からの累積文字列（各要素で自然に一意）を使う。
        const cumulativeKey = parts.slice(0, j + 1).join('・');
        return j < parts.length - 1 ? (
          <span key={cumulativeKey}>
            {part}・<wbr />
          </span>
        ) : (
          <span key={cumulativeKey}>{part}</span>
        );
      })}
    </>
  );
}
