package maple.tools.collector

import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection

/**
 * 화면을 가상 디스플레이로 받아 전체 비트맵을 낸다.
 *
 * 확성기 프로젝트의 Capture와 달리 크롭을 여기서 하지 않는다. 그 프로젝트는 말풍선
 * 띠 하나로 캡처 영역이 고정이었지만, 여기서는 검색 결과 행·툴팁처럼 매번 다른
 * 사각형을 오려야 해서 자르기는 호출 쪽(Ocr.crop)에서 한다.
 */
class Capture(
    mp: MediaProjection,
    width: Int,
    height: Int,
    dpi: Int,
) {
    private var w = width
    private var h = height
    private var reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)

    // createVirtualDisplay는 MediaProjection 인스턴스당 단 한 번만 허용된다.
    // 두 번 부르면 예외가 나고 프로젝션 자체가 죽는다.
    private val display: VirtualDisplay = mp.createVirtualDisplay(
        "maple-collector", width, height, dpi,
        DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.surface, null, null,
    )

    fun ensureSize(nw: Int, nh: Int, dpi: Int) {
        if (nw == w && nh == h) return
        val old = reader
        val fresh = ImageReader.newInstance(nw, nh, PixelFormat.RGBA_8888, 2)
        display.resize(nw, nh, dpi)
        display.setSurface(fresh.surface)
        reader = fresh
        w = nw
        h = nh
        old.close()
    }

    /** 가장 최근 프레임 전체를 낸다. 아직 프레임이 없으면 null. */
    fun grab(): Bitmap? {
        val img = reader.acquireLatestImage() ?: return null
        try {
            val plane = img.planes[0]
            val pixelStride = plane.pixelStride
            // rowStride가 width*pixelStride보다 클 수 있다. 남는 폭까지 비트맵을 만든 뒤 잘라낸다.
            val padded = plane.rowStride / pixelStride
            val full = Bitmap.createBitmap(padded, img.height, Bitmap.Config.ARGB_8888)
            full.copyPixelsFromBuffer(plane.buffer)
            return if (padded == img.width) full
                else Bitmap.createBitmap(full, 0, 0, img.width, img.height)
        } finally {
            // 닫지 않으면 maxImages(2)를 채운 뒤 캡쳐가 멈춘다.
            img.close()
        }
    }

    fun close() {
        display.release()
        reader.close()
    }
}
