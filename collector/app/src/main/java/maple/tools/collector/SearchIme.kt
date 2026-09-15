package maple.tools.collector

import android.inputmethodservice.InputMethodService
import android.util.Log
import android.view.View
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * 검색어를 한 번에 꽂아 넣기 위한, 우리가 직접 만든 조용한 키보드.
 *
 * 게임이 유니티 SurfaceView 하나뿐이라(GestureService.kt 참고) 접근성 노드로 텍스트를
 * 못 넣는다. 대신 시스템 IME 자체가 되어 `commitText()`로 현재 포커스된 입력 연결에
 * 직접 글자를 밀어 넣는다 — 자모를 좌표로 하나씩 눌러 조합하는 방식(이 프로젝트 조사
 * 단계에서 세 번 실패했던 그것)을 완전히 피한다.
 *
 * 화면을 그리지 않는다(onCreateInputView가 빈 View를 준다) — 사용자에게 자판이
 * 보일 필요가 없다.
 */
class SearchIme : InputMethodService() {

    override fun onCreateInputView(): View = View(this)

    override fun onStartInputView(info: android.view.inputmethod.EditorInfo?, restarting: Boolean) {
        super.onStartInputView(info, restarting)
        instance = this
    }

    override fun onFinishInputView(finishingInput: Boolean) {
        instance = null
        super.onFinishInputView(finishingInput)
    }

    /**
     * 지금 포커스된 입력창에 문자열을 통째로 넣는다.
     *
     * 오케스트레이터가 이 IME로 기본 키보드를 전환한 뒤(Config.switchToSearchIme 참고),
     * 검색창을 탭해 포커스를 준 다음 이 함수를 부르는 순서로 쓴다. 포커스가 아직
     * 안 잡혀 있으면(onStartInputView가 아직 안 불렸으면) currentInputConnection이
     * null이라 조용히 실패한다 — 호출 쪽에서 재시도 여지를 두는 게 낫다.
     */
    fun commit(text: String): Boolean {
        val ic = currentInputConnection ?: run {
            Log.w(TAG, "입력 연결이 아직 없음 — 검색창 포커스를 먼저 줘야 한다")
            return false
        }
        return ic.commitText(text, 1)
    }

    companion object {
        private const val TAG = "MapleCollector"

        @Volatile
        var instance: SearchIme? = null
            private set
    }
}
