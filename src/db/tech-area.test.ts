import { describe, expect, it } from 'vitest';
import type { ProjectTech } from './blocks';
import { deriveTechAreas, projectAreaText, resolveProjectArea } from './tech-area';

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

  it('短いキーは語として一致しない限り根拠にしない（Vite plugin が gin に化けない）', () => {
    expect(deriveTechAreas(tech({ fw: ['Vite plugin', 'Echobot'] }))).toEqual([]);
  });

  it('短いキーが語として現れればバックエンドと判定する', () => {
    expect(deriveTechAreas(tech({ lang: ['Go'], fw: ['Gin'] }))).toEqual(['バックエンド']);
    expect(deriveTechAreas(tech({ fw: ['Echo (Go)'] }))).toEqual(['バックエンド']);
  });

  it('誤検出語を含む 1 セル記述でも、同じセルの他の技術は評価する', () => {
    expect(deriveTechAreas(tech({ fw: ['React Native + Tailwind'] }))).toEqual(['iOS', 'Android', 'Web']);
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

describe('resolveProjectArea', () => {
  it('元シートから取り込んだ担当領域を優先し、導出ではないと示す', () => {
    expect(resolveProjectArea('要件定義 / PM', tech({ fw: ['React'] }))).toEqual({
      text: '要件定義 / PM',
      derived: false,
    });
  });

  it('空白のみの取り込み値は未入力として扱い、導出値として返す', () => {
    expect(resolveProjectArea('   ', tech({ fw: ['React'] }))).toEqual({ text: 'Web', derived: true });
  });

  it('導出結果が無ければ空文字（描画側で行ごと落とす）', () => {
    expect(resolveProjectArea('', tech({ tools: ['Jest'] }))).toEqual({ text: '', derived: true });
  });

  // 由来を落とした文字列だけを返す API を残すと、描画側がラベル無しで出せてしまう。
  // 検索インデックス用の projectAreaText は由来を必要としない用途に限る。
  it('projectAreaText は文字列のみを返す', () => {
    expect(projectAreaText('', tech({ fw: ['React'] }))).toBe('Web');
    expect(projectAreaText('要件定義', tech({ fw: ['React'] }))).toBe('要件定義');
  });
});
