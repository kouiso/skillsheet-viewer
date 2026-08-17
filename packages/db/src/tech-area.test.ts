import { describe, expect, it } from 'vitest';
import type { ProjectTech } from './blocks';
import { deriveTechAreas, projectAreaLabel } from './tech-area';

const tech = (partial: Partial<ProjectTech>): ProjectTech => ({
  lang: [],
  fw: [],
  db: [],
  infra: [],
  tools: [],
  collab: [],
  ...partial,
});

describe('deriveTechAreas', () => {
  it('バージョン・内訳つきの表記でも部分一致で拾う', () => {
    expect(
      deriveTechAreas(
        tech({
          lang: ['TypeScript'],
          fw: ['Next.js 15 (App Router, React Compiler)'],
          infra: ['AWS (ECS / ECR, RDS, S3)', 'Terraform'],
        }),
      ),
    ).toEqual(['Web', 'インフラ']);
  });

  it('React Native は iOS / Android と判定し、Web には数えない', () => {
    expect(deriveTechAreas(tech({ fw: ['React Native', 'Expo (expo-router / EAS)'] }))).toEqual(['iOS', 'Android']);
  });

  it('React 本体が別途あれば Web も付く', () => {
    expect(deriveTechAreas(tech({ fw: ['React Native', 'React 18'] }))).toEqual(['iOS', 'Android', 'Web']);
  });

  it('クラウド名だけではインフラと判定しない（デプロイ先の記載と区別できないため）', () => {
    expect(deriveTechAreas(tech({ lang: ['Dart'], fw: ['Flutter'], infra: ['GCP', 'Firebase'] }))).toEqual([
      'iOS',
      'Android',
    ]);
  });

  it('IaC が書かれていればインフラと判定する', () => {
    expect(deriveTechAreas(tech({ infra: ['GCP', 'Terraform'] }))).toEqual(['インフラ']);
  });

  it('デスクトップ組み込みブラウザはデスクトップと判定する', () => {
    expect(deriveTechAreas(tech({ lang: ['C#'], fw: ['CefSharp', 'React (Hooks)'] }))).toEqual(['Web', 'デスクトップ']);
  });

  it('判定材料が tools / collab / db にしか無い場合は空（誤検出を避ける）', () => {
    expect(deriveTechAreas(tech({ db: ['PostgreSQL'], tools: ['Jest'], collab: ['Slack'] }))).toEqual([]);
  });

  it('tech が未定義でも落ちない', () => {
    expect(deriveTechAreas(undefined)).toEqual([]);
  });

  it('並び順は案件によらず安定する', () => {
    const a = deriveTechAreas(tech({ infra: ['Terraform'], fw: ['Nest.js', 'React'] }));
    const b = deriveTechAreas(tech({ fw: ['React', 'Nest.js'], infra: ['Terraform'] }));
    expect(a).toEqual(b);
    expect(a).toEqual(['Web', 'バックエンド', 'インフラ']);
  });
});

describe('projectAreaLabel', () => {
  it('元シートから取り込んだ担当領域があればそれを優先する', () => {
    expect(projectAreaLabel('要件定義 / PM', tech({ fw: ['React'] }))).toBe('要件定義 / PM');
  });

  it('空白のみの取り込み値は未入力として扱い、技術スタックから導出する', () => {
    expect(projectAreaLabel('   ', tech({ fw: ['React'] }))).toBe('Web');
  });

  it('導出結果が無ければ空文字（描画側で行ごと落とす）', () => {
    expect(projectAreaLabel('', tech({ tools: ['Jest'] }))).toBe('');
  });
});
