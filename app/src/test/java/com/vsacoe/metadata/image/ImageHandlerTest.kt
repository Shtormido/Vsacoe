package com.vsacoe.metadata.image

import androidx.exifinterface.media.ExifInterface
import com.vsacoe.metadata.core.TestFiles
import com.vsacoe.metadata.core.TestFiles.value
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.time.ZoneOffset

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ImageHandlerTest {
    private val handler = ImageHandler(ZoneOffset.UTC)

    private val changes = mapOf(
        "description" to "Закат на море",
        "comment" to "Комментарий: 日本",
        "artist" to "Иван Петров",
        "copyright" to "(c) 2024 Иван",
        "make" to "Canon",
        "model" to "EOS R5",
        "dateOriginal" to "2024-08-15 19:45:00",
        "latitude" to "43.5855",
        "longitude" to "39.7231",
        "altitude" to "12.5",
    )

    private fun check(fixture: String) {
        val src = TestFiles.fixture(fixture)
        val out = TestFiles.temp(fixture.substringAfterLast('.'))
        handler.write(src, out, changes)
        val f = handler.read(out)
        assertEquals("Закат на море", f.value("description"))
        assertEquals("Иван Петров", f.value("artist"))
        assertEquals("Комментарий: 日本", f.value("comment"))
        assertEquals("(c) 2024 Иван", f.value("copyright"))
        assertEquals("Canon", f.value("make"))
        assertEquals("EOS R5", f.value("model"))
        assertEquals("2024-08-15 19:45:00", f.value("dateOriginal"))
        assertEquals(43.5855, f.value("latitude").toDouble(), 1e-4)
        assertEquals(39.7231, f.value("longitude").toDouble(), 1e-4)
        assertEquals(12.5, f.value("altitude").toDouble(), 1e-3)

        val clean = TestFiles.temp(fixture.substringAfterLast('.'))
        handler.stripAll(out, clean)
        val c = handler.read(clean)
        assertTrue(c.filter { it.editable }.joinToString { "${it.key}=${it.value}" }, c.filter { it.editable }.all { it.value.isEmpty() })
        val exif = ExifInterface(clean)
        assertNull(exif.latLong)
        assertNull(exif.getAttribute(ExifInterface.TAG_ARTIST))
    }

    @Test fun jpeg() = check("photo.jpg")

    @Test fun png() = check("photo.png")

    @Test
    fun clearingLocationRemovesGps() {
        val src = TestFiles.fixture("photo.jpg")
        val step1 = TestFiles.temp("jpg")
        handler.write(src, step1, changes)
        val step2 = TestFiles.temp("jpg")
        handler.write(step1, step2, mapOf("latitude" to "", "longitude" to ""))
        val f = handler.read(step2)
        assertEquals("", f.value("latitude"))
        assertEquals("Иван Петров", f.value("artist"))
    }
}
