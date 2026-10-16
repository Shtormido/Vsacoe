package com.vsacoe.metadata.core

import com.vsacoe.metadata.core.TestFiles.value
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import org.apache.poi.xwpf.extractor.XWPFWordExtractor
import org.apache.poi.xwpf.usermodel.XWPFDocument
import org.apache.poi.xslf.usermodel.XMLSlideShow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.Instant
import java.time.ZoneOffset
import java.util.zip.ZipFile

class OoxmlHandlerTest {
    private val handler = OoxmlHandler(ZoneOffset.UTC)

    private val changes = mapOf(
        "title" to "Новый заголовок",
        "creator" to "Иван Петров",
        "keywords" to "тест, метаданные",
        "description" to "Строка 1\nСтрока 2 <&>",
        "created" to "2020-01-02 03:04:05",
        "modified" to "2021-06-07 08:09:10",
        "company" to "ООО Ромашка",
        "manager" to "Мария",
        "revision" to "7",
    )

    @Test
    fun docxEditIsReadableByPoi() {
        val src = TestFiles.fixture("doc.docx")
        val out = TestFiles.temp("docx")
        handler.write(src, out, changes)

        XWPFDocument(out.inputStream()).use { doc ->
            val core = doc.properties.coreProperties
            assertEquals("Новый заголовок", core.title)
            assertEquals("Иван Петров", core.creator)
            assertEquals("тест, метаданные", core.keywords)
            assertEquals("Строка 1\nСтрока 2 <&>", core.description)
            assertEquals(Instant.parse("2020-01-02T03:04:05Z"), core.created.toInstant())
            assertEquals(Instant.parse("2021-06-07T08:09:10Z"), core.modified.toInstant())
            assertEquals("7", core.revision)
            assertEquals("ООО Ромашка", doc.properties.extendedProperties.company)
            assertEquals("Мария", doc.properties.extendedProperties.underlyingProperties.manager)
            assertTrue(XWPFWordExtractor(doc).text.contains("Hello metadata world"))
        }

        val fields = handler.read(out)
        assertEquals("Новый заголовок", fields.value("title"))
        assertEquals("2020-01-02 03:04:05", fields.value("created"))
        assertEquals("ООО Ромашка", fields.value("company"))
    }

    @Test
    fun untouchedFieldsAreKept() {
        val src = TestFiles.fixture("doc.docx")
        val before = handler.read(src)
        val out = TestFiles.temp("docx")
        handler.write(src, out, mapOf("title" to "Только заголовок"))
        val after = handler.read(out)
        for (f in before) {
            if (f.key != "title") assertEquals(f.key, f.value, after.value(f.key))
        }
        assertEquals("Только заголовок", after.value("title"))
    }

    @Test
    fun emptyValueRemovesProperty() {
        val src = TestFiles.fixture("doc.docx")
        val step1 = TestFiles.temp("docx")
        handler.write(src, step1, changes)
        val step2 = TestFiles.temp("docx")
        handler.write(step1, step2, mapOf("creator" to "", "company" to ""))
        XWPFDocument(step2.inputStream()).use { doc ->
            assertNull(doc.properties.coreProperties.creator)
            assertNull(doc.properties.extendedProperties.company)
            assertEquals("Новый заголовок", doc.properties.coreProperties.title)
        }
    }

    @Test
    fun stripRemovesEverything() {
        val src = TestFiles.fixture("doc.docx")
        val edited = TestFiles.temp("docx")
        handler.write(src, edited, changes)
        val out = TestFiles.temp("docx")
        handler.stripAll(edited, out)
        XWPFDocument(out.inputStream()).use { doc ->
            val core = doc.properties.coreProperties
            assertNull(core.title)
            assertNull(core.creator)
            assertNull(core.created)
            assertNull(doc.properties.extendedProperties.company)
            assertTrue(XWPFWordExtractor(doc).text.contains("Hello metadata world"))
        }
        assertTrue(handler.read(out).filter { it.editable && it.key != "application" }.all { it.value.isEmpty() })
    }

    @Test
    fun xlsxEdit() {
        val src = TestFiles.fixture("sheet.xlsx")
        val out = TestFiles.temp("xlsx")
        handler.write(src, out, changes)
        XSSFWorkbook(out.inputStream()).use { wb ->
            assertEquals("Иван Петров", wb.properties.coreProperties.creator)
            assertEquals("ООО Ромашка", wb.properties.extendedProperties.company)
            assertEquals(2.0, wb.getSheetAt(0).getRow(1).getCell(1).numericCellValue, 0.0)
        }
    }

    @Test
    fun pptxEdit() {
        val src = TestFiles.temp("pptx")
        XMLSlideShow().use { ss ->
            ss.createSlide().createTextBox().text = "Слайд"
            src.outputStream().use { ss.write(it) }
        }
        val out = TestFiles.temp("pptx")
        handler.write(src, out, changes)
        XMLSlideShow(out.inputStream()).use { ss ->
            assertEquals("Новый заголовок", ss.properties.coreProperties.title)
            assertEquals(1, ss.slides.size)
        }
    }

    @Test
    fun missingCorePartIsCreated() {
        // Build a docx without docProps/core.xml.
        val src = TestFiles.fixture("doc.docx")
        val noCore = TestFiles.temp("docx")
        ZipFile(src).use { zip ->
            java.util.zip.ZipOutputStream(noCore.outputStream()).use { out ->
                for (e in zip.entries()) {
                    if (e.name == "docProps/core.xml") continue
                    var data = zip.getInputStream(e).readBytes()
                    if (e.name == "_rels/.rels") {
                        data = String(data).replace(Regex("<Relationship[^>]*core-properties[^>]*/>"), "").toByteArray()
                    }
                    out.putNextEntry(java.util.zip.ZipEntry(e.name)); out.write(data); out.closeEntry()
                }
            }
        }
        assertEquals("", handler.read(noCore).value("title"))
        val out = TestFiles.temp("docx")
        handler.write(noCore, out, mapOf("title" to "Создан"))
        XWPFDocument(out.inputStream()).use { assertEquals("Создан", it.properties.coreProperties.title) }
        assertEquals("Создан", handler.read(out).value("title"))
    }

    @Test(expected = MetadataException::class)
    fun notAZip() {
        val f = File.createTempFile("bad", ".docx").apply { writeText("hello") }
        handler.read(f)
    }
}
