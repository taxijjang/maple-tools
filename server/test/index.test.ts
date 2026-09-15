import { describe, it, expect } from 'vitest'
import worker from '../src/index'
import { fakeD1 } from './fakeD1'

const REAL_TOOLTIP = `검은색 허리띠
(유니크 아이템)
1회 교환 가능 (거래 후 교환 불가)

REQ LEV : 75
REQ STR : 0

장비분류 : 벨트
STR : +5
업그레이드 가능 횟수 : 3

INT : +12
DEX : +6%`

function makeEnv() {
  return { DB: fakeD1(), INGEST_SECRET: 'topsecret' }
}

describe('/ingest', () => {
  it('시크릿 없이는 401', async () => {
    const env = makeEnv()
    const res = await worker.fetch(
      new Request('https://x/ingest', { method: 'POST', body: '{}' }), env, {} as any)
    expect(res.status).toBe(401)
  })

  it('정상 요청을 저장하고, 조회하면 파싱된 값이 나온다', async () => {
    const env = makeEnv()
    const res = await worker.fetch(new Request('https://x/ingest', {
      method: 'POST',
      headers: { 'x-ingest-secret': 'topsecret' },
      body: JSON.stringify({
        itemName: '검은색 허리띠',
        rows: [{ tooltipRaw: REAL_TOOLTIP, priceRaw: '475,555,555 메소', tradeDateRaw: '26-09-15' }],
      }),
    }), env, {} as any)
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.added).toBe(1)

    const detail = await worker.fetch(
      new Request(`https://x/api/items/${encodeURIComponent('검은색 허리띠')}`), env, {} as any)
    const doc = await detail.json() as any
    expect(doc.reqLevel).toBe(75)
    expect(doc.equipSlot).toBe('벨트')
    expect(doc.trades[0]).toMatchObject({
      grade: '유니크', potential: ['INT : +12', 'DEX : +6%'],
      price: 475555555, tradedAt: '2026-09-15',
    })
  })

  it('가격을 못 읽는 행은 건너뛴다', async () => {
    const env = makeEnv()
    const res = await worker.fetch(new Request('https://x/ingest', {
      method: 'POST',
      headers: { 'x-ingest-secret': 'topsecret' },
      body: JSON.stringify({
        itemName: '검은색 허리띠',
        rows: [{ tooltipRaw: REAL_TOOLTIP, priceRaw: '메소', tradeDateRaw: '26-09-15' }],
      }),
    }), env, {} as any)
    expect(res.status).toBe(400)
  })
})

describe('/api/search', () => {
  it('부분 문자열로 이름을 찾는다', async () => {
    const env = makeEnv()
    await worker.fetch(new Request('https://x/ingest', {
      method: 'POST', headers: { 'x-ingest-secret': 'topsecret' },
      body: JSON.stringify({
        itemName: '검은색 허리띠',
        rows: [{ tooltipRaw: REAL_TOOLTIP, priceRaw: '100 메소', tradeDateRaw: '26-09-15' }],
      }),
    }), env, {} as any)
    const res = await worker.fetch(new Request('https://x/api/search?q=허리띠'), env, {} as any)
    const body = await res.json() as any
    expect(body.names).toEqual(['검은색 허리띠'])
  })
})

describe('/api/items/:name', () => {
  it('없는 아이템은 404', async () => {
    const env = makeEnv()
    const res = await worker.fetch(new Request('https://x/api/items/없음'), env, {} as any)
    expect(res.status).toBe(404)
  })
})
