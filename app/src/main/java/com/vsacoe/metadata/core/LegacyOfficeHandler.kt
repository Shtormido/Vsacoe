package com.vsacoe.metadata.core

import com.vsacoe.metadata.core.cfb.CompoundFile
import com.vsacoe.metadata.core.cfb.PropertySet
import java.io.File
import java.time.ZoneId

/** Office 97-2003 binary documents: .doc, .xls, .ppt and their templates. */
class LegacyOfficeHandler(private val zone: ZoneId = ZoneId.systemDefault()) : MetadataHandler {

    private enum class Kind { STRING, DATE, INT }

    private class Prop(val key: String, val summary: Boolean, val pid: Int, val kind: Kind,
                       val label: String, val type: FieldType, val group: String)

    override fun formatName(extension: String): String = when (extension) {
        "doc", "dot" -> "Документ Word 97-2003 (${extension.uppercase()})"
        "xls", "xlt" -> "Книга Excel 97-2003 (${extension.uppercase()})"
        "ppt", "pot", "pps" -> "Презентация PowerPoint 97-2003 (${extension.uppercase()})"
        "vsd" -> "Схема Visio 2003 (VSD)"
        "pub" -> "Публикация Publisher (PUB)"
        "msg" -> "Письмо Outlook (MSG)"
        else -> "Документ Office 97-2003 (${extension.uppercase()})"
    }

    override fun read(file: File): List<MetaField> {
        val cf = CompoundFile.read(file.readBytes())
        val si = cf.findRootStream(PropertySet.SUMMARY_STREAM)?.let { PropertySet.parse(it.data) }
            ?.section(PropertySet.FMTID_SUMMARY)
        val dsi = cf.findRootStream(PropertySet.DOC_SUMMARY_STREAM)?.let { PropertySet.parse(it.data) }
            ?.section(PropertySet.FMTID_DOC_SUMMARY)

        val fields = ArrayList<MetaField>()
        for (p in PROPS) {
            val s = if (p.summary) si else dsi
            val value = when (p.kind) {
                Kind.STRING -> s?.getString(p.pid)
                Kind.DATE -> s?.getFileTime(p.pid)?.let { DateUtil.format(it, zone) }
                Kind.INT -> s?.getInt(p.pid)?.toString()
            }.orEmpty()
            fields += MetaField(p.key, p.label, value, p.type, p.group)
        }
        si?.let { s ->
            s.getInt(14)?.let { fields += MetaField("info.pages", "Страниц", it.toString(), group = Groups.INFO, editable = false) }
            s.getInt(15)?.let { fields += MetaField("info.words", "Слов", it.toString(), group = Groups.INFO, editable = false) }
            s.getInt(16)?.let { fields += MetaField("info.chars", "Символов", it.toString(), group = Groups.INFO, editable = false) }
            s.getFileTime(10)?.let { ft ->
                // Edit time is stored as a duration in FILETIME units.
                val minutes = PropertySet.instantToFileTime(ft) / 600_000_000L
                if (minutes in 0..10_000_000) fields += MetaField("info.edittime", "Время правки (минут)", minutes.toString(), group = Groups.INFO, editable = false)
            }
        }
        return fields
    }

    override fun write(source: File, target: File, values: Map<String, String>) {
        val cf = CompoundFile.read(source.readBytes())
        val siChanges = PROPS.filter { it.summary && values.containsKey(it.key) }
        val dsiChanges = PROPS.filter { !it.summary && values.containsKey(it.key) }
        if (siChanges.isNotEmpty()) updateStream(cf, PropertySet.SUMMARY_STREAM, PropertySet.FMTID_SUMMARY, siChanges, values)
        if (dsiChanges.isNotEmpty()) updateStream(cf, PropertySet.DOC_SUMMARY_STREAM, PropertySet.FMTID_DOC_SUMMARY, dsiChanges, values)
        target.writeBytes(cf.toBytes())
    }

    override fun stripAll(source: File, target: File) {
        val cf = CompoundFile.read(source.readBytes())
        cf.findRootStream(PropertySet.SUMMARY_STREAM)?.let { stream ->
            val ps = PropertySet.parse(stream.data)
            ps.section(PropertySet.FMTID_SUMMARY)?.let { s -> s.props.retainAll { it.id in SUMMARY_KEEP } }
            stream.data = ps.toBytes()
        }
        cf.findRootStream(PropertySet.DOC_SUMMARY_STREAM)?.let { stream ->
            val ps = PropertySet.parse(stream.data)
            // Drops the custom-properties section as well.
            ps.sections.retainAll { it.fmtid.contentEquals(PropertySet.FMTID_DOC_SUMMARY) }
            ps.sections.firstOrNull()?.props?.retainAll { it.id == PropertySet.PID_CODEPAGE }
            stream.data = ps.toBytes()
        }
        target.writeBytes(cf.toBytes())
    }

    private fun updateStream(cf: CompoundFile, name: String, fmtid: ByteArray, changes: List<Prop>, values: Map<String, String>) {
        val existing = cf.findRootStream(name)
        if (existing == null && changes.all { values[it.key].isNullOrBlank() }) return
        val ps = existing?.let { PropertySet.parse(it.data) } ?: PropertySet.create(fmtid)
        val section = ps.section(fmtid) ?: PropertySet.create(fmtid).sections[0].also { ps.sections.add(0, it) }
        for (p in changes) {
            val v = values[p.key]!!.trim()
            when (p.kind) {
                Kind.STRING -> section.setString(p.pid, v)
                Kind.DATE -> section.setFileTime(p.pid, DateUtil.parse(v, zone))
                Kind.INT -> section.setInt(p.pid, v.takeIf { it.isNotEmpty() }?.toLongOrNull()
                    ?: if (v.isEmpty()) null else throw MetadataException("«${p.label}»: нужно целое число"))
            }
        }
        (existing ?: cf.getOrCreateRootStream(name)).data = ps.toBytes()
    }

    companion object {
        val EXTENSIONS = setOf("doc", "dot", "xls", "xlt", "ppt", "pot", "pps", "vsd", "pub", "msg")

        /** Code page and the "read-only recommended / password" flag. */
        private val SUMMARY_KEEP = setOf(PropertySet.PID_CODEPAGE, 19)

        private val PROPS = listOf(
            Prop("title", true, 2, Kind.STRING, "Название", FieldType.TEXT, Groups.DESCRIPTION),
            Prop("subject", true, 3, Kind.STRING, "Тема", FieldType.TEXT, Groups.DESCRIPTION),
            Prop("keywords", true, 5, Kind.STRING, "Ключевые слова (теги)", FieldType.TEXT, Groups.DESCRIPTION),
            Prop("comments", true, 6, Kind.STRING, "Примечания", FieldType.MULTILINE, Groups.DESCRIPTION),
            Prop("category", false, 2, Kind.STRING, "Категория", FieldType.TEXT, Groups.DESCRIPTION),
            Prop("author", true, 4, Kind.STRING, "Автор", FieldType.TEXT, Groups.AUTHORSHIP),
            Prop("lastAuthor", true, 8, Kind.STRING, "Кем сохранён", FieldType.TEXT, Groups.AUTHORSHIP),
            Prop("revision", true, 9, Kind.STRING, "Номер редакции", FieldType.TEXT, Groups.AUTHORSHIP),
            Prop("company", false, 15, Kind.STRING, "Организация", FieldType.TEXT, Groups.AUTHORSHIP),
            Prop("manager", false, 14, Kind.STRING, "Руководитель", FieldType.TEXT, Groups.AUTHORSHIP),
            Prop("created", true, 12, Kind.DATE, "Дата создания", FieldType.DATETIME, Groups.DATES),
            Prop("lastSaved", true, 13, Kind.DATE, "Дата изменения", FieldType.DATETIME, Groups.DATES),
            Prop("lastPrinted", true, 11, Kind.DATE, "Последняя печать", FieldType.DATETIME, Groups.DATES),
            Prop("application", true, 18, Kind.STRING, "Программа", FieldType.TEXT, Groups.DEVICE),
            Prop("template", true, 7, Kind.STRING, "Шаблон", FieldType.TEXT, Groups.DEVICE),
        )
    }
}
