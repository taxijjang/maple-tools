package maple.tools.collector

import android.content.Context
import android.content.SharedPreferences
import kotlin.properties.ReadWriteProperty
import kotlin.reflect.KProperty

/**
 * 화면 좌표는 기기·해상도·회전에 따라 달라져서 코드만으로 맞출 수 없다.
 * 전부 여기 모아 재배포 없이 고칠 수 있게 한다(intent-extra로 주입, 확성기
 * 프로젝트와 같은 방식).
 *
 * 기본값은 이 프로젝트 조사 단계에서 실제 폰(2340x1080 가로) 화면을 눈으로 재서 얻은
 * 값이다. **다른 기기·해상도에서는 다시 재야 한다** — 검증된 게 아니라 출발점이다.
 */
class Config(ctx: Context) {
    private val p: SharedPreferences = ctx.getSharedPreferences("cfg", Context.MODE_PRIVATE)

    // 검색창과 검색 버튼(돋보기). 최근거래 탭 기준.
    var searchFieldX by Pref(p, "searchFieldX", 1400)
    var searchFieldY by Pref(p, "searchFieldY", 135)
    var searchButtonX by Pref(p, "searchButtonX", 1780)
    var searchButtonY by Pref(p, "searchButtonY", 143)

    // "장비" 카테고리 탭. 소비 아이템은 다루지 않는다 — 옵션이 없어 시세 추적 가치가
    // 적고, 이 프로젝트의 핵심인 "꾹 눌러 옵션 읽기"가 장비 전용이다.
    var equipTabX by Pref(p, "equipTabX", 858)
    var equipTabY by Pref(p, "equipTabY", 178)

    // 결과 행 레이아웃. 1행 아이콘 중심이 firstRowY, 그다음 행부터 rowHeight씩 내려간다.
    var firstRowY by Pref(p, "firstRowY", 264)
    var rowHeight by Pref(p, "rowHeight", 57)
    var rowsPerPage by Pref(p, "rowsPerPage", 8)
    var rowIconX by Pref(p, "rowIconX", 727)

    // 총 가격·만효일 칸. 판매자(닉네임) 칸은 **좌표를 아예 두지 않는다** — 값이 없으니
    // 그 열을 OCR에 넘길 방법 자체가 없다.
    var priceColLeft by Pref(p, "priceColLeft", 1290)
    var priceColRight by Pref(p, "priceColRight", 1500)
    var dateColLeft by Pref(p, "dateColLeft", 1650)
    var dateColRight by Pref(p, "dateColRight", 1830)
    var rowHeightPx by Pref(p, "rowHeightPx", 50)   // OCR용 세로 여유

    // 아이콘을 꾹 눌렀을 때 뜨는 옵션 툴팁이 나오는 영역. 누른 행 근처에서 시작해
    // 오른쪽 아래로 펼쳐진다 — 넉넉하게 잡는다.
    var tooltipLeft by Pref(p, "tooltipLeft", 760)
    var tooltipTop by Pref(p, "tooltipTop", 200)
    var tooltipRight by Pref(p, "tooltipRight", 1220)
    var tooltipBottom by Pref(p, "tooltipBottom", 1080)
    var tooltipHoldMs by Pref(p, "tooltipHoldMs", 3000L)
    var tooltipPeekMs by Pref(p, "tooltipPeekMs", 700L)   // 누른 채로 이만큼 기다렸다 캡처

    // 다음 페이지 버튼. 페이지를 얼마나 넘길지는 아이템별로 오케스트레이터가 정한다.
    var nextPageX by Pref(p, "nextPageX", 1370)
    var nextPageY by Pref(p, "nextPageY", 720)

    var endpoint by Pref(p, "endpoint", "")   // https://…/ingest
    var secret by Pref(p, "secret", "")

    // 목록을 한 바퀴 다 돌고 나서 다음 바퀴까지 쉬는 시간. 시세는 확성기처럼 초 단위로
    // 급하지 않으니 자주 돌 필요가 없다.
    var cycleRestMs by Pref(p, "cycleRestMs", 10 * 60 * 1000L)
}

class Pref<T : Any>(
    private val p: SharedPreferences,
    private val key: String,
    private val def: T,
) : ReadWriteProperty<Any?, T> {

    @Suppress("UNCHECKED_CAST")
    override fun getValue(thisRef: Any?, property: KProperty<*>): T = when (def) {
        is Float -> p.getFloat(key, def) as T
        is Int -> p.getInt(key, def) as T
        is Long -> p.getLong(key, def) as T
        is String -> (p.getString(key, def) ?: def) as T
        else -> error("지원하지 않는 타입: ${def::class}")
    }

    override fun setValue(thisRef: Any?, property: KProperty<*>, value: T) {
        val e = p.edit()
        when (value) {
            is Float -> e.putFloat(key, value)
            is Int -> e.putInt(key, value)
            is Long -> e.putLong(key, value)
            is String -> e.putString(key, value)
            else -> error("지원하지 않는 타입: ${value::class}")
        }
        e.apply()
    }
}
