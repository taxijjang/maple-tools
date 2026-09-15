import { describe, it, expect } from 'vitest'
import { parseTooltip, parsePrice, parseTradeDate } from '../src/parse'

// 실제로 폰에서 꾹 눌러 캡처한 툴팁 원문 그대로.
const REAL_TOOLTIP = `검은색 허리띠
(유니크 아이템)
1회 교환 가능 (거래 후 교환 불가)

REQ LEV : 75
REQ STR : 0
REQ DEX : 0
REQ INT : 0
REQ LUK : 0
REQ POP : 0
ITEM LEV : -
ITEM EXP : -

초보자 전사 마법사 궁수 도적 해적

장비분류 : 벨트
STR : +5
DEX : +5
INT : +5
LUK : +5
물리 방어력 : +50
마법 방어력 : +50
회피율 : +15
업그레이드 가능 횟수 : 3

INT : +12
DEX : +6%
LUK : +6%`

describe('parseTooltip', () => {
  it('이름과 등급을 읽는다', () => {
    const r = parseTooltip(REAL_TOOLTIP)
    expect(r.name).toBe('검은색 허리띠')
    expect(r.grade).toBe('유니크')
  })

  it('요구 레벨과 장비분류를 읽는다', () => {
    const r = parseTooltip(REAL_TOOLTIP)
    expect(r.reqLevel).toBe(75)
    expect(r.equipSlot).toBe('벨트')
  })

  it('고정 스탯을 읽는다 — 이 아이템 고유값이라 매물마다 같다', () => {
    const r = parseTooltip(REAL_TOOLTIP)
    expect(r.baseStats).toEqual({
      'STR': '+5', 'DEX': '+5', 'INT': '+5', 'LUK': '+5',
      '물리 방어력': '+50', '마법 방어력': '+50', '회피율': '+15',
      '업그레이드 가능 횟수': '3',
    })
  })

  it('잠재능력만 따로 뽑는다 — 매물마다 다른 진짜 옵션', () => {
    const r = parseTooltip(REAL_TOOLTIP)
    expect(r.potential).toEqual(['INT : +12', 'DEX : +6%', 'LUK : +6%'])
  })

  it('등급 표기가 없으면 null', () => {
    const r = parseTooltip('이름 모를 아이템\nREQ LEV : 1')
    expect(r.grade).toBeNull()
  })

  it('등급 괄호 안이 알려진 등급이 아니면 null (오탈자 방어)', () => {
    const r = parseTooltip('아이템\n(레주얼 아이템)')
    expect(r.grade).toBeNull()
  })

  it('빈 문자열에서도 죽지 않는다', () => {
    const r = parseTooltip('')
    expect(r).toEqual({ name: null, grade: null, reqLevel: null, equipSlot: null, baseStats: {}, potential: [] })
  })
})

describe('parsePrice', () => {
  it('콤마와 "메소"를 뗀다', () => {
    expect(parsePrice('475,555,555 메소')).toBe(475555555)
  })
  it('숫자가 없으면 null', () => {
    expect(parsePrice('메소')).toBeNull()
  })
  it('콤마 없는 값도 된다', () => {
    expect(parsePrice('1376 메소')).toBe(1376)
  })
})

describe('parseTradeDate', () => {
  it('2자리 연도를 2000년대로 늘린다', () => {
    expect(parseTradeDate('26-09-15')).toBe('2026-09-15')
  })
  it('형식이 다르면 null', () => {
    expect(parseTradeDate('2026-09-15')).toBeNull()
    expect(parseTradeDate('')).toBeNull()
  })
})
