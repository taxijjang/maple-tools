/**
 * 아이템 툴팁 원문을 구조화된 데이터로 바꾼다.
 *
 * 확성기 프로젝트에서 그랬듯, OCR 원문은 서버에서만 파싱한다. 파싱 규칙을 고칠 때마다
 * 수집 앱을 다시 빌드·배포할 필요가 없고, 저장해둔 원문을 다시 돌려 과거 데이터를
 * 한꺼번에 되살릴 수 있다.
 */

export type Grade = '일반' | '레어' | '에픽' | '유니크' | '레전드리'

const GRADES: Grade[] = ['일반', '레어', '에픽', '유니크', '레전드리']

export type ParsedTooltip = {
  name: string | null
  grade: Grade | null
  reqLevel: number | null
  equipSlot: string | null
  baseStats: Record<string, string>
  potential: string[]
}

/**
 * 툴팁 원문 예시:
 *   검은색 허리띠
 *   (유니크 아이템)
 *   1회 교환 가능 (거래 후 교환 불가)
 *   REQ LEV : 75
 *   ...
 *   장비분류 : 벨트
 *   STR : +5
 *   ...
 *   업그레이드 가능 횟수 : 3
 *   INT : +12
 *   DEX : +6%
 *   LUK : +6%
 *
 * 위쪽(REQ LEV ~ 업그레이드 가능 횟수)은 이 아이템 고유의 고정값이라 매물마다 같다.
 * "업그레이드 가능 횟수" 줄 다음부터 나오는 스탯 줄들이 매물마다 다른 잠재능력이다 —
 * 정확히 이게 같은 아이템인데 총 가격이 널뛰던 이유였다.
 */
export function parseTooltip(raw: string): ParsedTooltip {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)

  const name = lines[0] ?? null

  const gradeLine = lines.find(l => /^\([가-힣]+ 아이템\)$/.test(l))
  const gradeMatch = gradeLine?.match(/^\(([가-힣]+) 아이템\)$/)
  const grade = (gradeMatch && GRADES.includes(gradeMatch[1] as Grade))
    ? gradeMatch[1] as Grade : null

  const reqLevelMatch = raw.match(/REQ LEV\s*:\s*(\d+)/)
  const reqLevel = reqLevelMatch ? Number(reqLevelMatch[1]) : null

  const equipSlotMatch = raw.match(/장비분류\s*:\s*(\S+)/)
  const equipSlot = equipSlotMatch ? equipSlotMatch[1] : null

  // 고정 스탯: "장비분류" 줄부터 "업그레이드 가능 횟수" 줄까지 (포함)
  const fixedStart = lines.findIndex(l => l.startsWith('장비분류'))
  const fixedEndLabel = lines.findIndex(l => l.startsWith('업그레이드 가능 횟수'))
  const baseStats: Record<string, string> = {}
  if (fixedStart >= 0) {
    const end = fixedEndLabel >= 0 ? fixedEndLabel + 1 : lines.length
    for (const line of lines.slice(fixedStart + 1, end)) {
      const m = line.match(/^(.+?)\s*:\s*(.+)$/)
      if (m) baseStats[m[1].trim()] = m[2].trim()
    }
  }

  // 잠재능력: "업그레이드 가능 횟수" 다음 줄부터 끝까지, "STAT : 값" 형태인 줄만.
  const potential: string[] = []
  if (fixedEndLabel >= 0) {
    for (const line of lines.slice(fixedEndLabel + 1)) {
      if (/^[가-힣A-Za-z%]+\s*:\s*[+\-]?[\d.]+%?$/.test(line)) potential.push(line)
    }
  }

  return { name, grade, reqLevel, equipSlot, baseStats, potential }
}

/** "475,555,555 메소" → 475555555. 콤마·"메소"·공백을 뗀다. */
export function parsePrice(raw: string): number | null {
  const digits = raw.replace(/[,\s]/g, '').match(/^(\d+)/)
  return digits ? Number(digits[1]) : null
}

/**
 * "26-09-15" → "2026-09-15". 게임 UI가 2자리 연도를 쓴다.
 * 2000년대로 가정한다 — 이 게임이 2100년대까지 운영될 일은 없다.
 */
export function parseTradeDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{2})-(\d{2})-(\d{2})$/)
  return m ? `20${m[1]}-${m[2]}-${m[3]}` : null
}
