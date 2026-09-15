package maple.tools.collector

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var cfg: Config
    private lateinit var status: TextView
    private lateinit var endpoint: EditText
    private lateinit var secret: EditText

    private val consent = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val data = result.data
        if (result.resultCode == RESULT_OK && data != null) {
            save()
            CollectorService.start(this, result.resultCode, data)
            status.text = "수집 시작. 알림에서 상태를 볼 수 있습니다."
        } else {
            status.text = "화면 공유 동의가 취소되었습니다."
        }
    }

    private val notifPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { requestConsent() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        cfg = Config(this)

        endpoint = findViewById(R.id.endpoint)
        secret = findViewById(R.id.secret)
        status = findViewById(R.id.status)
        endpoint.setText(cfg.endpoint)
        secret.setText(cfg.secret)

        // adb로 설정을 밀어넣는 통로.
        //   adb shell am start -n maple.tools.collector/.MainActivity \
        //     --es endpoint https://…/ingest --es secret devsecret
        intent?.getStringExtra("endpoint")?.let { cfg.endpoint = it; endpoint.setText(it) }
        intent?.getStringExtra("secret")?.let { cfg.secret = it; secret.setText(it) }

        findViewById<Button>(R.id.openAccessibility).setOnClickListener {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }
        findViewById<Button>(R.id.openImeSettings).setOnClickListener {
            startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS))
        }
        findViewById<Button>(R.id.start).setOnClickListener { onStart0() }
        findViewById<Button>(R.id.stop).setOnClickListener {
            CollectorService.stop(this)
            status.text = "정지 요청됨."
        }
    }

    override fun onPause() {
        save()
        super.onPause()
    }

    private fun onStart0() {
        if (endpoint.text.isBlank()) {
            Toast.makeText(this, "서버 주소를 입력하세요", Toast.LENGTH_SHORT).show()
            return
        }
        if (GestureService.instance == null) {
            Toast.makeText(this, "먼저 접근성 설정에서 켜주세요 (①)", Toast.LENGTH_LONG).show()
            return
        }
        save()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            return
        }
        requestConsent()
    }

    private fun requestConsent() {
        val mgr = getSystemService(MediaProjectionManager::class.java)
        consent.launch(mgr.createScreenCaptureIntent())
    }

    private fun save() {
        cfg.endpoint = endpoint.text.toString().trim()
        cfg.secret = secret.text.toString().trim()
    }
}
