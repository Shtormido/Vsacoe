package com.vsacoe.metadata.core

import com.vsacoe.metadata.core.TestFiles.value
import com.vsacoe.metadata.core.mp4.Mp4Handler
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.time.ZoneOffset

class Mp4HandlerTest {
    private val handler = Mp4Handler(ZoneOffset.UTC)

    private val changes = mapOf(
        "title" to "Мой отпуск",
        "artist" to "Иван",
        "comment" to "Комментарий",
        "copyright" to "© 2024",
        "make" to "Samsung",
        "model" to "Galaxy S24",
        "latitude" to "55.7558",
        "longitude" to "37.6173",
        "creationTime" to "2023-07-01 12:30:00",
        "modificationTime" to "2023-07-02 10:00:00",
    )

    /** Returns the sample data each chunk offset points to, per track. */
    private fun chunkSamples(f: File): List<ByteArray> {
        val bytes = f.readBytes()
        val result = ArrayList<ByteArray>()
        fun walk(start: Int, end: Int) {
            var p = start
            while (p + 8 <= end) {
                val size = ByteBuffer.wrap(bytes, p, 4).int
                val type = String(bytes, p + 4, 4, Charsets.ISO_8859_1)
                if (size < 8 || p + size > end) return
                when (type) {
                    "moov", "trak", "mdia", "minf", "stbl" -> walk(p + 8, p + size)
                    "stco" -> {
                        val n = ByteBuffer.wrap(bytes, p + 12, 4).int
                        for (i in 0 until n) {
                            val off = ByteBuffer.wrap(bytes, p + 16 + i * 4, 4).int
                            result += bytes.copyOfRange(off, off + 16)
                        }
                    }
                }
                p += size
            }
        }
        walk(0, bytes.size)
        return result
    }

    private fun check(fixture: String) {
        val src = TestFiles.fixture(fixture)
        val out = TestFiles.temp(fixture.substringAfterLast('.'))
        handler.write(src, out, changes)
        val f = handler.read(out)
        assertEquals("Мой отпуск", f.value("title"))
        assertEquals("Иван", f.value("artist"))
        assertEquals("Комментарий", f.value("comment"))
        assertEquals("© 2024", f.value("copyright"))
        assertEquals("Samsung", f.value("make"))
        assertEquals("Galaxy S24", f.value("model"))
        assertEquals("55.7558", f.value("latitude"))
        assertEquals("37.6173", f.value("longitude"))
        assertEquals("2023-07-01 12:30:00", f.value("creationTime"))
        assertEquals("2023-07-02 10:00:00", f.value("modificationTime"))
        assertNotNull(f.firstOrNull { it.key == "info.duration" })

        val a = chunkSamples(src)
        val b = chunkSamples(out)
        assertTrue(a.isNotEmpty())
        assertEquals(a.size, b.size)
        for (i in a.indices) assertArrayEquals("chunk $i", a[i], b[i])

        // Strip
        val clean = TestFiles.temp(fixture.substringAfterLast('.'))
        handler.stripAll(out, clean)
        val c = handler.read(clean)
        assertTrue(c.filter { it.editable }.all { it.value.isEmpty() })
        val d = chunkSamples(clean)
        for (i in a.indices) assertArrayEquals("chunk $i", a[i], d[i])
    }

    @Test fun moovAtEnd() = check("end.mp4")

    @Test fun moovAtStart() = check("fast.mp4")

    @Test fun quickTimeMov() = check("clip.mov")

    @Test
    fun readsExistingTags() {
        val f = handler.read(TestFiles.fixture("end.mp4"))
        assertEquals("Old title", f.value("title"))
        assertEquals("Old artist", f.value("artist"))
    }

    @Test
    fun smallEditFitsIntoFreeSpace() {
        val src = TestFiles.fixture("fast.mp4")
        val step1 = TestFiles.temp("mp4")
        handler.write(src, step1, mapOf("title" to "A very long title that makes the header grow quite a bit"))
        val step2 = TestFiles.temp("mp4")
        handler.write(step1, step2, mapOf("title" to "Short"))
        // The header shrank: the file keeps its size thanks to a free box.
        assertEquals(step1.length(), step2.length())
        assertEquals("Short", handler.read(step2).value("title"))
        val a = chunkSamples(src)
        val b = chunkSamples(step2)
        for (i in a.indices) assertArrayEquals(a[i], b[i])
    }

    @Test
    fun iso6709() {
        assertEquals(55.7558 to 37.6173, Mp4Handler.parseIso6709("+55.7558+037.6173/"))
        assertEquals(-33.8688 to 151.2093, Mp4Handler.parseIso6709("-33.8688+151.2093+010.000/"))
        val dm = Mp4Handler.parseIso6709("+5545.348+03737.038/")!!
        assertEquals(55.7558, dm.first, 0.001)
        assertEquals(37.6173, dm.second, 0.001)
    }

    @Test(expected = MetadataException::class)
    fun notAVideo() {
        val f = TestFiles.temp("mp4").apply { writeText("definitely not a video file") }
        handler.read(f)
    }

    @Suppress("unused")
    private fun topLevel(f: File) = RandomAccessFile(f, "r").use { it.length() }
}
