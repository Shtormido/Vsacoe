package com.vsacoe.metadata.core.cfb

import com.vsacoe.metadata.core.MetadataException
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.Charset
import java.time.Instant

/**
 * OLE property set stream (MS-OLEPS), as stored in "\u0005SummaryInformation" and
 * "\u0005DocumentSummaryInformation". Properties we do not touch are kept byte for byte.
 */
class PropertySet private constructor(
    private val header: ByteArray,
    val sections: MutableList<Section>,
) {
    class Section(val fmtid: ByteArray, val props: MutableList<Prop>) {
        fun get(id: Int): Prop? = props.firstOrNull { it.id == id }

        fun remove(id: Int) {
            props.removeAll { it.id == id }
        }

        fun put(id: Int, raw: ByteArray) {
            val idx = props.indexOfFirst { it.id == id }
            if (idx >= 0) props[idx] = Prop(id, raw) else props += Prop(id, raw)
        }

        val codepage: Int
            get() = get(PID_CODEPAGE)?.takeIf { it.vt == VT_I2 }
                ?.let { ByteBuffer.wrap(it.raw, 4, 2).order(ByteOrder.LITTLE_ENDIAN).short.toInt() and 0xFFFF }
                ?: 1252

        fun getString(id: Int): String? {
            val p = get(id) ?: return null
            return when (p.vt) {
                VT_LPSTR -> decodeLpstr(p.raw, codepage)
                VT_LPWSTR -> decodeLpwstr(p.raw)
                else -> null
            }
        }

        fun getFileTime(id: Int): Instant? {
            val p = get(id)?.takeIf { it.vt == VT_FILETIME && it.raw.size >= 12 } ?: return null
            val ft = ByteBuffer.wrap(p.raw, 4, 8).order(ByteOrder.LITTLE_ENDIAN).long
            return fileTimeToInstant(ft)
        }

        fun getInt(id: Int): Long? {
            val p = get(id) ?: return null
            val b = ByteBuffer.wrap(p.raw).order(ByteOrder.LITTLE_ENDIAN)
            return when (p.vt) {
                VT_I4 -> if (p.raw.size >= 8) b.getInt(4).toLong() else null
                VT_I2 -> if (p.raw.size >= 6) b.getShort(4).toLong() else null
                else -> null
            }
        }

        /** Sets a text property, switching the section to UTF-16 if the code page cannot hold the text. */
        fun setString(id: Int, value: String) {
            if (value.isEmpty()) {
                remove(id); return
            }
            val cs = charsetFor(codepage)
            if (codepage != CP_UNICODE && !cs.newEncoder().canEncode(value)) convertToUnicode()
            put(id, encodeLpstr(value, codepage))
        }

        fun setFileTime(id: Int, value: Instant?) {
            if (value == null) {
                remove(id); return
            }
            val b = ByteBuffer.allocate(12).order(ByteOrder.LITTLE_ENDIAN)
            b.putInt(VT_FILETIME).putLong(instantToFileTime(value))
            put(id, b.array())
        }

        fun setInt(id: Int, value: Long?) {
            if (value == null) {
                remove(id); return
            }
            val b = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN)
            b.putInt(VT_I4).putInt(value.toInt())
            put(id, b.array())
        }

        /** Re-encodes every narrow string as UTF-16 and sets code page 1200. */
        private fun convertToUnicode() {
            val old = codepage
            for (i in props.indices) {
                val p = props[i]
                if (p.vt == VT_LPSTR) {
                    props[i] = Prop(p.id, encodeLpstr(decodeLpstr(p.raw, old), CP_UNICODE))
                }
            }
            // Vector properties (heading pairs, part titles) hold narrow strings we do not
            // re-encode; Office regenerates them on the next save.
            props.removeAll { it.vt and VT_VECTOR != 0 && it.id != PID_CODEPAGE }
            val cp = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN)
            cp.putInt(VT_I2).putShort(CP_UNICODE.toShort()).putShort(0)
            put(PID_CODEPAGE, cp.array())
        }
    }

    class Prop(val id: Int, val raw: ByteArray) {
        val vt: Int get() = if (raw.size >= 2) (raw[0].toInt() and 0xFF) or ((raw[1].toInt() and 0xFF) shl 8) else 0
    }

    fun section(fmtid: ByteArray): Section? = sections.firstOrNull { it.fmtid.contentEquals(fmtid) }

    fun toBytes(): ByteArray {
        val out = ByteArrayOutputStream()
        val head = ByteBuffer.allocate(28 + 20 * sections.size).order(ByteOrder.LITTLE_ENDIAN)
        head.put(header, 0, 24)
        head.putInt(sections.size)
        val bodies = sections.map { serializeSection(it) }
        var offset = 28 + 20 * sections.size
        for ((i, s) in sections.withIndex()) {
            head.put(s.fmtid, 0, 16)
            head.putInt(offset)
            offset += bodies[i].size
        }
        out.write(head.array())
        for (b in bodies) out.write(b)
        return out.toByteArray()
    }

    private fun serializeSection(s: Section): ByteArray {
        val props = s.props.sortedBy { it.id.toLong() and 0xFFFFFFFFL }
        val tableSize = 8 + 8 * props.size
        val body = ByteArrayOutputStream()
        val offsets = IntArray(props.size)
        for ((i, p) in props.withIndex()) {
            offsets[i] = tableSize + body.size()
            body.write(p.raw)
            val pad = (4 - p.raw.size % 4) % 4
            body.write(ByteArray(pad))
        }
        val b = ByteBuffer.allocate(tableSize + body.size()).order(ByteOrder.LITTLE_ENDIAN)
        b.putInt(tableSize + body.size())
        b.putInt(props.size)
        for ((i, p) in props.withIndex()) b.putInt(p.id).putInt(offsets[i])
        b.put(body.toByteArray())
        return b.array()
    }

    companion object {
        const val VT_I2 = 0x02
        const val VT_I4 = 0x03
        const val VT_LPSTR = 0x1E
        const val VT_LPWSTR = 0x1F
        const val VT_FILETIME = 0x40
        const val VT_VECTOR = 0x1000
        const val PID_CODEPAGE = 1
        const val CP_UNICODE = 1200

        const val SUMMARY_STREAM = "\u0005SummaryInformation"
        const val DOC_SUMMARY_STREAM = "\u0005DocumentSummaryInformation"

        /** F29F85E0-4FF9-1068-AB91-08002B27B3D9 */
        val FMTID_SUMMARY = guid("F29F85E0-4FF9-1068-AB91-08002B27B3D9")

        /** D5CDD502-2E9C-101B-9397-08002B2CF9AE */
        val FMTID_DOC_SUMMARY = guid("D5CDD502-2E9C-101B-9397-08002B2CF9AE")

        private const val FILETIME_EPOCH_DIFF = 116444736000000000L

        fun fileTimeToInstant(ft: Long): Instant? {
            if (ft <= 0) return null
            val since1970 = ft - FILETIME_EPOCH_DIFF
            return Instant.ofEpochSecond(Math.floorDiv(since1970, 10_000_000L), Math.floorMod(since1970, 10_000_000L) * 100)
        }

        fun instantToFileTime(i: Instant): Long = i.epochSecond * 10_000_000L + i.nano / 100 + FILETIME_EPOCH_DIFF

        private fun guid(s: String): ByteArray {
            val hex = s.replace("-", "")
            val b = ByteArray(16) { hex.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
            // First three fields are little-endian on disk.
            return byteArrayOf(b[3], b[2], b[1], b[0], b[5], b[4], b[7], b[6]) + b.copyOfRange(8, 16)
        }

        fun charsetFor(cp: Int): Charset = when (cp) {
            CP_UNICODE -> Charsets.UTF_16LE
            65001 -> Charsets.UTF_8
            else -> listOf("windows-$cp", "Cp$cp", "x-windows-$cp", "x-IBM$cp")
                .firstNotNullOfOrNull { name -> runCatching { Charset.forName(name) }.getOrNull() }
                ?: Charset.forName("windows-1252")
        }

        private fun decodeLpstr(raw: ByteArray, cp: Int): String {
            if (raw.size < 8) return ""
            val len = ByteBuffer.wrap(raw, 4, 4).order(ByteOrder.LITTLE_ENDIAN).int.coerceIn(0, raw.size - 8)
            var s = String(raw, 8, len, charsetFor(cp))
            val nul = s.indexOf('\u0000')
            if (nul >= 0) s = s.substring(0, nul)
            return s
        }

        private fun decodeLpwstr(raw: ByteArray): String {
            if (raw.size < 8) return ""
            val chars = ByteBuffer.wrap(raw, 4, 4).order(ByteOrder.LITTLE_ENDIAN).int.coerceIn(0, (raw.size - 8) / 2)
            var s = String(raw, 8, chars * 2, Charsets.UTF_16LE)
            val nul = s.indexOf('\u0000')
            if (nul >= 0) s = s.substring(0, nul)
            return s
        }

        private fun encodeLpstr(value: String, cp: Int): ByteArray {
            val bytes = value.toByteArray(charsetFor(cp))
            val nul = if (cp == CP_UNICODE) 2 else 1
            val len = bytes.size + nul
            val b = ByteBuffer.allocate(8 + len).order(ByteOrder.LITTLE_ENDIAN)
            b.putInt(VT_LPSTR).putInt(len).put(bytes)
            return b.array()
        }

        /** A new, empty property set with one section of the given format id. */
        fun create(fmtid: ByteArray): PropertySet {
            val h = ByteBuffer.allocate(24).order(ByteOrder.LITTLE_ENDIAN)
            h.putShort(0xFFFE.toShort()).putShort(0).putInt(0x00020006)
            val cp = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN)
            cp.putInt(VT_I2).putShort(CP_UNICODE.toShort()).putShort(0)
            val section = Section(fmtid, mutableListOf(Prop(PID_CODEPAGE, cp.array())))
            return PropertySet(h.array(), mutableListOf(section))
        }

        fun parse(bytes: ByteArray): PropertySet {
            try {
                val b = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
                if (bytes.size < 28 || (b.getShort(0).toInt() and 0xFFFF) != 0xFFFE) {
                    throw MetadataException("Повреждён блок свойств документа")
                }
                val count = b.getInt(24)
                if (count < 0 || count > 16) throw MetadataException("Повреждён блок свойств документа")
                val sections = ArrayList<Section>()
                for (i in 0 until count) {
                    val fmtid = bytes.copyOfRange(28 + i * 20, 28 + i * 20 + 16)
                    val off = b.getInt(28 + i * 20 + 16)
                    val size = b.getInt(off).coerceAtMost(bytes.size - off)
                    val n = b.getInt(off + 4)
                    val ids = IntArray(n) { b.getInt(off + 8 + it * 8) }
                    val offs = IntArray(n) { b.getInt(off + 12 + it * 8) }
                    val sortedOffs = offs.filter { it in 0 until size }.distinct().sorted()
                    val props = ArrayList<Prop>()
                    for (k in 0 until n) {
                        val start = offs[k]
                        if (start !in 0 until size) continue
                        val end = sortedOffs.firstOrNull { it > start } ?: size
                        props += Prop(ids[k], bytes.copyOfRange(off + start, off + end))
                    }
                    sections += Section(fmtid, props)
                }
                return PropertySet(bytes.copyOf(24), sections)
            } catch (e: MetadataException) {
                throw e
            } catch (e: Exception) {
                throw MetadataException("Повреждён блок свойств документа", e)
            }
        }
    }
}
