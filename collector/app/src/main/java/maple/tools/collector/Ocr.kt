package maple.tools.collector

import android.graphics.Bitmap
import android.graphics.Rect
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

private val recognizer =
    TextRecognition.getClient(KoreanTextRecognizerOptions.Builder().build())

/** 한 이미지의 줄 텍스트를 위에서 아래 순서로 낸다. */
suspend fun ocrLines(bmp: Bitmap): List<String> =
    suspendCancellableCoroutine { cont ->
        recognizer.process(InputImage.fromBitmap(bmp, 0))
            .addOnSuccessListener { result ->
                cont.resume(
                    result.textBlocks
                        .flatMap { it.lines }
                        .sortedBy { it.boundingBox?.top ?: 0 }
                        .map { it.text },
                )
            }
            .addOnFailureListener { cont.resumeWithException(it) }
    }

/**
 * 화면 전체 비트맵에서 한 사각형만 오려 OCR한다.
 *
 * 검색 결과 한 줄, 툴팁 하나처럼 매번 다른 영역을 읽어야 해서 확성기 프로젝트처럼
 * 고정된 "띠"가 없다 — 그때그때 Rect를 넘긴다. 판매자(닉네임) 열은 **호출하는 쪽이
 * 애초에 이 함수에 넘기지 않는 방식으로 제외한다** — 여기서 걸러내는 게 아니라
 * 아예 이 함수를 그 좌표에 대해 부르지 않는 것이 원칙이다.
 */
suspend fun ocrRegion(full: Bitmap, region: Rect): List<String> {
    val r = Rect(region).apply {
        left = left.coerceIn(0, full.width - 1)
        top = top.coerceIn(0, full.height - 1)
        right = right.coerceIn(left + 1, full.width)
        bottom = bottom.coerceIn(top + 1, full.height)
    }
    val cropped = Bitmap.createBitmap(full, r.left, r.top, r.width(), r.height())
    try {
        return ocrLines(cropped)
    } finally {
        cropped.recycle()
    }
}

/** 툴팁처럼 여러 줄을 그대로 서버에 보낼 때 쓴다 — 줄바꿈을 살려서 하나의 문자열로 합친다. */
suspend fun ocrText(full: Bitmap, region: Rect): String = ocrRegion(full, region).joinToString("\n")
