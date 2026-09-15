/// <reference types="node" />
// 이 파일만 Node 타입이 필요하다(fs·path·module·__dirname). tsconfig의 전역 types는
// 계속 워커 런타임만 가리키게 둔다 — src/ 코드가 Node 전역을 실수로 쓰면 잡아야 한다.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

// vite/vitest가 'node:sqlite'를 정적 import로는 못 찾는다(아직 흔치 않은 내장 모듈이라
// 번들러의 내장 모듈 목록에 없는 듯하다). createRequire로 우회하면 실제로는 Node가
// 그대로 실행하므로 문제없다 — node -e 'require("node:sqlite")'로 먼저 확인했다.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')

/**
 * D1Database를 흉내 내되, 진짜 흉내가 아니라 진짜 SQLite로 돌린다(Node 내장 node:sqlite).
 * D1도 SQLite 기반이라 UNIQUE 제약·서브쿼리 DELETE처럼 손으로 재현하기 번거로운
 * SQL 동작을 손수 흉내 내는 대신 실제 엔진에 맡긴다.
 */
class FakeStmt {
  constructor(private db: any, private sql: string, private params: unknown[] = []) {}

  bind(...params: unknown[]): FakeStmt {
    return new FakeStmt(this.db, this.sql, params)
  }

  async run() {
    const info = this.db.prepare(this.sql).run(...(this.params as any[]))
    return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } }
  }

  async all<T>() {
    const results = this.db.prepare(this.sql).all(...(this.params as any[])) as T[]
    return { results, success: true }
  }

  async first<T>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...(this.params as any[]))
    return (row as T) ?? null
  }
}

export function fakeD1(): D1Database {
  const schema = readFileSync(join(__dirname, '..', 'schema.sql'), 'utf-8')
  const sqliteDb = new DatabaseSync(':memory:')
  sqliteDb.exec(schema)

  const db = {
    prepare(sql: string) { return new FakeStmt(sqliteDb, sql) },
    async batch(stmts: FakeStmt[]) {
      const out = []
      for (const s of stmts) out.push(await s.run())
      return out
    },
  }
  return db as unknown as D1Database
}
