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
  const data = (await res.json()) as { content: string }
  return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8')
}

type Db = ReturnType<typeof getDb>

async function ensureSeeded(db: Db): Promise<string> {
  const existing = await db.select().from(skillSheets).where(eq(skillSheets.ownerId, OWNER_ID)).limit(1)
  let sheetId = existing[0]?.id
  if (!sheetId) {
    const inserted = await db
      .insert(skillSheets)
      .values({ ownerId: OWNER_ID, title: TITLE })
      .returning({ id: skillSheets.id })
    sheetId = inserted[0].id
  }

  const existingBlocks = await db.select({ id: blocks.id }).from(blocks).where(eq(blocks.sheetId, sheetId)).limit(1)
  if (existingBlocks.length === 0) {
    const markdown = await fetchSeedMarkdownFromGitHub()
    const segments = splitMarkdownIntoBlocks(markdown)
    if (segments.length > 0) {
      await db.insert(blocks).values(
        segments.map((data, order) => ({
          sheetId,
          type: 'markdown',
          order,
          data,
        })),
      )
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
  try {
    const db = getDb()
    const sheetId = await ensureSeeded(db)
    const rows = await db
      .select()
      .from(blocks)
      .where(eq(blocks.sheetId, sheetId))
      .orderBy(asc(blocks.order))

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
