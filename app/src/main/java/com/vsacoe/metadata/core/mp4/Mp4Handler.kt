package com.vsacoe.metadata.core.mp4

import com.vsacoe.metadata.core.DateUtil
import com.vsacoe.metadata.core.FieldType
import com.vsacoe.metadata.core.Groups
import com.vsacoe.metadata.core.MetaField
import com.vsacoe.metadata.core.MetadataException
import com.vsacoe.metadata.core.MetadataHandler
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.time.Instant
import java.time.ZoneId
import java.util.Locale

/**
 * MP4 / MOV / M4V / 3GP video (and M4A audio).
 *
 * Reads tags from all three common places: iTunes-style `moov/udta/meta/ilst`,
 * Apple `moov/meta` (mdta keys, used by iPhones) and classic QuickTime `udta` text
 * atoms. Writes iTunes-style tags plus `©xyz/©mak/©mod` (read by Android and
 * ffmpeg) and updates the Apple keys when the file already has them.
 * The media data is never touched; chunk offsets are fixed up when `moov` moves.
 */
class Mp4Handler(private val zone: ZoneId = ZoneId.systemDefault()) : MetadataHandler {

    private class TagDef(
        val key: String, val label: String, val type: FieldType, val group: String,
        val ilst: String?, val mdta: List<String>, val udta: List<String>,
    )

    private class TopBox(val type: String, val offset: Long, val size: Long)

    override fun formatName(extension: String): String = when (extension) {
        "mov", "qt" -> "Видео QuickTime (MOV)"
        "m4a" -> "Аудио MPEG-4 (M4A)"
        "3gp", "3g2" -> "Видео 3GP"
        else -> "Видео MPEG-4 (${extension.uppercase()})"
    }

    override fun read(file: File): List<MetaField> {
        val (_, moov) = load(file)
        val ilst = moov.path("udta", "meta", "ilst")
        val mdta = readMdta(moov)
        val udta = moov.child("udta")

        val fields = ArrayList<MetaField>()
        for (t in TAGS) {
            val v = t.ilst?.let { ilst?.child(it)?.let(::itemText) }
                ?: t.mdta.firstNotNullOfOrNull { mdta[it] }
                ?: t.udta.firstNotNullOfOrNull { name -> udta?.child(name)?.let { qtText(it.payload) } }
            fields += MetaField(t.key, t.label, v.orEmpty().trim(), t.type, t.group)
        }

        val iso = udta?.child(XYZ)?.let { qtText(it.payload) } ?: mdta[KEY_LOCATION]
        val loc = iso?.let(::parseIso6709)
        fields += MetaField("latitude", "Широта", loc?.first?.let(::fmtCoord).orEmpty(), FieldType.DECIMAL, Groups.LOCATION)
        fields += MetaField("longitude", "Долгота", loc?.second?.let(::fmtCoord).orEmpty(), FieldType.DECIMAL, Groups.LOCATION)

        val mvhd = moov.child("mvhd")?.payload
        val times = mvhd?.let(::readTimes)
        fields += MetaField("creationTime", "Дата создания", times?.first?.let { DateUtil.format(it, zone) }.orEmpty(), FieldType.DATETIME, Groups.DATES)
        fields += MetaField("modificationTime", "Дата изменения", times?.second?.let { DateUtil.format(it, zone) }.orEmpty(), FieldType.DATETIME, Groups.DATES)

        mvhd?.let { readDuration(it) }?.let { sec ->
            fields += MetaField("info.duration", "Длительность", formatDuration(sec), group = Groups.INFO, editable = false)
        }
        videoSize(moov)?.let { fields += MetaField("info.size", "Разрешение", it, group = Groups.INFO, editable = false) }
        return fields
    }

    override fun write(source: File, target: File, values: Map<String, String>) {
        val (boxes, moov) = load(source)
        applyValues(moov, values)
        save(source, target, boxes, moov)
    }

    override fun stripAll(source: File, target: File) {
        val (boxes, moov) = load(source)
        moov.children!!.removeAll { it.type == "udta" || it.type == "meta" || it.type == "uuid" }
        for (trak in moov.childrenOf("trak")) {
            trak.children?.removeAll { it.type == "udta" || it.type == "meta" }
        }
        setTimes(moov, 0, setCreation = true, setModification = true)
        save(source, target, boxes, moov)
    }

    // ---------------------------------------------------------------- editing

    private fun applyValues(moov: Atom, values: Map<String, String>) {
        val mdtaMeta = moov.child("meta")?.takeIf { handlerType(it) == "mdta" }
        val udta = moov.getOrCreate("udta") { children = mutableListOf() }
        if (!udta.isContainer) throw MetadataException("Не удалось разобрать блок udta в этом видео")

        for (t in TAGS) {
            val v = values[t.key]?.trim() ?: continue
            // Remove stale copies in classic QuickTime atoms.
            udta.children!!.removeAll { it.type in t.udta && it.type !in QT_OWN }
            if (t.ilst != null) {
                val ilst = ensureIlst(udta)
                ilst.children!!.removeAll { it.type == t.ilst || (t.key == "genre" && it.type == "gnre") }
                if (v.isNotEmpty()) ilst.children!!.add(textItem(t.ilst, v))
            } else {
                udta.children!!.removeAll { it.type == t.udta.first() }
                if (v.isNotEmpty()) udta.children!!.add(qtTextAtom(t.udta.first(), v))
            }
            if (mdtaMeta != null) setMdta(mdtaMeta, t.mdta, v)
        }

        if (values.containsKey("latitude") || values.containsKey("longitude")) {
            val lat = values["latitude"]?.trim().orEmpty()
            val lon = values["longitude"]?.trim().orEmpty()
            udta.children!!.removeAll { it.type == XYZ || it.type == "loci" }
            val iso = if (lat.isEmpty() && lon.isEmpty()) "" else {
                val la = lat.replace(',', '.').toDoubleOrNull()
                val lo = lon.replace(',', '.').toDoubleOrNull()
                if (la == null || lo == null) throw MetadataException("Укажите и широту, и долготу (или очистите оба поля)")
                if (la !in -90.0..90.0 || lo !in -180.0..180.0) throw MetadataException("Координаты вне допустимого диапазона")
                String.format(Locale.US, "%+08.4f%+09.4f/", la, lo)
            }
            if (iso.isNotEmpty()) udta.children!!.add(qtTextAtom(XYZ, iso))
            if (mdtaMeta != null) setMdta(mdtaMeta, listOf(KEY_LOCATION), iso)
        }

        val created = values["creationTime"]?.let { DateUtil.parse(it, zone) }
        val modified = values["modificationTime"]?.let { DateUtil.parse(it, zone) }
        if (values.containsKey("creationTime")) setTimes(moov, toMacTime(created), setCreation = true, setModification = false)
        if (values.containsKey("modificationTime")) setTimes(moov, toMacTime(modified), setCreation = false, setModification = true)
    }

    private fun ensureIlst(udta: Atom): Atom {
        var meta = udta.child("meta")
        if (meta == null || !meta.isContainer) {
            udta.children!!.remove(meta)
            meta = Atom("meta").apply {
                prefix = ByteArray(4)
                children = mutableListOf(Atom("hdlr").apply {
                    payload = ByteArray(8) + Atom.typeBytes("mdir") + Atom.typeBytes("appl") + ByteArray(9)
                })
            }
            udta.children!!.add(meta)
        }
        val ilst = meta.child("ilst")
        if (ilst != null && ilst.isContainer) return ilst
        meta.children!!.remove(ilst)
        return Atom("ilst").apply { children = mutableListOf() }.also { meta.children!!.add(it) }
    }

    private fun textItem(type: String, value: String): Atom = Atom(type).apply {
        children = mutableListOf(dataAtom(value))
    }

    private fun dataAtom(value: String): Atom = Atom("data").apply {
        payload = byteArrayOf(0, 0, 0, 1, 0, 0, 0, 0) + value.toByteArray(Charsets.UTF_8)
    }

    private fun qtTextAtom(type: String, value: String): Atom = Atom(type).apply {
        val bytes = value.toByteArray(Charsets.UTF_8)
        payload = ByteBuffer.allocate(4 + bytes.size).putShort(bytes.size.toShort()).putShort(0x15C7).put(bytes).array()
    }

    /** Sets (or removes, for an empty value) Apple `mdta` keys in `moov/meta`. */
    private fun setMdta(meta: Atom, keys: List<String>, value: String) {
        if (keys.isEmpty() || !meta.isContainer) return
        val keysAtom = meta.child("keys") ?: return
        val ilst = meta.child("ilst")?.takeIf { it.isContainer } ?: return
        val names = parseKeys(keysAtom.payload).toMutableList()
        val primary = keys.first()
        for (k in keys) {
            val idx = names.indexOf(k)
            if (idx < 0) continue
            ilst.children!!.removeAll { Atom.intOfType(it.type) == idx + 1 }
        }
        if (value.isEmpty()) return
        var idx = names.indexOf(primary)
        if (idx < 0) {
            names += primary
            idx = names.size - 1
            keysAtom.payload = buildKeys(keysAtom.payload, names)
        }
        ilst.children!!.add(Atom(Atom.typeOfInt(idx + 1)).apply { children = mutableListOf(dataAtom(value)) })
    }

    private fun setTimes(moov: Atom, macTime: Long, setCreation: Boolean, setModification: Boolean) {
        fun patch(a: Atom?) {
            val p = a?.payload ?: return
            if (p.isEmpty()) return
            val b = ByteBuffer.wrap(p)
            if (p[0].toInt() == 1 && p.size >= 20) {
                if (setCreation) b.putLong(4, macTime)
                if (setModification) b.putLong(12, macTime)
            } else if (p.size >= 12) {
                val v = macTime.coerceIn(0, 0xFFFFFFFFL).toInt()
                if (setCreation) b.putInt(4, v)
                if (setModification) b.putInt(8, v)
            }
        }
        patch(moov.child("mvhd"))
        for (trak in moov.childrenOf("trak")) {
            patch(trak.child("tkhd"))
            patch(trak.path("mdia", "mdhd"))
        }
    }

    // ---------------------------------------------------------------- reading helpers

    private fun itemText(item: Atom): String? {
        val data = item.child("data")?.payload ?: return null
        if (data.size < 8) return null
        return when (ByteBuffer.wrap(data).int and 0xFFFFFF) {
            1 -> String(data, 8, data.size - 8, Charsets.UTF_8)
            2 -> String(data, 8, data.size - 8, Charsets.UTF_16BE)
            else -> null
        }
    }

    /** Classic QuickTime international text: 16-bit length, 16-bit language, text. */
    private fun qtText(p: ByteArray): String? {
        if (p.size < 4) return null
        val len = ByteBuffer.wrap(p).short.toInt() and 0xFFFF
        if (len == 0 || 4 + len > p.size) {
            // Some writers store a full data atom instead.
            return if (p.size > 16 && Atom.typeOf(p, 4) == "data") String(p, 16, p.size - 16, Charsets.UTF_8) else null
        }
        return String(p, 4, len, Charsets.UTF_8).trimEnd('\u0000')
    }

    private fun handlerType(meta: Atom): String? {
        val h = meta.child("hdlr")?.payload ?: return null
        return if (h.size >= 12) Atom.typeOf(h, 8) else null
    }

    private fun parseKeys(p: ByteArray): List<String> {
        val b = ByteBuffer.wrap(p)
        if (p.size < 8) return emptyList()
        val count = b.getInt(4)
        val list = ArrayList<String>()
        var pos = 8
        repeat(count) {
            if (pos + 8 > p.size) return list
            val size = b.getInt(pos)
            if (size < 8 || pos + size > p.size) return list
            list += String(p, pos + 8, size - 8, Charsets.UTF_8)
            pos += size
        }
        return list
    }

    private fun buildKeys(old: ByteArray, names: List<String>): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        out.write(old, 0, 4)
        out.write(ByteBuffer.allocate(4).putInt(names.size).array())
        for (n in names) {
            val bytes = n.toByteArray(Charsets.UTF_8)
            out.write(ByteBuffer.allocate(8).putInt(8 + bytes.size).put(Atom.typeBytes("mdta")).array())
            out.write(bytes)
        }
        return out.toByteArray()
    }

    private fun readMdta(moov: Atom): Map<String, String> {
        val meta = moov.child("meta")?.takeIf { it.isContainer && handlerType(it) == "mdta" } ?: return emptyMap()
        val names = meta.child("keys")?.let { parseKeys(it.payload) } ?: return emptyMap()
        val result = HashMap<String, String>()
        for (item in meta.child("ilst")?.children.orEmpty()) {
            val idx = Atom.intOfType(item.type) - 1
            val name = names.getOrNull(idx) ?: continue
            if (item.isContainer) itemText(item)?.let { result[name] = it }
        }
        return result
    }

    private fun readTimes(p: ByteArray): Pair<Instant?, Instant?>? {
        val b = ByteBuffer.wrap(p)
        val (c, m) = when {
            p.size >= 20 && p[0].toInt() == 1 -> b.getLong(4) to b.getLong(12)
            p.size >= 12 -> (b.getInt(4).toLong() and 0xFFFFFFFFL) to (b.getInt(8).toLong() and 0xFFFFFFFFL)
            else -> return null
        }
        return fromMacTime(c) to fromMacTime(m)
    }

    private fun readDuration(p: ByteArray): Double? {
        val b = ByteBuffer.wrap(p)
        return when {
            p.size >= 32 && p[0].toInt() == 1 -> {
                val ts = b.getInt(20).toLong() and 0xFFFFFFFFL
                if (ts == 0L) null else b.getLong(24).toDouble() / ts
            }
            p.size >= 20 -> {
                val ts = b.getInt(12).toLong() and 0xFFFFFFFFL
                if (ts == 0L) null else (b.getInt(16).toLong() and 0xFFFFFFFFL).toDouble() / ts
            }
            else -> null
        }
    }

    private fun videoSize(moov: Atom): String? {
        for (trak in moov.childrenOf("trak")) {
            val hdlr = trak.path("mdia", "hdlr")?.payload ?: continue
            if (hdlr.size < 12 || Atom.typeOf(hdlr, 8) != "vide") continue
            val tkhd = trak.child("tkhd")?.payload ?: continue
            if (tkhd.size < 8) continue
            val b = ByteBuffer.wrap(tkhd)
            val w = b.getInt(tkhd.size - 8) ushr 16
            val h = b.getInt(tkhd.size - 4) ushr 16
            if (w > 0 && h > 0) return "$w × $h"
        }
        return null
    }

    private fun formatDuration(sec: Double): String {
        val s = sec.toLong()
        return if (s >= 3600) String.format(Locale.US, "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60)
        else String.format(Locale.US, "%d:%02d", s / 60, s % 60)
    }

    // ---------------------------------------------------------------- file level

    private fun scan(file: File): List<TopBox> {
        val boxes = ArrayList<TopBox>()
        RandomAccessFile(file, "r").use { raf ->
            val len = raf.length()
            var pos = 0L
            val h = ByteArray(16)
            while (pos + 8 <= len) {
                raf.seek(pos)
                raf.readFully(h, 0, 8)
                var size = ByteBuffer.wrap(h).int.toLong() and 0xFFFFFFFFL
                val type = Atom.typeOf(h, 4)
                if (size == 1L) {
                    raf.readFully(h, 8, 8)
                    size = ByteBuffer.wrap(h).getLong(8)
                } else if (size == 0L) {
                    size = len - pos
                }
                if (size < 8 || pos + size > len) {
                    if (boxes.isEmpty()) throw MetadataException("Это не видео MP4/MOV или файл повреждён")
                    break
                }
                boxes += TopBox(type, pos, size)
                pos += size
            }
        }
        if (boxes.isEmpty()) throw MetadataException("Это не видео MP4/MOV или файл повреждён")
        return boxes
    }

    private fun load(file: File): Pair<List<TopBox>, Atom> {
        val boxes = scan(file)
        val m = boxes.firstOrNull { it.type == "moov" }
            ?: throw MetadataException("В файле нет блока moov — видео не дописано или повреждено")
        if (m.size > 512L * 1024 * 1024) throw MetadataException("Слишком большой заголовок видео")
        val bytes = ByteArray(m.size.toInt())
        RandomAccessFile(file, "r").use { it.seek(m.offset); it.readFully(bytes) }
        val header = if ((ByteBuffer.wrap(bytes).int.toLong() and 0xFFFFFFFFL) == 1L) 16 else 8
        val moov = Atom.parse(bytes, 0, bytes.size, header, "moov", null)
        if (!moov.isContainer) throw MetadataException("Не удалось разобрать заголовок видео (moov)")
        return boxes to moov
    }

    private fun save(source: File, target: File, boxes: List<TopBox>, moov: Atom) {
        val old = boxes.first { it.type == "moov" }
        val oldEnd = old.offset + old.size
        val mediaAfter = boxes.any { it.offset >= oldEnd && (it.type == "mdat" || it.type == "moof") }

        var newMoov = moov.toBytes()
        var skipUntil = oldEnd
        var padding = 0L

        if (mediaAfter) {
            val next = boxes.firstOrNull { it.offset == oldEnd }
            val freeAfter = if (next != null && (next.type == "free" || next.type == "skip")) next.size else 0L
            val diff = old.size + freeAfter - newMoov.size
            when {
                diff == 0L -> skipUntil = oldEnd + freeAfter
                diff >= 8 -> {
                    skipUntil = oldEnd + freeAfter; padding = diff
                }
                else -> {
                    // moov grew: shift the media and fix the chunk offsets.
                    if (boxes.any { it.type == "moof" }) {
                        throw MetadataException("Фрагментированное видео: новые теги не помещаются, сократите текст")
                    }
                    val delta = newMoov.size - old.size
                    shiftChunkOffsets(moov, oldEnd, delta)
                    newMoov = moov.toBytes()
                }
            }
        }

        RandomAccessFile(source, "r").use { src ->
            target.outputStream().use { fos ->
                val out = fos.channel
                src.channel.transferFullyTo(0, old.offset, out)
                out.write(ByteBuffer.wrap(newMoov))
                if (padding > 0) {
                    val free = ByteBuffer.allocate(padding.toInt())
                    free.putInt(padding.toInt()).put(Atom.typeBytes("free"))
                    free.rewind()
                    out.write(free)
                }
                src.channel.transferFullyTo(skipUntil, src.length() - skipUntil, out)
            }
        }
    }

    private fun java.nio.channels.FileChannel.transferFullyTo(pos: Long, count: Long, out: java.nio.channels.WritableByteChannel) {
        var done = 0L
        while (done < count) {
            val n = transferTo(pos + done, count - done, out)
            if (n <= 0) throw MetadataException("Ошибка записи файла")
            done += n
        }
    }

    private fun shiftChunkOffsets(moov: Atom, after: Long, delta: Long) {
        for (trak in moov.childrenOf("trak")) {
            val stbl = trak.path("mdia", "minf", "stbl") ?: continue
            stbl.child("stco")?.let { a ->
                val b = ByteBuffer.wrap(a.payload)
                val n = b.getInt(4)
                for (i in 0 until n) {
                    val pos = 8 + i * 4
                    val v = b.getInt(pos).toLong() and 0xFFFFFFFFL
                    if (v >= after) {
                        val nv = v + delta
                        if (nv > 0xFFFFFFFFL) throw MetadataException("Видео слишком большое для изменения тегов")
                        b.putInt(pos, nv.toInt())
                    }
                }
            }
            stbl.child("co64")?.let { a ->
                val b = ByteBuffer.wrap(a.payload)
                val n = b.getInt(4)
                for (i in 0 until n) {
                    val pos = 8 + i * 8
                    val v = b.getLong(pos)
                    if (v >= after) b.putLong(pos, v + delta)
                }
            }
        }
    }

    companion object {
        val EXTENSIONS = setOf("mp4", "m4v", "mov", "qt", "3gp", "3g2", "m4a")

        private const val XYZ = "©xyz"
        private const val KEY_LOCATION = "com.apple.quicktime.location.ISO6709"

        /** QuickTime atoms that we write ourselves (make/model). */
        private val QT_OWN = setOf("©mak", "©mod")

        private val TAGS = listOf(
            TagDef("title", "Название", FieldType.TEXT, Groups.DESCRIPTION, "©nam", listOf("com.apple.quicktime.title"), listOf("©nam")),
            TagDef("description", "Описание", FieldType.MULTILINE, Groups.DESCRIPTION, "desc", listOf("com.apple.quicktime.description"), listOf("©des", "©inf")),
            TagDef("comment", "Комментарий", FieldType.MULTILINE, Groups.DESCRIPTION, "©cmt", listOf("com.apple.quicktime.comment"), listOf("©cmt")),
            TagDef("genre", "Жанр", FieldType.TEXT, Groups.DESCRIPTION, "©gen", listOf("com.apple.quicktime.genre"), listOf("©gen")),
            TagDef("album", "Альбом", FieldType.TEXT, Groups.DESCRIPTION, "©alb", listOf("com.apple.quicktime.album"), listOf("©alb")),
            TagDef("artist", "Автор", FieldType.TEXT, Groups.AUTHORSHIP, "©ART", listOf("com.apple.quicktime.author", "com.apple.quicktime.artist"), listOf("©ART", "©aut")),
            TagDef("copyright", "Авторские права", FieldType.TEXT, Groups.AUTHORSHIP, "cprt", listOf("com.apple.quicktime.copyright"), listOf("©cpy")),
            TagDef("date", "Дата записи (текст тега)", FieldType.TEXT, Groups.DATES, "©day", listOf("com.apple.quicktime.creationdate"), listOf("©day")),
            TagDef("make", "Производитель устройства", FieldType.TEXT, Groups.DEVICE, null, listOf("com.apple.quicktime.make"), listOf("©mak")),
            TagDef("model", "Модель устройства", FieldType.TEXT, Groups.DEVICE, null, listOf("com.apple.quicktime.model"), listOf("©mod")),
            TagDef("encoder", "Программа", FieldType.TEXT, Groups.DEVICE, "©too", listOf("com.apple.quicktime.software"), listOf("©swr", "©too")),
        )

        /** Seconds between 1904-01-01 and 1970-01-01. */
        private const val MAC_EPOCH = 2082844800L

        private fun fromMacTime(t: Long): Instant? = if (t <= 0) null else Instant.ofEpochSecond(t - MAC_EPOCH)

        private fun toMacTime(i: Instant?): Long = if (i == null) 0 else i.epochSecond + MAC_EPOCH

        private fun fmtCoord(d: Double) = String.format(Locale.US, "%.6f", d).trimEnd('0').trimEnd('.')

        /** Parses ISO 6709 strings such as `+55.7558+037.6173/` or `+5545.35+03737.04/`. */
        fun parseIso6709(s: String): Pair<Double, Double>? {
            val m = Regex("""([+-])(\d+)(\.\d+)?([+-])(\d+)(\.\d+)?""").find(s) ?: return null
            fun conv(sign: String, int: String, frac: String?, degDigits: Int): Double? {
                val f = frac?.toDoubleOrNull() ?: 0.0
                val v = when (int.length) {
                    degDigits -> int.toDouble() + f
                    degDigits + 2 -> int.dropLast(2).toDouble() + (int.takeLast(2).toDouble() + f) / 60
                    degDigits + 4 -> int.dropLast(4).toDouble() + int.dropLast(2).takeLast(2).toDouble() / 60 +
                        (int.takeLast(2).toDouble() + f) / 3600
                    else -> int.toDoubleOrNull()?.plus(f)
                } ?: return null
                return if (sign == "-") -v else v
            }
            val g = m.groupValues
            val lat = conv(g[1], g[2], g[3].ifEmpty { null }, 2) ?: return null
            val lon = conv(g[4], g[5], g[6].ifEmpty { null }, 3) ?: return null
            return lat to lon
        }
    }
}
