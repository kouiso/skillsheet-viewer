import type { VercelRequest, VercelResponse } from '@vercel/node'

import { neon } from '@neondatabase/serverless'
import { asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/neon-http'

import { blocks, skillSheets } from '../drizzle/schema'
import { blocksToMarkdown, splitMarkdownIntoBlocks, type Block } from '../src/lib/blocks'

const OWNER_ID = 'kouiso'
const TITLE = 'エンジニアスキルシート'

function getDb() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return drizzle(neon(url), { schema: { skillSheets, blocks } })
}

/**
 * サーバ側の閲覧認可チェック。
 * 既存のビューア認証（VITE_VIEWER_CODE）と同じ共有コードを `x-viewer-code` ヘッダで要求する。
 * これにより `/api/skillsheet` への直接 GET で無認可に内容が取得されるのを防ぐ
 * （/view のクライアント認証と同等の保護。per-user の本格認証は後続フェーズで JWT 化）。
 * VITE_VIEWER_CODE が未設定の環境では認証無効とみなしスキップする。
 */
function isAuthorized(req: VercelRequest): boolean {
  const code = process.env.VITE_VIEWER_CODE
  if (!code) return true
  const provided = req.headers['x-viewer-code']
  return provided === code
}

// 初回シード用に、既存の GitHub プライベートリポジトリから Markdown を取得する（サーバ側）。
// クライアントにトークンを露出しないよう、関数内で VITE_GITHUB_* env を利用する。
async function fetchSeedMarkdownFromGitHub(): Promise<string> {
  const token = process.env.VITE_GITHUB_TOKEN
  const owner = process.env.VITE_GITHUB_OWNER
  const repo = process.env.VITE_GITHUB_REPO
  const filePath = process.env.VITE_GITHUB_FILE_PATH || 'skillsheet.md'
  const branch = process.env.VITE_GITHUB_BRANCH || 'main'
  if (!token || !owner || !repo) {
    throw new Error('GitHub seed source is not configured (VITE_GITHUB_TOKEN/OWNER/REPO)')
  }
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Skill-Sheet-Viewer',
    },
  })
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`)
  const data = (await res.json()) as { content?: unknown }
  if (typeof data.content !== 'string') {
    throw new Error('GitHub API response does not contain a content string (not a file?)')
  }
  return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8')
}

type Db = ReturnType<typeof getDb>

async function getOrCreateSheetId(db: Db): Promise<string> {
  const existing = await db.select({ id: skillSheets.id }).from(skillSheets).where(eq(skillSheets.ownerId, OWNER_ID)).limit(1)
  if (existing[0]?.id) return existing[0].id

  // owner_id ユニーク制約 + onConflictDoNothing で同時リクエストの重複作成を防ぐ
  const inserted = await db
    .insert(skillSheets)
    .values({ ownerId: OWNER_ID, title: TITLE })
    .onConflictDoNothing()
    .returning({ id: skillSheets.id })
  if (inserted[0]?.id) return inserted[0].id

  // 競合で他リクエストが先に作成した場合は再取得
  const retry = await db.select({ id: skillSheets.id }).from(skillSheets).where(eq(skillSheets.ownerId, OWNER_ID)).limit(1)
  return retry[0].id
}

async function ensureSeeded(db: Db): Promise<string> {
  const sheetId = await getOrCreateSheetId(db)

  const existingBlocks = await db.select({ id: blocks.id }).from(blocks).where(eq(blocks.sheetId, sheetId)).limit(1)
  if (existingBlocks.length === 0) {
    const markdown = await fetchSeedMarkdownFromGitHub()
    const segments = splitMarkdownIntoBlocks(markdown)
    if (segments.length > 0) {
      // (sheet_id, order) ユニーク制約 + onConflictDoNothing で同時シードの重複挿入を防ぐ
      await db
        .insert(blocks)
        .values(segments.map((data, order) => ({ sheetId, type: 'markdown', order, data })))
        .onConflictDoNothing()
    }
  }
  return sheetId
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    const db = getDb()
    const sheetId = await ensureSeeded(db)
    const rows = await db.select().from(blocks).where(eq(blocks.sheetId, sheetId)).orderBy(asc(blocks.order))

    const blockList: Block[] = rows.map((r) => ({
      id: r.id,
      type: r.type as Block['type'],
      order: r.order,
      data: r.data as Block['data'],
    }))

    res.status(200).json({ title: TITLE, content: blocksToMarkdown(blockList), blocks: blockList })
  } catch (err) {
    console.error('GET /api/skillsheet failed:', err)
    res.status(500).json({ error: 'Failed to load skill sheet' })
  }
}
