import { describe, it, expect } from 'vitest'
import { mergeItem, type ItemDoc, type Trade } from '../src/store'

const trade = (over: Partial<Trade> = {}): Trade => ({
  grade: '유니크', potential: ['INT : +12'], price: 100, tradedAt: '2026-09-15',
  collectedAt: 1000, ...over,
})

const incoming = (trades: Trade[]) => ({
  name: '검은색 허리띠', reqLevel: 75, equipSlot: '벨트', baseStats: { STR: '+5' }, trades,
})

describe('mergeItem', () => {
  it('기존 문서가 없으면 새로 만든다', () => {
    const doc = mergeItem(null, incoming([trade()]), 2000)
    expect(doc.trades).toHaveLength(1)
    expect(doc.name).toBe('검은색 허리띠')
    expect(doc.updatedAt).toBe(2000)
  })

  it('새 매물을 기존 매물 앞에 이어붙인다', () => {
    const existing: ItemDoc = {
      name: '검은색 허리띠', category: '장비', reqLevel: 75, equipSlot: '벨트',
      baseStats: {}, trades: [trade({ price: 1, collectedAt: 500 })], updatedAt: 500,
    }
    const doc = mergeItem(existing, incoming([trade({ price: 2, collectedAt: 1000 })]), 1000)
    expect(doc.trades.map(t => t.price)).toEqual([2, 1])
  })

  it('가격·거래일·잠재능력이 전부 같은 매물은 중복으로 버린다', () => {
    const existing: ItemDoc = {
      name: '검은색 허리띠', category: '장비', reqLevel: 75, equipSlot: '벨트',
      baseStats: {}, trades: [trade({ price: 100, collectedAt: 500 })], updatedAt: 500,
    }
    // 같은 검색을 두 번 수집한 상황: 가격·거래일·잠재능력이 동일
    const doc = mergeItem(existing, incoming([trade({ price: 100, collectedAt: 1000 })]), 1000)
    expect(doc.trades).toHaveLength(1)
  })

  it('가격이 다르면 잠재능력이 같아도 다른 매물로 취급한다', () => {
    const existing: ItemDoc = {
      name: '검은색 허리띠', category: '장비', reqLevel: 75, equipSlot: '벨트',
      baseStats: {}, trades: [trade({ price: 100, collectedAt: 500 })], updatedAt: 500,
    }
    const doc = mergeItem(existing, incoming([trade({ price: 999, collectedAt: 1000 })]), 1000)
    expect(doc.trades).toHaveLength(2)
  })

  it('60일 지난 매물은 합칠 때 버린다', () => {
    const day = 24 * 60 * 60 * 1000
    const existing: ItemDoc = {
      name: '검은색 허리띠', category: '장비', reqLevel: 75, equipSlot: '벨트',
      baseStats: {}, trades: [trade({ price: 1, collectedAt: 0 })], updatedAt: 0,
    }
    const now = 61 * day
    const doc = mergeItem(existing, incoming([trade({ price: 2, collectedAt: now })]), now)
    expect(doc.trades.map(t => t.price)).toEqual([2])
  })

  it('상한(300)을 넘으면 최신순으로 잘라낸다', () => {
    const many = Array.from({ length: 300 }, (_, i) => trade({ price: i, collectedAt: 1000 }))
    const existing: ItemDoc = {
      name: '검은색 허리띠', category: '장비', reqLevel: 75, equipSlot: '벨트',
      baseStats: {}, trades: many, updatedAt: 1000,
    }
    const doc = mergeItem(existing, incoming([trade({ price: 999, collectedAt: 2000 })]), 2000)
    expect(doc.trades).toHaveLength(300)
    expect(doc.trades[0].price).toBe(999)   // 가장 최근 것이 살아남는다
  })

  it('고정 스탯은 새로 들어온 값으로 덮는다', () => {
    const existing: ItemDoc = {
      name: '검은색 허리띠', category: '장비', reqLevel: 75, equipSlot: '벨트',
      baseStats: { STR: '+5' }, trades: [], updatedAt: 0,
    }
    const doc = mergeItem(existing, { ...incoming([]), reqLevel: 80 }, 1000)
    expect(doc.reqLevel).toBe(80)
  })
})
