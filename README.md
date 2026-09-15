# maple-tools

메이플스토리 월드 · 메이플 플래닛의 **경매장 장비 시세**를 모아 보여주는 사이트.

확성기(채팅) 수집 프로젝트는 게임 운영진 요청으로 중단했다. 이건 별개의 새 프로젝트다 —
닉네임·대화 없이 이미 완료된 장비 거래(가격·잠재능력)만 다룬다.

## 구조

- `server/` — Cloudflare Worker + D1. 아이템(고정 스탯)과 매물(가격·잠재능력)을
  테이블 두 개로 나눠 저장한다. 처음엔 R2에 아이템별 JSON 문서로 저장하려 했으나,
  매물이 계속 쌓이는 구조와 안 맞아(매번 문서 전체를 읽고 다시 써야 함) D1로 바꿨다.
- `collector/` — 안드로이드 수집 앱 (예정). 접근성 서비스로 경매장 검색·결과 읽기를
  자동화하고, 매물 아이콘을 꾹 눌러 뜨는 툴팁에서 잠재능력을 읽는다.

## 원칙

- **판매자(닉네임) 필드는 어디에도 저장하지 않는다.** 화면에 보여도 OCR 대상에서 뺀다.
- 원문(OCR raw text)은 서버에서 파싱한다 — 파싱 규칙을 고칠 때 앱을 다시 배포할 필요가
  없다.
- 소비 아이템은 다루지 않는다. 옵션이 없어 시세 추적 가치가 적고, 이 프로젝트의 핵심인
  "꾹 눌러 잠재능력 읽기" 파이프라인이 장비 전용이다.
- 데이터는 미리 수집해 저장해두고, 방문자 검색은 그 저장분만 읽는다. 방문자 요청이
  게임을 직접 건드리지 않는다.

## 서버 개발

```bash
cd server
npm install
npm test        # vitest
npm run dev      # wrangler dev
npm run deploy   # wrangler deploy
```

배포 전에 필요한 것 (직접 해야 함):

```bash
npx wrangler d1 create maple-tools          # 나오는 database_id를 wrangler.toml에 채운다
npx wrangler d1 execute maple-tools --remote --file=schema.sql
npx wrangler secret put INGEST_SECRET
```
