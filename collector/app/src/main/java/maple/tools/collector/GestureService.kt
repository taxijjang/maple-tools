package maple.tools.collector

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * 탭·꾹 누르기를 좌표로 실행하는 몸통.
 *
 * 이 게임은 화면 전체가 유니티 SurfaceView 하나다(`adb shell uiautomator dump`로 확인 —
 * 검색창도 목록도 노드가 하나도 안 잡히고 "Game view" 서페이스뿐이다). 그래서 노드를
 * 찾아 누르는 보통의 접근성 방식이 안 통하고, 좌표에 제스처를 꽂는 dispatchGesture만
 * 쓸 수 있다 — 이번 조사에서 adb로 직접 좌표 찍어 눌렀던 것과 원리가 같고, 그걸 폰 안의
 * 앱이 USB 연결 없이 스스로 하는 것뿐이다.
 *
 * 설정에서 "메이플 시세 수집기" 접근성 서비스를 켜야 인스턴스가 생긴다.
 */
class GestureService : AccessibilityService() {

    override fun onServiceConnected() {
        instance = this
        Log.i(TAG, "연결됨")
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
    override fun onInterrupt() {}

    /** 한 점을 짧게 누른다. */
    suspend fun tap(x: Int, y: Int): Boolean = dispatch(x, y, x, y, TAP_MS)

    /**
     * 한 점을 오래 누른다 — 매물 아이콘 위에서 이걸 하면 옵션 툴팁이 뜬다.
     *
     * **주의: 이 함수가 끝났다는 건 이미 손을 뗀 뒤라는 뜻이다.** 툴팁은 누르고 있는
     * 동안만 보이고 떼면 사라진다(이번 조사에서 adb로 직접 확인했다 — 손을 뗀 뒤 찍은
     * 스크린샷에는 안 보이다가, 누른 채로 찍으니 보였다). 그래서 이 함수를 `await`해서
     * 끝난 뒤에 캡처하면 이미 늦다.
     *
     * 올바른 사용법은 이 함수를 기다리지 않고 백그라운드로 던져둔 채, 그보다 짧은
     * 시간만 delay한 뒤 캡처하는 것이다 — 누르는 동작은 이 함수가 알아서 끝까지
     * (durationMs만큼) 들고 있다가 스스로 뗀다:
     * ```
     * scope.launch { gestureService.longPress(x, y, 3000) }   // 던져두고
     * delay(700)                                               // 툴팁 뜰 때까지 기다렸다가
     * val bmp = capture.grab()                                 // 누른 채로 캡처
     * ```
     */
    suspend fun longPress(x: Int, y: Int, durationMs: Long = 3000): Boolean =
        dispatch(x, y, x, y, durationMs)

    private suspend fun dispatch(x1: Int, y1: Int, x2: Int, y2: Int, durationMs: Long): Boolean =
        suspendCancellableCoroutine { cont ->
            val path = Path().apply {
                moveTo(x1.toFloat(), y1.toFloat())
                if (x1 != x2 || y1 != y2) lineTo(x2.toFloat(), y2.toFloat())
            }
            val gesture = GestureDescription.Builder()
                .addStroke(GestureDescription.StrokeDescription(path, 0, durationMs))
                .build()
            val ok = dispatchGesture(gesture, object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) {
                    if (cont.isActive) cont.resume(true)
                }
                override fun onCancelled(gestureDescription: GestureDescription?) {
                    if (cont.isActive) cont.resume(false)
                }
            }, null)
            if (!ok && cont.isActive) cont.resume(false)
        }

    companion object {
        private const val TAG = "MapleCollector"
        private const val TAP_MS = 60L

        @Volatile
        var instance: GestureService? = null
            private set
    }
}
