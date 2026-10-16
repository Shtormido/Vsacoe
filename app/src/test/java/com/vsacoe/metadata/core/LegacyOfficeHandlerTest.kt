package com.vsacoe.metadata.core

import com.vsacoe.metadata.core.TestFiles.value
import com.vsacoe.metadata.core.cfb.CompoundFile
import org.apache.poi.hpsf.DocumentSummaryInformation
import org.apache.poi.hpsf.SummaryInformation
import org.apache.poi.hslf.usermodel.HSLFSlideShow
import org.apache.poi.hssf.usermodel.HSSFWorkbook
import org.apache.poi.hwpf.HWPFDocument
import org.apache.poi.hwpf.extractor.WordExtractor
import org.apache.poi.poifs.filesystem.DirectoryEntry
import org.apache.poi.poifs.filesystem.DocumentEntry
import org.apache.poi.poifs.filesystem.DocumentInputStream
import org.apache.poi.poifs.filesystem.POIFSFileSystem
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.time.Instant
import java.time.ZoneOffset
import kotlin.random.Random

class LegacyOfficeHandlerTest {
    private val handler = LegacyOfficeHandler(ZoneOffset.UTC)

    private val changes = mapOf(
        "title" to "Отчёт за год",
        "author" to "Иван Петров",
        "lastAuthor" to "Мария",
        "keywords" to "тест",
        "comments" to "Комментарий",
        "created" to "2019-02-03 04:05:06",
        "lastSaved" to "2022-12-31 23:59:59",
        "company" to "ООО Ромашка",
        "manager" to "Директор",
        "category" to "Отчёты",
    )

    private fun assertProps(si: SummaryInformation, dsi: DocumentSummaryInformation) {
        assertEquals("Отчёт за год", si.title)
        assertEquals("Иван Петров", si.author)
        assertEquals("Мария", si.lastAuthor)
        assertEquals("тест", si.keywords)
        assertEquals("Комментарий", si.comments)
        assertEquals(Instant.parse("2019-02-03T04:05:06Z"), si.createDateTime.toInstant())
        assertEquals(Instant.parse("2022-12-31T23:59:59Z"), si.lastSaveDateTime.toInstant())
        assertEquals("ООО Ромашка", dsi.company)
        assertEquals("Директор", dsi.manager)
        assertEquals("Отчёты", dsi.category)
    }

    @Test
    fun docEditIsReadableByPoi() {
        val src = TestFiles.fixture("doc.doc")
        val out = TestFiles.temp("doc")
        handler.write(src, out, changes)
        HWPFDocument(out.inputStream()).use { doc ->
            assertProps(doc.summaryInformation, doc.documentSummaryInformation)
            assertTrue(WordExtractor(doc).text.contains("Hello metadata world"))
        }
        val fields = handler.read(out)
        assertEquals("Отчёт за год", fields.value("title"))
        assertEquals("2019-02-03 04:05:06", fields.value("created"))
        assertEquals("ООО Ромашка", fields.value("company"))
    }

    @Test
    fun asciiEditKeepsCodePage() {
        val src = TestFiles.fixture("doc.doc")
        val out = TestFiles.temp("doc")
        handler.write(src, out, mapOf("title" to "Plain title"))
        HWPFDocument(out.inputStream()).use { doc ->
            assertEquals("Plain title", doc.summaryInformation.title)
        }
        val before = handler.read(src)
        val after = handler.read(out)
        for (f in before) if (f.key != "title") assertEquals(f.key, f.value, after.value(f.key))
    }

    @Test
    fun xlsEditAndStrip() {
        val src = TestFiles.fixture("sheet.xls")
        val out = TestFiles.temp("xls")
        handler.write(src, out, changes)
        HSSFWorkbook(out.inputStream()).use { wb ->
            assertProps(wb.summaryInformation, wb.documentSummaryInformation)
            assertEquals(3.0, wb.getSheetAt(0).getRow(1).getCell(2).numericCellValue, 0.0)
        }
        val clean = TestFiles.temp("xls")
        handler.stripAll(out, clean)
        HSSFWorkbook(clean.inputStream()).use { wb ->
            assertNull(wb.summaryInformation.title)
            assertNull(wb.summaryInformation.author)
            assertNull(wb.summaryInformation.createDateTime)
            assertNull(wb.documentSummaryInformation.company)
            assertEquals(3.0, wb.getSheetAt(0).getRow(1).getCell(2).numericCellValue, 0.0)
        }
        assertTrue(handler.read(clean).filter { it.editable }.all { it.value.isEmpty() })
    }

    @Test
    fun pptEditCreatedByPoi() {
        val src = TestFiles.temp("ppt")
        HSLFSlideShow().use { ss ->
            ss.createSlide().createTextBox().text = "Слайд один"
            src.outputStream().use { ss.write(it) }
        }
        val out = TestFiles.temp("ppt")
        handler.write(src, out, changes)
        HSLFSlideShow(out.inputStream()).use { ss ->
            assertProps(ss.summaryInformation, ss.documentSummaryInformation)
            assertEquals(1, ss.slides.size)
        }
    }

    @Test
    fun createsMissingPropertyStreams() {
        val src = TestFiles.temp("doc")
        POIFSFileSystem().use { fs ->
            fs.createDocument(ByteArrayInputStream(ByteArray(5000) { it.toByte() }), "WordDocument")
            for (i in 0 until 9) fs.createDocument(ByteArrayInputStream(ByteArray(10 + i)), "S$i")
            src.outputStream().use { fs.writeFilesystem(it) }
        }
        val out = TestFiles.temp("doc")
        handler.write(src, out, changes)
        POIFSFileSystem(out).use { fs ->
            val si = org.apache.poi.hpsf.PropertySetFactory.create(fs.root, SummaryInformation.DEFAULT_STREAM_NAME) as SummaryInformation
            val dsi = org.apache.poi.hpsf.PropertySetFactory.create(fs.root, DocumentSummaryInformation.DEFAULT_STREAM_NAME) as DocumentSummaryInformation
            assertProps(si, dsi)
            assertEquals(5000, (fs.root.getEntry("WordDocument") as DocumentEntry).size)
            assertEquals(12, fs.root.entryCount)
        }
    }

    @Test
    fun compoundFileRoundTripLargeAndNested() {
        val rnd = Random(42)
        val big = ByteArray(9 * 1024 * 1024).also { rnd.nextBytes(it) } // forces DIFAT sectors
        val mid = ByteArray(70_000).also { rnd.nextBytes(it) }
        val small = ByteArray(300).also { rnd.nextBytes(it) }
        val bos = ByteArrayOutputStream()
        POIFSFileSystem().use { fs ->
            fs.createDocument(ByteArrayInputStream(big), "Big")
            fs.createDocument(ByteArrayInputStream(mid), "Mid")
            fs.createDocument(ByteArrayInputStream(small), "Small")
            fs.createDocument(ByteArrayInputStream(ByteArray(0)), "Empty")
            val dir = fs.root.createDirectory("Nested")
            dir.createDocument("Inner", ByteArrayInputStream(small))
            dir.createDocument("InnerBig", ByteArrayInputStream(mid))
            fs.writeFilesystem(bos)
        }
        val rewritten = CompoundFile.read(bos.toByteArray()).toBytes()
        POIFSFileSystem(ByteArrayInputStream(rewritten)).use { fs ->
            fun read(dir: DirectoryEntry, name: String) =
                DocumentInputStream(dir.getEntry(name) as DocumentEntry).use { it.readAllBytes() }
            assertArrayEquals(big, read(fs.root, "Big"))
            assertArrayEquals(mid, read(fs.root, "Mid"))
            assertArrayEquals(small, read(fs.root, "Small"))
            assertEquals(0, read(fs.root, "Empty").size)
            val nested = fs.root.getEntry("Nested") as DirectoryEntry
            assertArrayEquals(small, read(nested, "Inner"))
            assertArrayEquals(mid, read(nested, "InnerBig"))
        }
    }

    @Test(expected = MetadataException::class)
    fun rejectsNonOleFile() {
        val f = TestFiles.temp("doc").apply { writeText("{\\rtf1 not a real doc}") }
        handler.read(f)
    }
}
