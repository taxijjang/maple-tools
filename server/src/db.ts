import type { Grade } from './parse'

export type Env = {
  DB: D1Database
  INGEST_SECRET: string
}

export type Trade = {
  grade: Grade | null
  potential: string[]
  price: number
  tradedAt: string | null
  collectedAt: number
}

export type ItemDoc = {
  name: string
  reqLevel: number | null
  equipSlot: string | null
  baseStats: Record<string, string>
  trades: Trade[]
  updatedAt: number
}

const MAX_TRADES = 300      // 한 아이템에 보관할 최근 매물 수 상한
const RETENTION_MS = 60 * 24 * 60 * 60 * 1000   // 60일 — 장비 시세는 확성기보다 천천히 바뀐다

/**
 * 검색 한 번의 결과를 저장한다.
 *
 * items는 UPSERT — 고정 스탯은 매물마다 같아야 정상이니 최신 값으로 덮는다.
 * trades는 INSERT OR IGNORE — UNIQUE(item_name, price, traded_at, potential)가
 * 중복을 걸러준다. 같은 검색을 두 번 수집해도 안전하다.
 */
export async function saveSearch(env: Env, itemName: string, incoming: {
  reqLevel: number | null
  equipSlot: string | null
  baseStats: Record<string, string>
  trades: Trade[]
}, now: number): Promise<number> {
  const stmts = [
    env.DB.prepare(
      `INSERT INTO items (name, req_level, equip_slot, base_stats, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(name) DO UPDATE SET
         req_level = excluded.req_level,
         equip_slot = excluded.equip_slot,
         base_stats = excluded.base_stats,
         updated_at = excluded.updated_at`
    ).bind(itemName, incoming.reqLevel, incoming.equipSlot, JSON.stringify(incoming.baseStats), now),
  ]

  const insertTrade = env.DB.prepare(
    `INSERT OR IGNORE INTO trades (item_name, grade, potential, price, traded_at, collected_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
  )
  for (const t of incoming.trades) {
    stmts.push(insertTrade.bind(itemName, t.grade, JSON.stringify(t.potential), t.price, t.tradedAt, t.collectedAt))
  }

  const results = await env.DB.batch(stmts)
  // items 갱신(첫 statement)은 항상 성공이니, 나머지 trades 결과의 changes 합이 실제로
  // 새로 들어간 행 수다 — IGNORE로 걸러진 중복은 changes가 0이다.
  return results.slice(1).reduce((sum, r) => sum + (r.meta.changes ?? 0), 0)
}

export async function getItem(env: Env, name: string): Promise<ItemDoc | null> {
  const item = await env.DB.prepare(
    'SELECT name, req_level, equip_slot, base_stats, updated_at FROM items WHERE name = ?1'
  ).bind(name).first<{
    name: string; req_level: number | null; equip_slot: string | null
    base_stats: string; updated_at: number
  }>()
  if (!item) return null

  const { results } = await env.DB.prepare(
    `SELECT grade, potential, price, traded_at, collected_at FROM trades
     WHERE item_name = ?1 ORDER BY collected_at DESC, id DESC LIMIT ?2`
  ).bind(name, MAX_TRADES).all<{
    grade: Grade | null; potential: string; price: number
    traded_at: string | null; collected_at: number
  }>()

  return {
    name: item.name,
    reqLevel: item.req_level,
    equipSlot: item.equip_slot,
    baseStats: JSON.parse(item.base_stats),
    updatedAt: item.updated_at,
    trades: results.map(r => ({
      grade: r.grade, potential: JSON.parse(r.potential),
      price: r.price, tradedAt: r.traded_at, collectedAt: r.collected_at,
    })),
  }
}

/** 이름에 부분 문자열이 들어간 아이템만 찾는다. */
export async function searchNames(env: Env, q: string, limit = 50): Promise<string[]> {
  const { results } = await env.DB.prepare(
    'SELECT name FROM items WHERE name LIKE ?1 ORDER BY name LIMIT ?2'
  ).bind(`%${q.replace(/[%_]/g, c => '\\' + c)}%`, limit).all<{ name: string }>()
  return results.map(r => r.name)
}

/**
 * 오래된 매물과 보관 상한을 넘는 매물을 지운다. 매일 한 번 크론으로 돌린다
 * (wrangler.toml의 scheduled).
 */
export async function purge(env: Env, now: number): Promise<number> {
  const old = await env.DB.prepare('DELETE FROM trades WHERE collected_at < ?1')
    .bind(now - RETENTION_MS).run()

  // 아이템별로 최근 MAX_TRADES건만 남긴다.
  const capped = await env.DB.prepare(
    `DELETE FROM trades WHERE id NOT IN (
       SELECT id FROM trades t2 WHERE t2.item_name = trades.item_name
       ORDER BY t2.collected_at DESC, t2.id DESC LIMIT ?1
     )`
  ).bind(MAX_TRADES).run()

  return (old.meta.changes ?? 0) + (capped.meta.changes ?? 0)
}
