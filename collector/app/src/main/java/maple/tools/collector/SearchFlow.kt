package maple.tools.collector

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Rect
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * 아이템 이름 하나를 검색해서 결과 행마다 가격·거래일·옵션 툴팁을 읽어온다.
 *
 * 흐름: IME 전환 → 검색창 포커스 → 검색어 커밋 → 검색 실행 → 화면 캡처 →
 * 행마다 (가격·거래일 OCR) + (아이콘 꾹 눌러 툴팁 OCR) → 원래 키보드로 복귀.
 *
 * 판매자(닉네임) 열은 여기 어디에도 등장하지 않는다 — Config에 그 열 좌표 자체가
 * 없으므로 OCR에 넘길 방법이 없다. 우연히도 아니고 의도한 설계다.
 */
suspend fun searchItem(
    ctx: Context,
    cfg: Config,
    gesture: GestureService,
    capture: Capture,
    scope: CoroutineScope,
    itemName: String,
): List<ResultRow> = ImeSwitch.withSearchIme(ctx) {
    gesture.tap(cfg.searchFieldX, cfg.searchFieldY)
    delay(150)

    // IME가 막 전환된 직후라 onStartInputView가 아직 안 왔을 수 있다 — 몇 번 재시도한다.
    var committed = false
    repeat(5) {
        if (SearchIme.instance?.commit(itemName) == true) {
            committed = true
            return@repeat
        }
        delay(100)
    }
    if (!committed) {
        Log.w(TAG, "$itemName : 검색어 입력 실패, 이번 주기는 건너뜀")
        return@withSearchIme emptyList()
    }

    delay(150)
    gesture.tap(cfg.searchButtonX, cfg.searchButtonY)
    delay(700)   // 결과가 그려질 시간

    val bmp = capture.grab() ?: run {
        Log.w(TAG, "$itemName : 화면 캡처 실패")
        return@withSearchIme emptyList()
    }
    try {
        readRows(cfg, gesture, capture, scope, bmp, itemName)
    } finally {
        bmp.recycle()
    }
}

private suspend fun readRows(
    cfg: Config,
    gesture: GestureService,
    capture: Capture,
    scope: CoroutineScope,
    listBmp: Bitmap,
    itemName: String,
): List<ResultRow> {
    val rows = mutableListOf<ResultRow>()
    for (i in 0 until cfg.rowsPerPage) {
        val rowY = cfg.firstRowY + i * cfg.rowHeight
        val half = cfg.rowHeightPx / 2
        val priceRect = Rect(cfg.priceColLeft, rowY - half, cfg.priceColRight, rowY + half)
        val dateRect = Rect(cfg.dateColLeft, rowY - half, cfg.dateColRight, rowY + half)

        val priceLines = ocrRegion(listBmp, priceRect)
        if (priceLines.isEmpty()) break   // 이 아이템은 결과가 여기까지다

        val dateLines = ocrRegion(listBmp, dateRect)

        // 꾹 누르기는 기다리지 않고 던져둔다 — 끝났다는 건 이미 손을 뗀 뒤라는 뜻이라
        // 그때 캡처하면 툴팁이 이미 사라진 뒤다(GestureService.longPress 참고).
        scope.launch { gesture.longPress(cfg.rowIconX, rowY, cfg.tooltipHoldMs) }
        delay(cfg.tooltipPeekMs)

        val tooltipRect = Rect(cfg.tooltipLeft, cfg.tooltipTop, cfg.tooltipRight, cfg.tooltipBottom)
        val tooltipBmp = capture.grab()
        val tooltipText = if (tooltipBmp != null) {
            try { ocrText(tooltipBmp, tooltipRect) } finally { tooltipBmp.recycle() }
        } else ""

        if (tooltipText.isBlank()) {
            Log.w(TAG, "$itemName 행 $i : 툴팁을 못 읽음 — 좌표 재보정이 필요할 수 있음")
        }

        rows.add(ResultRow(
            tooltipRaw = tooltipText,
            priceRaw = priceLines.joinToString(" "),
            tradeDateRaw = dateLines.joinToString(" "),
        ))
    }
    return rows
}

private const val TAG = "MapleCollector"
