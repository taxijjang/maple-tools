import { describe, it, expect } from 'vitest'
import { saveSearch, getItem, searchNames, purge, type Trade, type Env } from '../src/db'
import { fakeD1 } from './fakeD1'

const trade = (over: Partial<Trade> = {}): Trade => ({
  grade: '유니크', potential: ['INT : +12'], price: 100, tradedAt: '2026-09-15',
  collectedAt: 1000, ...over,
})

const incoming = (trades: Trade[]) => ({
  reqLevel: 75, equipSlot: '벨트', baseStats: { STR: '+5' }, trades,
})

function makeEnv(): Env {
  return { DB: fakeD1(), INGEST_SECRET: 'x' }
}

describe('saveSearch + getItem', () => {
  it('저장한 뒤 그대로 읽힌다', async () => {
    const env = makeEnv()
    const added = await saveSearch(env, '검은색 허리띠', incoming([trade()]), 1000)
    expect(added).toBe(1)

    const doc = await getItem(env, '검은색 허리띠')
    expect(doc?.reqLevel).toBe(75)
    expect(doc?.equipSlot).toBe('벨트')
    expect(doc?.baseStats).toEqual({ STR: '+5' })
    expect(doc?.trades).toHaveLength(1)
    expect(doc?.trades[0]).toMatchObject({ price: 100, grade: '유니크', tradedAt: '2026-09-15' })
  })

  it('없는 아이템은 null', async () => {
    const doc = await getItem(makeEnv(), '없음')
    expect(doc).toBeNull()
  })

  it('가격·거래일·잠재능력이 전부 같은 매물은 중복으로 걸러진다 (UNIQUE 제약)', async () => {
    const env = makeEnv()
    await saveSearch(env, '검은색 허리띠', incoming([trade({ price: 100 })]), 1000)
    const added = await saveSearch(env, '검은색 허리띠', incoming([trade({ price: 100 })]), 2000)
    expect(added).toBe(0)
    const doc = await getItem(env, '검은색 허리띠')
    expect(doc?.trades).toHaveLength(1)
  })

  it('가격이 다르면 잠재능력이 같아도 다른 매물로 취급한다', async () => {
    const env = makeEnv()
    await saveSearch(env, '검은색 허리띠', incoming([trade({ price: 100 })]), 1000)
    const added = await saveSearch(env, '검은색 허리띠', incoming([trade({ price: 999 })]), 1000)
    expect(added).toBe(1)
    const doc = await getItem(env, '검은색 허리띠')
    expect(doc?.trades).toHaveLength(2)
  })

  it('고정 스탯은 새로 들어온 값으로 덮는다', async () => {
    const env = makeEnv()
    await saveSearch(env, '검은색 허리띠', incoming([trade()]), 1000)
    await saveSearch(env, '검은색 허리띠', { ...incoming([]), reqLevel: 80 }, 2000)
    const doc = await getItem(env, '검은색 허리띠')
    expect(doc?.reqLevel).toBe(80)
  })

  it('최신순으로 정렬해서 낸다', async () => {
    const env = makeEnv()
    await saveSearch(env, '검은색 허리띠', incoming([trade({ price: 1, collectedAt: 1000 })]), 1000)
    await saveSearch(env, '검은색 허리띠', incoming([trade({ price: 2, collectedAt: 2000 })]), 2000)
    const doc = await getItem(env, '검은색 허리띠')
    expect(doc?.trades.map(t => t.price)).toEqual([2, 1])
  })
})

describe('searchNames', () => {
  it('부분 문자열로 찾는다', async () => {
    const env = makeEnv()
    await saveSearch(env, '검은색 허리띠', incoming([trade()]), 1000)
    await saveSearch(env, '노란색 허리띠', incoming([trade()]), 1000)
    await saveSearch(env, '카오스 혼테일의 목걸이', incoming([trade()]), 1000)
    const names = await searchNames(env, '허리띠')
    expect(names.sort()).toEqual(['검은색 허리띠', '노란색 허리띠'])
  })

  it('%나 _가 들어간 검색어를 글자 그대로 다룬다', async () => {
    const env = makeEnv()
    await saveSearch(env, '아무 아이템', incoming([trade()]), 1000)
    const names = await searchNames(env, '%')
    expect(names).toEqual([])
  })
})

describe('purge', () => {
  const day = 24 * 60 * 60 * 1000

  it('60일 지난 매물을 지운다', async () => {
    const env = makeEnv()
    await saveSearch(env, '검은색 허리띠', incoming([trade({ price: 1, collectedAt: 0 })]), 0)
    const now = 61 * day
    await saveSearch(env, '검은색 허리띠', incoming([trade({ price: 2, collectedAt: now })]), now)
    await purge(env, now)
    const doc = await getItem(env, '검은색 허리띠')
    expect(doc?.trades.map(t => t.price)).toEqual([2])
  })

  it('아이템당 상한(300)을 넘는 매물을 지운다', async () => {
    const env = makeEnv()
    for (let i = 0; i < 305; i++) {
      await saveSearch(env, '검은색 허리띠', incoming([trade({ price: i, collectedAt: i })]), i)
    }
    const count = async () =>
      (await env.DB.prepare('SELECT COUNT(*) as c FROM trades').first<{ c: number }>())!.c
    // purge 전: getItem의 SELECT LIMIT 300이 결과를 가려서 테이블 자체를 직접 세야 한다.
    expect(await count()).toBe(305)

    await purge(env, 1000)
    expect(await count()).toBe(300)

    const doc = await getItem(env, '검은색 허리띠')
    expect(doc?.trades[0].price).toBe(304)   // 가장 최근 것이 살아남는다
  })
})
