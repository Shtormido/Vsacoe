package com.vsacoe.metadata.core

import org.w3c.dom.Document
import org.w3c.dom.Element
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream
import javax.xml.parsers.DocumentBuilderFactory
import javax.xml.transform.OutputKeys
import javax.xml.transform.TransformerFactory
import javax.xml.transform.dom.DOMSource
import javax.xml.transform.stream.StreamResult

/**
 * Office Open XML documents (Word/Excel/PowerPoint/Visio 2007+).
 * Edits docProps/core.xml (core properties) and docProps/app.xml (extended properties).
 */
class OoxmlHandler(private val zone: ZoneId = ZoneId.systemDefault()) : MetadataHandler {

    private class CoreProp(val key: String, val ns: String, val prefix: String, val local: String,
                           val label: String, val type: FieldType, val group: String)

    private class AppProp(val key: String, val local: String, val label: String,
                          val type: FieldType, val group: String)

    private class Parts(val core: String?, val app: String?, val custom: String?)

    override fun formatName(extension: String): String = when (extension) {
        "docx", "docm", "dotx", "dotm" -> "Документ Word (${extension.uppercase()})"
        "xlsx", "xlsm", "xltx", "xltm", "xlsb" -> "Книга Excel (${extension.uppercase()})"
        "pptx", "pptm", "potx", "potm", "ppsx", "ppsm" -> "Презентация PowerPoint (${extension.uppercase()})"
        "vsdx", "vsdm" -> "Схема Visio (${extension.uppercase()})"
        else -> "Документ Office (${extension.uppercase()})"
    }

    override fun read(file: File): List<MetaField> {
        val zip = openZip(file)
        zip.use {
            val parts = findParts(zip)
            val core = parts.core?.let { readEntry(zip, it) }?.let { readCore(it) } ?: emptyMap()
            val appDoc = parts.app?.let { readEntry(zip, it) }?.let { parseXml(it) }

            val fields = ArrayList<MetaField>()
            for (p in CORE_PROPS) {
                val raw = core[p.key].orEmpty()
                val value = if (p.type == FieldType.DATETIME) rawDateToDisplay(raw) else raw
                fields += MetaField(p.key, p.label, value, p.type, p.group)
            }
            for (p in APP_PROPS) {
                val value = appDoc?.let { findAppElement(it, p.local)?.textContent?.trim() }.orEmpty()
                fields += MetaField(p.key, p.label, value, p.type, p.group)
            }
            appDoc?.let { doc ->
                for ((local, label) in APP_INFO) {
                    val v = findAppElement(doc, local)?.textContent?.trim()
                    if (!v.isNullOrEmpty()) fields += MetaField("info.$local", label, v, group = Groups.INFO, editable = false)
                }
            }
            return fields
        }
    }

    override fun write(source: File, target: File, values: Map<String, String>) =
        rewrite(source, target, values, strip = false)

    override fun stripAll(source: File, target: File) =
        rewrite(source, target, emptyMap(), strip = true)

    private fun rewrite(source: File, target: File, values: Map<String, String>, strip: Boolean) {
        val zip = openZip(source)
        zip.use {
            val parts = findParts(zip)

            // New core.xml content: existing raw values with the changes applied.
            val coreValues = LinkedHashMap<String, String>()
            if (!strip) {
                parts.core?.let { readEntry(zip, it) }?.let { coreValues.putAll(readCore(it)) }
                for (p in CORE_PROPS) {
                    val v = values[p.key] ?: continue
                    val raw = if (p.type == FieldType.DATETIME) displayDateToRaw(v) else v.trim()
                    if (raw.isEmpty()) coreValues.remove(p.key) else coreValues[p.key] = raw
                }
            }
            val coreXml = buildCore(coreValues)
            val coreName = parts.core ?: "docProps/core.xml"

            val appChanges = APP_PROPS.filter { strip || values.containsKey(it.key) }
            val newApp: ByteArray? = parts.app?.let { name ->
                if (appChanges.isEmpty()) null else {
                    val doc = parseXml(readEntry(zip, name))
                    if (strip) {
                        for (local in APP_STRIP) findAppElement(doc, local)?.let { it.parentNode.removeChild(it) }
                    } else {
                        for (p in appChanges) setAppElement(doc, p.local, values[p.key]!!.trim())
                    }
                    serializeXml(doc)
                }
            }
            val newCustom: ByteArray? = if (strip && parts.custom != null) EMPTY_CUSTOM.toByteArray() else null

            val needNewCore = parts.core == null && coreValues.isNotEmpty()
            val appMissingButNeeded = parts.app == null && !strip && appChanges.any { values[it.key]!!.isNotBlank() }
            val appName = "docProps/app.xml"

            ZipOutputStream(target.outputStream().buffered()).use { out ->
                val entries = zip.entries()
                while (entries.hasMoreElements()) {
                    val e = entries.nextElement()
                    val data: ByteArray = when {
                        e.name == parts.core -> coreXml.toByteArray()
                        e.name == parts.app && newApp != null -> newApp
                        e.name == parts.custom && newCustom != null -> newCustom
                        e.name == CONTENT_TYPES && (needNewCore || appMissingButNeeded) -> {
                            var ct = String(readEntry(zip, e.name), Charsets.UTF_8)
                            if (needNewCore) ct = addContentType(ct, "/$coreName", CORE_CT)
                            if (appMissingButNeeded) ct = addContentType(ct, "/$appName", APP_CT)
                            ct.toByteArray()
                        }
                        e.name == ROOT_RELS && (needNewCore || appMissingButNeeded) -> {
                            var rels = String(readEntry(zip, e.name), Charsets.UTF_8)
                            if (needNewCore) rels = addRelationship(rels, CORE_REL, coreName)
                            if (appMissingButNeeded) rels = addRelationship(rels, APP_REL, appName)
                            rels.toByteArray()
                        }
                        e.isDirectory -> ByteArray(0)
                        else -> readEntry(zip, e.name)
                    }
                    out.putNextEntry(ZipEntry(e.name).apply { if (e.time > 0) time = e.time })
                    out.write(data)
                    out.closeEntry()
                }
                if (needNewCore) {
                    out.putNextEntry(ZipEntry(coreName))
                    out.write(coreXml.toByteArray())
                    out.closeEntry()
                }
                if (appMissingButNeeded) {
                    val doc = parseXml(EMPTY_APP.toByteArray())
                    for (p in appChanges) setAppElement(doc, p.local, values[p.key]!!.trim())
                    out.putNextEntry(ZipEntry(appName))
                    out.write(serializeXml(doc))
                    out.closeEntry()
                }
            }
        }
    }

    // ---------------------------------------------------------------- parts

    private fun openZip(file: File): ZipFile = try {
        ZipFile(file).also {
            if (it.getEntry(CONTENT_TYPES) == null) {
                it.close()
                throw MetadataException("Это не документ Office: внутри нет [Content_Types].xml")
            }
        }
    } catch (e: java.util.zip.ZipException) {
        throw MetadataException("Файл повреждён или защищён паролем (не удалось открыть как ZIP)", e)
    }

    private fun findParts(zip: ZipFile): Parts {
        var core: String? = null
        var app: String? = null
        var custom: String? = null
        zip.getEntry(ROOT_RELS)?.let {
            val doc = parseXml(readEntry(zip, ROOT_RELS))
            val rels = doc.getElementsByTagNameNS("*", "Relationship")
            for (i in 0 until rels.length) {
                val r = rels.item(i) as Element
                val type = r.getAttribute("Type")
                val target = r.getAttribute("Target").removePrefix("/")
                if (r.getAttribute("TargetMode") == "External") continue
                when {
                    type.endsWith("/metadata/core-properties") -> core = target
                    type.endsWith("/extended-properties") -> app = target
                    type.endsWith("/custom-properties") -> custom = target
                }
            }
        }
        return Parts(
            core?.takeIf { zip.getEntry(it) != null },
            app?.takeIf { zip.getEntry(it) != null },
            custom?.takeIf { zip.getEntry(it) != null },
        )
    }

    private fun readEntry(zip: ZipFile, name: String): ByteArray =
        zip.getInputStream(zip.getEntry(name)).use(InputStream::readBytes)

    // ---------------------------------------------------------------- core.xml

    private fun readCore(bytes: ByteArray): Map<String, String> {
        val doc = parseXml(bytes)
        val result = LinkedHashMap<String, String>()
        val children = doc.documentElement.childNodes
        for (i in 0 until children.length) {
            val el = children.item(i) as? Element ?: continue
            val prop = CORE_PROPS.firstOrNull { it.ns == el.namespaceURI && it.local == el.localName } ?: continue
            result[prop.key] = el.textContent.trim()
        }
        return result
    }

    private fun buildCore(values: Map<String, String>): String {
        val sb = StringBuilder()
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n")
        sb.append("<cp:coreProperties xmlns:cp=\"$NS_CP\" xmlns:dc=\"$NS_DC\" xmlns:dcterms=\"$NS_DCTERMS\" ")
        sb.append("xmlns:dcmitype=\"http://purl.org/dc/dcmitype/\" xmlns:xsi=\"$NS_XSI\">")
        for (p in CORE_PROPS) {
            val v = values[p.key] ?: continue
            val qname = "${p.prefix}:${p.local}"
            val typeAttr = if (p.ns == NS_DCTERMS) " xsi:type=\"dcterms:W3CDTF\"" else ""
            sb.append("<$qname$typeAttr>").append(escapeXml(v)).append("</$qname>")
        }
        sb.append("</cp:coreProperties>")
        return sb.toString()
    }

    private fun rawDateToDisplay(raw: String): String {
        if (raw.isBlank()) return ""
        return try {
            DateUtil.format(OffsetDateTime.parse(raw).toInstant(), zone)
        } catch (e: Exception) {
            try {
                DateUtil.format(java.time.LocalDateTime.parse(raw).toInstant(ZoneOffset.UTC), zone)
            } catch (e2: Exception) {
                raw
            }
        }
    }

    private fun displayDateToRaw(display: String): String {
        val instant: Instant = DateUtil.parse(display, zone) ?: return ""
        return DateTimeFormatter.ISO_INSTANT.format(instant.truncatedTo(java.time.temporal.ChronoUnit.SECONDS))
    }

    // ---------------------------------------------------------------- app.xml

    private fun findAppElement(doc: Document, local: String): Element? {
        val children = doc.documentElement.childNodes
        for (i in 0 until children.length) {
            val el = children.item(i) as? Element ?: continue
            if (el.localName == local) return el
        }
        return null
    }

    private fun setAppElement(doc: Document, local: String, value: String) {
        val existing = findAppElement(doc, local)
        if (value.isEmpty()) {
            existing?.let { it.parentNode.removeChild(it) }
            return
        }
        val el = existing ?: doc.createElementNS(NS_APP, local).also { doc.documentElement.appendChild(it) }
        el.textContent = value
    }

    // ---------------------------------------------------------------- xml helpers

    private fun parseXml(bytes: ByteArray): Document {
        val f = DocumentBuilderFactory.newInstance()
        f.isNamespaceAware = true
        try {
            f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
        } catch (_: Exception) {
        }
        return f.newDocumentBuilder().parse(bytes.inputStream())
    }

    private fun serializeXml(doc: Document): ByteArray {
        val t = TransformerFactory.newInstance().newTransformer()
        t.setOutputProperty(OutputKeys.ENCODING, "UTF-8")
        t.setOutputProperty(OutputKeys.INDENT, "no")
        doc.xmlStandalone = true
        val out = ByteArrayOutputStream()
        t.transform(DOMSource(doc), StreamResult(out))
        return out.toByteArray()
    }

    private fun addContentType(xml: String, partName: String, contentType: String): String {
        if (xml.contains("PartName=\"$partName\"")) return xml
        val idx = xml.lastIndexOf("</Types>")
        if (idx < 0) throw MetadataException("Повреждён файл [Content_Types].xml")
        return xml.substring(0, idx) + "<Override PartName=\"$partName\" ContentType=\"$contentType\"/>" + xml.substring(idx)
    }

    private fun addRelationship(xml: String, type: String, target: String): String {
        val idx = xml.lastIndexOf("</Relationships>")
        if (idx < 0) throw MetadataException("Повреждён файл _rels/.rels")
        var n = 1
        while (xml.contains("Id=\"rIdMeta$n\"")) n++
        return xml.substring(0, idx) + "<Relationship Id=\"rIdMeta$n\" Type=\"$type\" Target=\"$target\"/>" + xml.substring(idx)
    }

    private fun escapeXml(s: String): String = buildString {
        for (c in s) when (c) {
            '<' -> append("&lt;")
            '>' -> append("&gt;")
            '&' -> append("&amp;")
            '"' -> append("&quot;")
            else -> if (c < ' ' && c != '\n' && c != '\r' && c != '\t') Unit else append(c)
        }
    }

    companion object {
        val EXTENSIONS = setOf(
            "docx", "docm", "dotx", "dotm",
            "xlsx", "xlsm", "xltx", "xltm", "xlsb",
            "pptx", "pptm", "potx", "potm", "ppsx", "ppsm",
            "vsdx", "vsdm",
        )

        private const val CONTENT_TYPES = "[Content_Types].xml"
        private const val ROOT_RELS = "_rels/.rels"
        private const val NS_CP = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
        private const val NS_DC = "http://purl.org/dc/elements/1.1/"
        private const val NS_DCTERMS = "http://purl.org/dc/terms/"
        private const val NS_XSI = "http://www.w3.org/2001/XMLSchema-instance"
        private const val NS_APP = "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
        private const val CORE_CT = "application/vnd.openxmlformats-package.core-properties+xml"
        private const val APP_CT = "application/vnd.openxmlformats-officedocument.extended-properties+xml"
        private const val CORE_REL = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties"
        private const val APP_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties"

        private const val EMPTY_APP = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
            "<Properties xmlns=\"$NS_APP\" xmlns:vt=\"http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes\"></Properties>"
        private const val EMPTY_CUSTOM = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
            "<Properties xmlns=\"http://schemas.openxmlformats.org/officeDocument/2006/custom-properties\" " +
            "xmlns:vt=\"http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes\"/>"

        private val CORE_PROPS = listOf(
            CoreProp("title", NS_DC, "dc", "title", "Название", FieldType.TEXT, Groups.DESCRIPTION),
            CoreProp("subject", NS_DC, "dc", "subject", "Тема", FieldType.TEXT, Groups.DESCRIPTION),
            CoreProp("keywords", NS_CP, "cp", "keywords", "Ключевые слова (теги)", FieldType.TEXT, Groups.DESCRIPTION),
            CoreProp("description", NS_DC, "dc", "description", "Примечания", FieldType.MULTILINE, Groups.DESCRIPTION),
            CoreProp("category", NS_CP, "cp", "category", "Категория", FieldType.TEXT, Groups.DESCRIPTION),
            CoreProp("contentStatus", NS_CP, "cp", "contentStatus", "Состояние", FieldType.TEXT, Groups.DESCRIPTION),
            CoreProp("language", NS_DC, "dc", "language", "Язык", FieldType.TEXT, Groups.DESCRIPTION),
            CoreProp("identifier", NS_DC, "dc", "identifier", "Идентификатор", FieldType.TEXT, Groups.DESCRIPTION),
            CoreProp("version", NS_CP, "cp", "version", "Версия", FieldType.TEXT, Groups.DESCRIPTION),
            CoreProp("creator", NS_DC, "dc", "creator", "Автор", FieldType.TEXT, Groups.AUTHORSHIP),
            CoreProp("lastModifiedBy", NS_CP, "cp", "lastModifiedBy", "Кем сохранён", FieldType.TEXT, Groups.AUTHORSHIP),
            CoreProp("revision", NS_CP, "cp", "revision", "Номер редакции", FieldType.INTEGER, Groups.AUTHORSHIP),
            CoreProp("created", NS_DCTERMS, "dcterms", "created", "Дата создания", FieldType.DATETIME, Groups.DATES),
            CoreProp("modified", NS_DCTERMS, "dcterms", "modified", "Дата изменения", FieldType.DATETIME, Groups.DATES),
            CoreProp("lastPrinted", NS_CP, "cp", "lastPrinted", "Последняя печать", FieldType.DATETIME, Groups.DATES),
        )

        private val APP_PROPS = listOf(
            AppProp("company", "Company", "Организация", FieldType.TEXT, Groups.AUTHORSHIP),
            AppProp("manager", "Manager", "Руководитель", FieldType.TEXT, Groups.AUTHORSHIP),
            AppProp("totalTime", "TotalTime", "Время правки (минут)", FieldType.INTEGER, Groups.DATES),
            AppProp("application", "Application", "Программа", FieldType.TEXT, Groups.DEVICE),
            AppProp("template", "Template", "Шаблон", FieldType.TEXT, Groups.DEVICE),
            AppProp("hyperlinkBase", "HyperlinkBase", "База гиперссылок", FieldType.TEXT, Groups.DEVICE),
        )

        private val APP_STRIP = listOf("Company", "Manager", "TotalTime", "Template", "HyperlinkBase", "AppVersion")

        private val APP_INFO = listOf(
            "Pages" to "Страниц", "Words" to "Слов", "Characters" to "Символов",
            "Slides" to "Слайдов", "AppVersion" to "Версия программы",
        )
    }
}
