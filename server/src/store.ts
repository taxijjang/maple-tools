import type { Grade } from './parse'

export type Env = {
  ITEMS: R2Bucket
  INGEST_SECRET: string
}

export type Trade = {
  grade: Grade | null
  potential: string[]
  price: number
  tradedAt: string | null   // "2026-09-15" — 게임 안에서 거래된 날짜
  collectedAt: number       // 저희가 이 매물을 읽은 시각 (ms epoch)
}

export type ItemDoc = {
  name: string
  category: '장비'
  reqLevel: number | null
  equipSlot: string | null
  baseStats: Record<string, string>
  trades: Trade[]
  updatedAt: number
}

const key = (name: string) => `items/${name}.json`

/** 한 아이템 문서를 읽는다. 없으면 null. */
export async function getItem(env: Env, name: string): Promise<ItemDoc | null> {
  const obj = await env.ITEMS.get(key(name))
  return obj ? obj.json<ItemDoc>() : null
}

const MAX_TRADES = 300      // 한 아이템 문서에 담아둘 최근 매물 수 상한
const RETENTION_MS = 60 * 24 * 60 * 60 * 1000   // 60일 — 장비 시세는 확성기보다 천천히 바뀐다

/**
 * 새로 읽은 매물을 기존 문서에 합친다.
 *
 * 고정 스탯(reqLevel, equipSlot, baseStats)은 새로 온 값으로 덮는다 — 같은 아이템이면
 * 항상 같아야 정상이고, 다르면 최신 OCR이 더 나을 가능성이 높다. trades는 이어붙이고
 * 오래되거나 너무 많으면 잘라낸다. 완전히 같은 매물(가격·거래일·잠재능력 전부 동일)이
 * 중복으로 들어오는 걸 막는다 — 같은 검색을 두 번 수집했을 때 대비.
 */
export function mergeItem(existing: ItemDoc | null, incoming: {
  name: string
  reqLevel: number | null
  equipSlot: string | null
  baseStats: Record<string, string>
  trades: Trade[]
}, now: number): ItemDoc {
  const seen = new Set(
    (existing?.trades ?? []).map(t => `${t.price}|${t.tradedAt}|${t.potential.join(',')}`)
  )
  const fresh = incoming.trades.filter(t => {
    const k = `${t.price}|${t.tradedAt}|${t.potential.join(',')}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  const merged = [...fresh, ...(existing?.trades ?? [])]
    .filter(t => now - t.collectedAt < RETENTION_MS)
    .slice(0, MAX_TRADES)

  return {
    name: incoming.name,
    category: '장비',
    reqLevel: incoming.reqLevel,
    equipSlot: incoming.equipSlot,
    baseStats: incoming.baseStats,
    trades: merged,
    updatedAt: now,
  }
}

export async function putItem(env: Env, doc: ItemDoc): Promise<void> {
  await env.ITEMS.put(key(doc.name), JSON.stringify(doc), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  })
}

/**
 * 아이템 이름에 부분 문자열이 들어간 것만 찾는다.
 *
 * R2에는 SQL이 없으니 목록을 전부 읽어와 메모리에서 거른다. 아이템 종류가 수백 개
 * 수준이면 이 방식으로 충분하고, list()가 페이지당 1000개까지 주므로 그 규모에서는
 * 한 번에 다 온다. 수만 개로 늘면 별도 색인이 필요하다 — 지금은 아니다.
 */
export async function searchNames(env: Env, q: string, limit = 50): Promise<string[]> {
  const names: string[] = []
  let cursor: string | undefined
  do {
    const page = await env.ITEMS.list({ prefix: 'items/', cursor, limit: 1000 })
    for (const o of page.objects) {
      const name = o.key.slice('items/'.length, -'.json'.length)
      if (!q || name.includes(q)) names.push(name)
    }
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor && names.length < limit * 4)  // 넉넉히 모으고 아래서 자른다
  return names.slice(0, limit)
}
