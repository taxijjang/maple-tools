-- 아이템 고유 정보. 검은색 허리띠 같은 이름 하나당 행 하나 — 요구레벨·장비분류·
-- 고정 스탯은 매물마다 같아야 정상이라 별도 테이블로 뺐다.
CREATE TABLE IF NOT EXISTS items (
  name TEXT PRIMARY KEY,
  req_level INTEGER,
  equip_slot TEXT,
  base_stats TEXT NOT NULL DEFAULT '{}',   -- JSON: {"STR":"+5", ...}
  updated_at INTEGER NOT NULL
);

-- 실제 거래 매물. 아이템 하나에 여러 행 — 잠재능력 차이 때문에 같은 이름이어도
-- 가격이 크게 벌어진다(검은색 허리띠 실측: 3억7천만~5억6천만 메소).
--
-- UNIQUE 제약이 중복 제거를 대신한다. 같은 검색을 두 번 수집해도 가격·거래일·
-- 잠재능력이 전부 같은 행은 INSERT OR IGNORE로 조용히 걸러진다.
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_name TEXT NOT NULL REFERENCES items(name),
  grade TEXT,
  potential TEXT NOT NULL DEFAULT '[]',    -- JSON 배열: ["INT : +12", "DEX : +6%"]
  price INTEGER NOT NULL,
  traded_at TEXT,                          -- "2026-09-15" (게임 안 거래일)
  collected_at INTEGER NOT NULL,           -- 저희가 수집한 시각(ms epoch)
  UNIQUE (item_name, price, traded_at, potential)
);

CREATE INDEX IF NOT EXISTS idx_trades_item ON trades(item_name, collected_at DESC);
