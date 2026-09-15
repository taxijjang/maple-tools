package maple.tools.collector

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.hardware.display.DisplayManager
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.DisplayMetrics
import android.util.Log
import android.view.Display
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * 아이템 목록을 순서대로 검색하며 시세를 모으는 전경 서비스.
 *
 * 확성기 프로젝트의 CollectorService와 달리 화면을 수동적으로 계속 읽는 루프가
 * 아니라, 검색어를 매번 능동적으로 넣고 화면을 조작해가며 읽는 구동형 루프다.
 */
class CollectorService : Service() {

    private lateinit var cfg: Config
    private lateinit var uploader: Uploader
    private var projection: MediaProjection? = null
    private var capture: Capture? = null
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    @Volatile private var status = "시작 중…"

    override fun onBind(intent: Intent?) = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (projection != null) return START_NOT_STICKY   // 중복 시작 방지

        cfg = Config(this)
        uploader = Uploader(cfg)

        createChannel()
        startForeground(NOTIF_ID, buildNotification(status))

        val code = intent?.getIntExtra(EXTRA_CODE, Activity.RESULT_OK) ?: Activity.RESULT_OK
        @Suppress("DEPRECATION")
        val data = intent?.getParcelableExtra<Intent>(EXTRA_DATA) ?: Intent()

        val mgr = getSystemService(MediaProjectionManager::class.java)
        val p = try {
            mgr.getMediaProjection(code, data)
        } catch (e: SecurityException) {
            Log.e(TAG, "MediaProjection 동의 실패: ${e.message}")
            null
        }
        if (p == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        p.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                Log.w(TAG, "시스템이 화면 공유를 중단시켰다")
                stopSelf()
            }
        }, Handler(Looper.getMainLooper()))
        projection = p

        val (w, h, dpi) = screenSize()
        capture = Capture(p, w, h, dpi)

        scope.launch { runLoop() }
        return START_NOT_STICKY
    }

    private suspend fun runLoop() {
        val gesture = GestureService.instance
        if (gesture == null) {
            update("설정 > 접근성에서 '메이플 시세 수집기'를 켜야 합니다")
            return
        }
        val cap = capture ?: return

        gesture.tap(cfg.equipTabX, cfg.equipTabY)   // 장비 탭 고정, 한 번만
        delay(300)

        while (scope.isActive) {
            for (name in ITEM_NAMES) {
                if (!scope.isActive) break
                update("검색 중: $name")
                val rows = try {
                    searchItem(this@CollectorService, cfg, gesture, cap, scope, name)
                } catch (e: Exception) {
                    Log.w(TAG, "$name 검색 실패: ${e.message}")
                    emptyList()
                }
                if (rows.isNotEmpty()) uploader.upload(name, rows)
                delay(1500)   // 다음 검색 전 여유
            }
            update("한 바퀴 완료 · 대기 중")
            delay(cfg.cycleRestMs)
        }
    }

    private fun update(text: String) {
        status = text
        notify(buildNotification(text))
    }

    @Suppress("DEPRECATION")
    private fun screenSize(): Triple<Int, Int, Int> {
        val dm = DisplayMetrics()
        getSystemService(DisplayManager::class.java)
            .getDisplay(Display.DEFAULT_DISPLAY)
            .getRealMetrics(dm)
        return Triple(dm.widthPixels, dm.heightPixels, dm.densityDpi)
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val ch = NotificationChannel(CHANNEL, "시세 수집", NotificationManager.IMPORTANCE_LOW)
        getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
    }

    private fun buildNotification(text: String): Notification {
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), flags,
        )
        val stop = PendingIntent.getService(
            this, 1, Intent(this, CollectorService::class.java).setAction(ACTION_STOP), flags,
        )
        return NotificationCompat.Builder(this, CHANNEL)
            .setContentTitle("메이플 시세 수집 중")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setOngoing(true)
            .setContentIntent(open)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "정지", stop)
            .build()
    }

    private fun notify(n: Notification) =
        getSystemService(NotificationManager::class.java).notify(NOTIF_ID, n)

    override fun onDestroy() {
        scope.cancel()
        capture?.close()
        projection?.stop()
        projection = null
        super.onDestroy()
    }

    companion object {
        const val TAG = "MapleCollector"
        const val ACTION_STOP = "maple.tools.collector.STOP"
        const val EXTRA_CODE = "code"
        const val EXTRA_DATA = "data"
        private const val CHANNEL = "collector"
        private const val NOTIF_ID = 1

        fun start(ctx: android.content.Context, resultCode: Int, data: Intent) {
            ctx.startForegroundService(
                Intent(ctx, CollectorService::class.java)
                    .putExtra(EXTRA_CODE, resultCode)
                    .putExtra(EXTRA_DATA, data),
            )
        }

        fun stop(ctx: android.content.Context) {
            ctx.startService(Intent(ctx, CollectorService::class.java).setAction(ACTION_STOP))
        }
    }
}
