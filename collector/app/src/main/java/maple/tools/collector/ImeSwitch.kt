package maple.tools.collector

import android.content.ComponentName
import android.content.Context
import android.provider.Settings
import kotlinx.coroutines.delay

/**
 * 기본 입력기를 코드로 조용히 바꾼다.
 *
 * `Settings.Secure.DEFAULT_INPUT_METHOD`를 직접 쓰는 건 앱이 사용자 설정을 건드리는
 * 민감한 동작이라, 보통의 dangerous-permission 다이얼로그가 아니라
 * `WRITE_SECURE_SETTINGS`라는 서명급 권한이 있어야 한다. 설치 후 한 번:
 *   adb shell pm grant maple.tools.collector android.permission.WRITE_SECURE_SETTINGS
 * 을 실행해야 실제로 통한다 — 안 해두면 SecurityException이 난다.
 */
object ImeSwitch {

    /** 검색 한 번을 감쌀 때 쓴다: 우리 IME로 바꾸고, 검사가 끝나면 원래 것으로 되돌린다. */
    suspend fun <T> withSearchIme(ctx: Context, block: suspend () -> T): T {
        val original = current(ctx)
        switchTo(ctx, ownImeId(ctx))
        // 전환이 실제로 반영될 시간을 준다. 짧게 준다 — 오래 걸리면 여기서 늘린다.
        delay(200)
        try {
            return block()
        } finally {
            if (original != null) switchTo(ctx, original)
        }
    }

    private fun current(ctx: Context): String? =
        Settings.Secure.getString(ctx.contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD)

    private fun switchTo(ctx: Context, imeId: String) {
        Settings.Secure.putString(ctx.contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD, imeId)
    }

    private fun ownImeId(ctx: Context): String =
        ComponentName(ctx, SearchIme::class.java).flattenToShortString()
}
