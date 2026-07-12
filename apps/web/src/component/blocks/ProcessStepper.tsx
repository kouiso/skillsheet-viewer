'use client';

import { PROCESS_LABELS } from '@skillsheet/db/process';

interface ProcessStepperProps {
  /** normalizeProcess() の done（7要素）。 */
  done: boolean[];
  /** normalizeProcess() の uncertain（7要素）。done と同時に true にはならない。 */
  uncertain: boolean[];
  /** true: ラベル非表示・バーのみのコンパクト表示。 */
  compact?: boolean;
}

// 7段SDLCモデルの担当工程ステッパー。done/uncertain/対象外 の3状態を視覚的に区別する。
export function ProcessStepper({ done, uncertain, compact = false }: ProcessStepperProps) {
  return (
    <div className="flex items-end gap-1.5">
      {PROCESS_LABELS.map((label, i) => {
        const isDone = done?.[i] ?? false;
        const isUncertain = uncertain?.[i] ?? false;
        const title = isDone
          ? `${label}：経験あり`
          : isUncertain
            ? `${label}：実施（詳細区分は本文だけでは不明）`
            : label;
        return (
          <div key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            {!compact && (
              <span
                className={`break-keep text-center font-mono text-[10px] leading-tight [overflow-wrap:anywhere] ${isDone || isUncertain ? 'text-accent-text' : 'text-faint'}`}
              >
                {/* 狭幅では「・」の直後だけで折り返す（語中の「実装・単/体」折れを防ぐ）。 */}
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
              </span>
            )}
            <span
              title={title}
              className={`h-[7px] w-full rounded-[var(--bar-round)] ${
                isDone ? 'bg-primary' : isUncertain ? 'bg-primary/40' : 'bg-track'
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}
