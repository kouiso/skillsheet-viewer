'use client';

import type { CompanyInfo, ProjectItem } from '@skillsheet/db/blocks';
import { flattenTech, normalizeProcess, PROCESS_LABELS } from '@skillsheet/db/process';

interface ProjectPreviewProps {
  project: ProjectItem;
  company: CompanyInfo | undefined;
  /**
   * 閲覧側での通し番号。非表示（自分または会社が hidden）の場合も
   * 「表示されたと仮定したときの番号」を渡す — カードの見た目を維持しつつ
   * バッジで非表示であることを明示する。
   */
  no: number;
  /** いま編集中の欄に対応するキー。この箇所を光らせる。 */
  syncKey?: string | null;
  /** プレビューのこの箇所をクリック → フォームの対応欄へ飛ぶ。 */
  onJump?: (syncKey: string) => void;
}

/** 技術チップは多すぎると縦に伸びてカードの形が崩れるため、この件数で打ち切って残数を出す。 */
const MAX_TECH_CHIPS = 16;

/**
 * 右ペイン：ライブプレビュー。
 *
 * 閲覧側の案件カードと同じ情報を、エディタ幅（396px）に収まる密度で再構成したもの。
 * 各ブロックはクリックでフォームの対応欄へ飛び、逆にフォームを編集すると光る（同期ジャンプ）。
 * hidden（案件自身 or 所属会社）の場合は「閲覧側では非表示」バッジを添える。
 */
export const ProjectPreview = ({ project, company, no, syncKey, onJump }: ProjectPreviewProps) => {
  const hidden = Boolean(project.hidden || company?.hidden);
  const tech = flattenTech(project.tech);
  const shownTech = tech.slice(0, MAX_TECH_CHIPS);
  const process = normalizeProcess(project.process);
  const summary = project.summary?.trim() || project.duties.trim();

  /** クリックとキーボードの両方で飛べる同期ブロック。 */
  const sync = (key: string) => ({
    className: `pv-sync${syncKey === key ? ' on' : ''}`,
    'data-sync-pv': key,
    role: 'button' as const,
    tabIndex: 0,
    title: '編集欄へ移動',
    onClick: () => onJump?.(key),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      onJump?.(key);
    },
  });

  return (
    <div className="preview-inner">
      <div className="flex items-center gap-2">
        <span className="kicker">Live Preview · 閲覧時の見え方</span>
        {hidden && <span className="pv-hidden">閲覧側では非表示</span>}
      </div>
      <p className="pv-hint">各ブロックをクリックすると、その項目の編集欄へ移動します。</p>

      <div className={`pv-card${hidden ? ' opacity-60' : ''}`}>
        <div className="pv-top">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="pv-no">{no > 0 ? String(no).padStart(2, '0') : '––'}</span>
              <span {...sync('period')}>
                <span className="pv-period">{project.period || '期間未入力'}</span>
              </span>
            </div>
            <div {...sync('title')}>
              <h3 className="pv-title">{project.title || '（無題の案件）'}</h3>
            </div>
            <div {...sync('scope')}>
              <div className="pv-scope">{project.scope || 'スコープ未入力'}</div>
            </div>
          </div>
          <div {...sync('meta')}>
            <div className="pv-meta">
              {project.role || '役割未設定'}
              <div className="m2">
                {[company?.name, project.team && `${project.team}名`, project.duration].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
        </div>

        {/* 要約は summary 欄の値を優先し、空のときだけ担当業務で代替する。
            飛び先も表示元に合わせる（同じキーを2箇所に出すと、同期ジャンプが先に見つけた
            方へ飛んで誤爆する）。 */}
        {summary && (
          <div {...sync(project.summary?.trim() ? 'summary' : 'duties')}>
            <p className="pv-summary">{summary}</p>
          </div>
        )}

        {shownTech.length > 0 && (
          <div {...sync('tech')}>
            <div className="pv-tech">
              {shownTech.map((t) => (
                <span key={t}>{t}</span>
              ))}
              {tech.length > shownTech.length && <span>+{tech.length - shownTech.length}</span>}
            </div>
          </div>
        )}

        <div className="pv-proc-wrap">
          <div {...sync('process')}>
            <div className="pv-proc">
              {PROCESS_LABELS.map((label, i) => (
                <div key={label} className="pp">
                  <span className="lbl" style={{ color: process.done[i] ? 'var(--accent-text)' : 'var(--faint)' }}>
                    {label}
                  </span>
                  <span className="bar" style={{ background: process.done[i] ? 'var(--primary)' : 'var(--track)' }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {(
        [
          ['duties', '≪担当業務≫', project.duties],
          ['acquired', '≪習得スキル・実績≫', project.acquired],
          ['comment', '≪コメント≫', project.comment],
        ] as const
      ).map(([key, heading, body]) =>
        body.trim() ? (
          <div key={key} className="pv-block">
            <div {...sync(key)}>
              <div className="bt">{heading}</div>
              <div className="bc">{body}</div>
            </div>
          </div>
        ) : null,
      )}
    </div>
  );
};
