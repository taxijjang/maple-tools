import { parseTooltip, parsePrice, parseTradeDate } from './parse'
import { getItem, putItem, mergeItem, searchNames, type Env, type Trade } from './store'
import PAGE from './page.html'

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json; charset=utf-8' },
  })

/**
 * 수집 앱이 검색 한 번의 결과를 통째로 올린다.
 *
 * 원문(OCR raw text)을 그대로 받아 서버에서 파싱한다 — 확성기 프로젝트와 같은 이유다.
 * 파싱 규칙이 바뀌어도 앱을 다시 배포할 필요가 없다. 다만 이 프로젝트는 raw를
 * 저장해두지 않는다(문서가 아이템당 하나뿐이라 재수집 원문을 쌓아둘 이유가 적다) —
 * 파싱이 틀렸으면 다음 수집 때 다시 걷어오면 된다.
 */
type IngestRow = { tooltipRaw: string; priceRaw: string; tradeDateRaw: string }
type IngestBody = { itemName: string; rows: IngestRow[] }

async function ingest(req: Request, env: Env): Promise<Response> {
  if (req.headers.get('x-ingest-secret') !== env.INGEST_SECRET) {
    return json({ error: 'unauthorized' }, 401)
  }
  let body: IngestBody
  try { body = await req.json() } catch { return json({ error: 'bad json' }, 400) }
  if (typeof body.itemName !== 'string' || !Array.isArray(body.rows)) {
    return json({ error: 'itemName and rows required' }, 400)
  }

  const now = Date.now()
  const trades: Trade[] = []
  let reqLevel: number | null = null
  let equipSlot: string | null = null
  let baseStats: Record<string, string> = {}

  for (const row of body.rows) {
    if (typeof row.tooltipRaw !== 'string' || typeof row.priceRaw !== 'string') continue
    const t = parseTooltip(row.tooltipRaw)
    const price = parsePrice(row.priceRaw)
    if (price === null) continue
    // 고정 스탯은 이 검색 안에서 가장 먼저 파싱에 성공한 행 것을 쓴다 — 매물마다 같아야
    // 정상이라 어느 행 것이든 상관없다.
    if (reqLevel === null && t.reqLevel !== null) reqLevel = t.reqLevel
    if (equipSlot === null && t.equipSlot !== null) equipSlot = t.equipSlot
    if (Object.keys(baseStats).length === 0 && Object.keys(t.baseStats).length > 0) {
      baseStats = t.baseStats
    }
    trades.push({
      grade: t.grade,
      potential: t.potential,
      price,
      tradedAt: parseTradeDate(row.tradeDateRaw ?? ''),
      collectedAt: now,
    })
  }
  if (trades.length === 0) return json({ error: 'no valid rows' }, 400)

  const existing = await getItem(env, body.itemName)
  const doc = mergeItem(existing, { name: body.itemName, reqLevel, equipSlot, baseStats, trades }, now)
  await putItem(env, doc)
  return json({ item: doc.name, trades: doc.trades.length, added: trades.length })
}

async function itemDetail(name: string, env: Env): Promise<Response> {
  const doc = await getItem(env, name)
  if (!doc) return json({ error: 'not found' }, 404)
  return json(doc)
}

async function search(url: URL, env: Env): Promise<Response> {
  const q = url.searchParams.get('q')?.trim() ?? ''
  const names = await searchNames(env, q)
  return json({ names })
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/ingest' && req.method === 'POST') return ingest(req, env)
    if (url.pathname === '/api/search') return search(url, env)
    const itemMatch = url.pathname.match(/^\/api\/items\/(.+)$/)
    if (itemMatch) return itemDetail(decodeURIComponent(itemMatch[1]), env)
    if (url.pathname === '/') {
      return new Response(PAGE, {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      })
    }
    return new Response('not found', { status: 404 })
  },
}
