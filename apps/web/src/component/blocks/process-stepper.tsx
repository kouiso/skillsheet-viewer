'use client';

import { PROCESS_LABELS } from '@skillsheet/db/process';
import { Check, Circle } from 'lucide-react';

interface ProcessStepperProps {
  /** normalizeProcess() の done（7要素）。 */
  done: boolean[];
  /** true: ラベル非表示・バーのみのコンパクト表示。 */
  compact?: boolean;
}

// 7段SDLCモデルの担当工程ステッパー。担当あり/なし はアイコン＋色で区別する。
//
// 320px 幅では 7 列だと1カラムあたり数十px しか残らず、break-keep があっても
// [overflow-wrap:anywhere] が優先されて「要件定義」が1文字ずつ縦積みになっていた
// （#144）。process-overview.tsx の7ドーナツ俯瞰と同じ grid-cols-4 → sm:grid-cols-7
// のブレークポイントに揃え、狭幅では2段に折り返してカラム幅を確保する。
export function ProcessStepper({ done, compact = false }: ProcessStepperProps) {
  return (
    <div className="grid grid-cols-4 items-end gap-x-1.5 gap-y-3 sm:grid-cols-7">
      {PROCESS_LABELS.map((label, i) => {
        const isDone = done?.[i] ?? false;
        const title = isDone ? `${label}：経験あり` : `${label}：未経験`;
        const StatusIcon = isDone ? Check : Circle;
        return (
          <div key={label} className="flex min-w-0 flex-col items-center gap-1">
            {!compact && (
              <span
                title={title}
                className={`flex items-center justify-center gap-0.5 break-keep text-center font-mono text-[10px] leading-tight ${isDone ? 'text-accent-text' : 'text-faint'}`}
              >
                <StatusIcon className="size-2.5 shrink-0" aria-hidden="true" />
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
              className={`w-full rounded-[var(--bar-round)] ${compact ? 'h-[7px]' : 'h-[9px]'} ${
                isDone ? 'bg-primary' : 'bg-track'
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}
