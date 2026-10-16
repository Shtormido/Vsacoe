package com.vsacoe.metadata.core.mp4

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

/**
 * An ISO-BMFF / QuickTime box held in memory. Containers keep their children,
 * everything else keeps its raw payload.
 */
class Atom(val type: String) {
    var payload: ByteArray = ByteArray(0)
    var children: MutableList<Atom>? = null

    /** Bytes between the header and the first child (e.g. version/flags of a full-box `meta`). */
    var prefix: ByteArray = ByteArray(0)

    /** Unparsed bytes after the last child (e.g. the QuickTime 32-bit zero terminator). */
    var trailing: ByteArray = ByteArray(0)

    val isContainer: Boolean get() = children != null

    fun child(t: String): Atom? = children?.firstOrNull { it.type == t }

    fun childrenOf(t: String): List<Atom> = children?.filter { it.type == t }.orEmpty()

    fun path(vararg types: String): Atom? {
        var cur: Atom? = this
        for (t in types) cur = cur?.child(t)
        return cur
    }

    fun getOrCreate(t: String, init: Atom.() -> Unit = {}): Atom {
        child(t)?.let { return it }
        val a = Atom(t).apply(init)
        children!!.add(a)
        return a
    }

    fun bodySize(): Long =
        if (isContainer) prefix.size + children!!.sumOf { it.totalSize() } + trailing.size else payload.size.toLong()

    fun totalSize(): Long {
        val body = bodySize()
        return if (body + 8 > 0xFFFFFFFFL) body + 16 else body + 8
    }

    fun writeTo(out: ByteArrayOutputStream) {
        val total = totalSize()
        val h = ByteBuffer.allocate(if (total > 0xFFFFFFFFL) 16 else 8)
        if (total > 0xFFFFFFFFL) {
            h.putInt(1).put(typeBytes(type)).putLong(total)
        } else {
            h.putInt(total.toInt()).put(typeBytes(type))
        }
        out.write(h.array())
        if (isContainer) {
            out.write(prefix)
            for (c in children!!) c.writeTo(out)
            out.write(trailing)
        } else {
            out.write(payload)
        }
    }

    fun toBytes(): ByteArray = ByteArrayOutputStream().also { writeTo(it) }.toByteArray()

    companion object {
        private val CONTAINERS = setOf("moov", "trak", "mdia", "minf", "stbl", "udta", "edts", "dinf", "mvex", "ilst", "meta", "tref")

        fun typeBytes(t: String): ByteArray = ByteArray(4) { t[it].code.toByte() }

        fun typeOf(b: ByteArray, off: Int): String = String(CharArray(4) { (b[off + it].toInt() and 0xFF).toChar() })

        fun typeOfInt(v: Int): String = String(CharArray(4) { ((v ushr (24 - it * 8)) and 0xFF).toChar() })

        fun intOfType(t: String): Int = ByteBuffer.wrap(typeBytes(t)).int

        /** Parses one box at [off] whose total size is [size] (header included). */
        fun parse(buf: ByteArray, off: Int, size: Int, headerLen: Int, type: String, parentType: String?): Atom {
            val a = Atom(type)
            val bodyStart = off + headerLen
            val bodyEnd = off + size
            val container = type in CONTAINERS || parentType == "ilst"
            if (container) {
                var childStart = bodyStart
                if (type == "meta") {
                    // ISO full box (version+flags) unless the QuickTime form where `hdlr` follows directly.
                    val qt = bodyEnd - bodyStart >= 8 && typeOf(buf, bodyStart + 4) == "hdlr"
                    if (!qt && bodyEnd - bodyStart >= 4) {
                        a.prefix = buf.copyOfRange(bodyStart, bodyStart + 4)
                        childStart += 4
                    }
                }
                val kids = parseChildren(buf, childStart, bodyEnd, type)
                if (kids != null) {
                    a.children = kids.first
                    a.trailing = buf.copyOfRange(kids.second, bodyEnd)
                    return a
                }
                a.prefix = ByteArray(0)
            }
            a.payload = buf.copyOfRange(bodyStart, bodyEnd)
            return a
        }

        /** Returns the children and the offset where parsing stopped, or null if the data is not a box list. */
        fun parseChildren(buf: ByteArray, start: Int, end: Int, parentType: String?): Pair<MutableList<Atom>, Int>? {
            val list = ArrayList<Atom>()
            var p = start
            while (end - p >= 8) {
                val bb = ByteBuffer.wrap(buf)
                var size = bb.getInt(p).toLong() and 0xFFFFFFFFL
                val type = typeOf(buf, p + 4)
                var header = 8
                if (size == 1L) {
                    if (end - p < 16) return null
                    size = bb.getLong(p + 8)
                    header = 16
                } else if (size == 0L) {
                    if (parentType == "udta" && type == "\u0000\u0000\u0000\u0000") break
                    size = (end - p).toLong()
                }
                if (size < header || p + size > end) {
                    // QuickTime udta may end with a terminator or padding.
                    return if (parentType == "udta" && list.isNotEmpty()) list to p else null
                }
                list += parse(buf, p, size.toInt(), header, type, parentType)
                p += size.toInt()
            }
            return list to p
        }
    }
}
