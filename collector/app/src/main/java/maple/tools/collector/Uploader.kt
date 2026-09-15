package maple.tools.collector

import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

private val JSON = "application/json; charset=utf-8".toMediaType()

/** 한 아이템 검색 결과 한 행. Orchestrator가 채운다. */
data class ResultRow(val tooltipRaw: String, val priceRaw: String, val tradeDateRaw: String)

/**
 * 검색 한 번의 결과를 서버로 보낸다.
 *
 * 확성기 프로젝트의 큐잉 전송과 달리 여기서는 배치 흐름 자체가 "검색 하나 끝날 때마다
 * 한 번 보낸다"라서 별도 대기열이 필요 없다. 실패하면 그 아이템은 이번 수집 주기에서
 * 건너뛴다 — 다음 주기에 다시 검색되므로 유실이 아니라 지연이다.
 */
class Uploader(private val cfg: Config) {
    private val client = OkHttpClient()

    /** 성공하면 true. endpoint/secret이 비어 있으면 아무것도 안 보내고 false. */
    fun upload(itemName: String, rows: List<ResultRow>): Boolean {
        if (cfg.endpoint.isBlank() || rows.isEmpty()) return false

        val arr = JSONArray()
        for (r in rows) {
            arr.put(
                JSONObject()
                    .put("tooltipRaw", r.tooltipRaw)
                    .put("priceRaw", r.priceRaw)
                    .put("tradeDateRaw", r.tradeDateRaw),
            )
        }
        val body = JSONObject().put("itemName", itemName).put("rows", arr)
            .toString().toRequestBody(JSON)
        val req = Request.Builder()
            .url(cfg.endpoint)
            .addHeader("x-ingest-secret", cfg.secret)
            .post(body)
            .build()

        return try {
            client.newCall(req).execute().use { res ->
                if (res.isSuccessful) {
                    Log.d(TAG, "$itemName 전송 ${rows.size}행 → ${res.body?.string()}")
                    true
                } else {
                    Log.w(TAG, "$itemName 전송 거부 ${res.code}")
                    false
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "$itemName 전송 예외 ${e.message}")
            false
        }
    }

    companion object {
        const val TAG = "MapleCollector"
    }
}
