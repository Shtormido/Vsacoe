package com.vsacoe.metadata.core.cfb

import com.vsacoe.metadata.core.MetadataException
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Minimal reader/writer for the Compound File Binary format (MS-CFB) used by
 * Office 97-2003 files (.doc, .xls, .ppt ...).
 *
 * The whole container is loaded into memory. Writing produces a fresh version 3
 * file (512-byte sectors) that keeps every directory entry, its position in the
 * directory tree, CLSIDs, timestamps and stream contents; only the sector layout
 * is rebuilt. Office files never refer to sector numbers, so this is safe.
 */
class CompoundFile private constructor(val entries: MutableList<Entry>) {

    class Entry(
        var name: String,
        var type: Int,
        var color: Int,
        var left: Int,
        var right: Int,
        var child: Int,
        val clsid: ByteArray,
        val stateBits: Int,
        val created: Long,
        val modified: Long,
    ) {
        var data: ByteArray = ByteArray(0)
        internal var start: Int = ENDOFCHAIN
        internal var size: Long = 0
    }

    val root: Entry get() = entries[0]

    /** Finds a stream directly inside the root storage. */
    fun findRootStream(name: String): Entry? {
        for (idx in children(0)) {
            val e = entries[idx]
            if (e.type == TYPE_STREAM && e.name == name) return e
        }
        return null
    }

    /** Adds (or returns the existing) stream directly inside the root storage. */
    fun getOrCreateRootStream(name: String): Entry {
        findRootStream(name)?.let { return it }
        val e = Entry(name, TYPE_STREAM, BLACK, NOSTREAM, NOSTREAM, NOSTREAM, ByteArray(16), 0, 0, 0)
        val freeIdx = entries.indexOfFirst { it.type == TYPE_EMPTY }
        val idx = if (freeIdx > 0) {
            entries[freeIdx] = e; freeIdx
        } else {
            entries += e; entries.size - 1
        }
        rebuildTree(0, children(0) + idx)
        return e
    }

    /** Indices of the direct children of storage [storageIdx] (in-order walk of its tree). */
    fun children(storageIdx: Int): List<Int> {
        val result = ArrayList<Int>()
        val stack = ArrayDeque<Int>()
        val seen = HashSet<Int>()
        var cur = entries[storageIdx].child
        while ((cur != NOSTREAM && cur in entries.indices) || stack.isNotEmpty()) {
            while (cur != NOSTREAM && cur in entries.indices && seen.add(cur)) {
                stack.addLast(cur)
                cur = entries[cur].left
            }
            if (stack.isEmpty()) break
            val n = stack.removeLast()
            result += n
            cur = entries[n].right
        }
        return result
    }

    /** Re-balances the children of a storage as a valid red-black tree. */
    private fun rebuildTree(storageIdx: Int, childIdx: List<Int>) {
        val sorted = childIdx.sortedWith { a, b -> compareNames(entries[a].name, entries[b].name) }
        fun build(lo: Int, hi: Int): Int {
            if (lo > hi) return NOSTREAM
            val mid = (lo + hi) ushr 1
            val e = entries[sorted[mid]]
            e.left = build(lo, mid - 1)
            e.right = build(mid + 1, hi)
            e.color = BLACK
            return sorted[mid]
        }
        entries[storageIdx].child = build(0, sorted.size - 1)
        // Midpoint construction puts every leaf on the last two levels. Colouring the
        // deepest level red gives each path the same number of black nodes.
        val depth = depthOf(entries[storageIdx].child)
        if (depth > 1) markRed(entries[storageIdx].child, 1, depth)
    }

    private fun depthOf(idx: Int): Int =
        if (idx == NOSTREAM) 0 else 1 + maxOf(depthOf(entries[idx].left), depthOf(entries[idx].right))

    private fun markRed(idx: Int, level: Int, depth: Int) {
        if (idx == NOSTREAM) return
        if (level == depth) entries[idx].color = RED
        markRed(entries[idx].left, level + 1, depth)
        markRed(entries[idx].right, level + 1, depth)
    }

    fun toBytes(): ByteArray {
        val ss = 512
        val miniSize = 64
        val mini = java.io.ByteArrayOutputStream()
        val miniFat = ArrayList<Int>()
        val big = ArrayList<Entry>()

        for (e in entries) {
            if (e.type != TYPE_STREAM) continue
            val d = e.data
            e.size = d.size.toLong()
            when {
                d.isEmpty() -> e.start = ENDOFCHAIN
                d.size < MINI_CUTOFF -> {
                    val first = miniFat.size
                    val n = (d.size + miniSize - 1) / miniSize
                    for (k in 0 until n) miniFat += if (k == n - 1) ENDOFCHAIN else first + k + 1
                    mini.write(d)
                    mini.write(ByteArray(n * miniSize - d.size))
                    e.start = first
                }
                else -> big += e
            }
        }

        val chains = ArrayList<Pair<Int, Int>>() // start sector, sector count
        var next = 0
        fun alloc(n: Int): Int {
            if (n == 0) return ENDOFCHAIN
            val s = next
            next += n
            chains += s to n
            return s
        }

        val miniBytes = mini.toByteArray()
        val rootEntry = root
        rootEntry.start = alloc(sectors(miniBytes.size, ss))
        rootEntry.size = miniBytes.size.toLong()
        for (e in big) e.start = alloc(sectors(e.data.size, ss))

        val dirCount = (entries.size + 3) / 4 * 4
        val dirStart = alloc(dirCount * 128 / ss)
        val miniFatStart = alloc(sectors(miniFat.size * 4, ss))

        var fatCount = 0
        var difatCount = 0
        while (true) {
            val total = next + fatCount + difatCount
            val needFat = (total + 127) / 128
            val needDifat = if (needFat > 109) (needFat - 109 + 126) / 127 else 0
            if (needFat == fatCount && needDifat == difatCount) break
            fatCount = needFat
            difatCount = needDifat
        }
        val fatStart = next
        next += fatCount
        val difatStart = if (difatCount > 0) next else ENDOFCHAIN
        next += difatCount

        val fat = IntArray(fatCount * 128) { FREESECT }
        for ((s, n) in chains) {
            for (k in 0 until n) fat[s + k] = if (k == n - 1) ENDOFCHAIN else s + k + 1
        }
        for (k in 0 until fatCount) fat[fatStart + k] = FATSECT
        for (k in 0 until difatCount) fat[difatStart + k] = DIFSECT

        val out = ByteBuffer.allocate((1 + next) * ss).order(ByteOrder.LITTLE_ENDIAN)
        // Header
        out.put(SIGNATURE)
        out.position(24)
        out.putShort(0x3E).putShort(3).putShort(0xFFFE.toShort()).putShort(9).putShort(6)
        out.position(40)
        out.putInt(0).putInt(fatCount).putInt(dirStart).putInt(0).putInt(MINI_CUTOFF)
        out.putInt(if (miniFat.isEmpty()) ENDOFCHAIN else miniFatStart).putInt(sectors(miniFat.size * 4, ss))
        out.putInt(difatStart).putInt(difatCount)
        for (k in 0 until 109) out.putInt(if (k < fatCount) fatStart + k else FREESECT)

        fun sectorPos(s: Int) = (s + 1) * ss

        // Stream data
        if (miniBytes.isNotEmpty()) {
            out.position(sectorPos(rootEntry.start)); out.put(miniBytes)
        }
        for (e in big) {
            out.position(sectorPos(e.start)); out.put(e.data)
        }
        // Directory
        out.position(sectorPos(dirStart))
        for (i in 0 until dirCount) writeEntry(out, entries.getOrNull(i))
        // MiniFAT
        if (miniFat.isNotEmpty()) {
            out.position(sectorPos(miniFatStart))
            val total = sectors(miniFat.size * 4, ss) * 128
            for (k in 0 until total) out.putInt(miniFat.getOrElse(k) { FREESECT })
        }
        // FAT
        out.position(sectorPos(fatStart))
        for (v in fat) out.putInt(v)
        // DIFAT
        for (d in 0 until difatCount) {
            out.position(sectorPos(difatStart + d))
            for (k in 0 until 127) {
                val fatIdx = 109 + d * 127 + k
                out.putInt(if (fatIdx < fatCount) fatStart + fatIdx else FREESECT)
            }
            out.putInt(if (d == difatCount - 1) ENDOFCHAIN else difatStart + d + 1)
        }
        return out.array()
    }

    private fun writeEntry(out: ByteBuffer, e: Entry?) {
        val start = out.position()
        if (e == null || e.type == TYPE_EMPTY) {
            out.position(start + 64)
            out.putShort(0).put(0).put(0)
            out.putInt(NOSTREAM).putInt(NOSTREAM).putInt(NOSTREAM)
            out.position(start + 128)
            return
        }
        val name = e.name.take(31)
        for (c in name) out.putChar(c)
        out.position(start + 64)
        out.putShort(((name.length + 1) * 2).toShort())
        out.put(e.type.toByte()).put(e.color.toByte())
        out.putInt(e.left).putInt(e.right).putInt(e.child)
        out.put(e.clsid, 0, 16)
        out.putInt(e.stateBits)
        out.putLong(e.created).putLong(e.modified)
        when (e.type) {
            TYPE_STREAM, TYPE_ROOT -> {
                out.putInt(e.start)
                out.putInt(e.size.toInt()).putInt(0)
            }
            else -> out.putInt(0).putInt(0).putInt(0)
        }
        out.position(start + 128)
    }

    companion object {
        const val TYPE_EMPTY = 0
        const val TYPE_STORAGE = 1
        const val TYPE_STREAM = 2
        const val TYPE_ROOT = 5
        const val RED = 0
        const val BLACK = 1
        const val NOSTREAM = -1
        const val FREESECT = -1
        const val ENDOFCHAIN = -2
        const val FATSECT = -3
        const val DIFSECT = -4
        const val MINI_CUTOFF = 4096
        val SIGNATURE = byteArrayOf(
            0xD0.toByte(), 0xCF.toByte(), 0x11, 0xE0.toByte(), 0xA1.toByte(), 0xB1.toByte(), 0x1A, 0xE1.toByte(),
        )

        fun isCompoundFile(header: ByteArray): Boolean =
            header.size >= 8 && SIGNATURE.indices.all { header[it] == SIGNATURE[it] }

        private fun sectors(bytes: Int, ss: Int) = (bytes + ss - 1) / ss

        /** CFB sort order: shorter names first, then case-insensitive comparison. */
        fun compareNames(a: String, b: String): Int {
            if (a.length != b.length) return a.length - b.length
            return a.uppercase().compareTo(b.uppercase())
        }

        fun read(bytes: ByteArray): CompoundFile {
            if (!isCompoundFile(bytes) || bytes.size < 512) {
                throw MetadataException("Это не документ Office 97-2003 (неверная сигнатура файла)")
            }
            try {
                return parse(bytes)
            } catch (e: MetadataException) {
                throw e
            } catch (e: Exception) {
                throw MetadataException("Документ Office 97-2003 повреждён", e)
            }
        }

        private fun parse(bytes: ByteArray): CompoundFile {
            val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
            val major = buf.getShort(26).toInt()
            val ss = 1 shl buf.getShort(30).toInt()
            val miniSs = 1 shl buf.getShort(32).toInt()
            if (ss != 512 && ss != 4096) throw MetadataException("Неподдерживаемый размер сектора: $ss")
            val numFat = buf.getInt(44)
            val firstDir = buf.getInt(48)
            val cutoff = buf.getInt(56)
            val firstMiniFat = buf.getInt(60)
            var difatSector = buf.getInt(68)
            val sectorCount = (bytes.size - ss) / ss + 1

            fun sectorOffset(s: Int): Int {
                if (s < 0 || s >= sectorCount) throw MetadataException("Документ повреждён (ссылка на сектор $s)")
                return (s + 1) * ss
            }

            // FAT sector list from the header DIFAT and the DIFAT chain.
            val fatSectors = ArrayList<Int>()
            for (k in 0 until 109) {
                val s = buf.getInt(76 + k * 4)
                if (s >= 0) fatSectors += s
            }
            var guard = 0
            while (difatSector >= 0 && fatSectors.size < numFat && guard++ < sectorCount) {
                val off = sectorOffset(difatSector)
                val per = ss / 4 - 1
                for (k in 0 until per) {
                    val s = buf.getInt(off + k * 4)
                    if (s >= 0) fatSectors += s
                }
                difatSector = buf.getInt(off + per * 4)
            }
            val fat = IntArray(fatSectors.size * ss / 4)
            for ((i, s) in fatSectors.withIndex()) {
                val off = sectorOffset(s)
                for (k in 0 until ss / 4) fat[i * ss / 4 + k] = buf.getInt(off + k * 4)
            }

            fun chain(start: Int): List<Int> {
                val list = ArrayList<Int>()
                var s = start
                while (s >= 0) {
                    if (s >= fat.size || list.size > fat.size) throw MetadataException("Документ повреждён (цепочка FAT)")
                    list += s
                    s = fat[s]
                }
                return list
            }

            fun readChain(start: Int, size: Long): ByteArray {
                val out = java.io.ByteArrayOutputStream()
                for (s in chain(start)) {
                    val off = sectorOffset(s)
                    out.write(bytes, off, minOf(ss, bytes.size - off))
                }
                val all = out.toByteArray()
                return if (size >= 0 && size <= all.size) all.copyOf(size.toInt()) else all
            }

            // Directory
            val dirBytes = readChain(firstDir, -1)
            val entries = ArrayList<Entry>()
            val dirBuf = ByteBuffer.wrap(dirBytes).order(ByteOrder.LITTLE_ENDIAN)
            val starts = ArrayList<Int>()
            val sizes = ArrayList<Long>()
            for (i in 0 until dirBytes.size / 128) {
                val p = i * 128
                val nameLen = (dirBuf.getShort(p + 64).toInt() and 0xFFFF).coerceIn(0, 64)
                val chars = maxOf(0, nameLen / 2 - 1)
                val name = String(dirBytes, p, chars * 2, Charsets.UTF_16LE)
                val clsid = dirBytes.copyOfRange(p + 80, p + 96)
                val type = dirBytes[p + 66].toInt() and 0xFF
                val e = Entry(
                    name, type, dirBytes[p + 67].toInt() and 0xFF,
                    dirBuf.getInt(p + 68), dirBuf.getInt(p + 72), dirBuf.getInt(p + 76),
                    clsid, dirBuf.getInt(p + 96), dirBuf.getLong(p + 100), dirBuf.getLong(p + 108),
                )
                var size = dirBuf.getLong(p + 120)
                if (major == 3) size = size and 0xFFFFFFFFL
                entries += e
                starts += dirBuf.getInt(p + 116)
                sizes += size
            }
            if (entries.isEmpty() || entries[0].type != TYPE_ROOT) throw MetadataException("Документ повреждён (нет корневого каталога)")

            val miniStream = readChain(starts[0], sizes[0])
            val miniFatBytes = if (firstMiniFat >= 0) readChain(firstMiniFat, -1) else ByteArray(0)
            val miniFatBuf = ByteBuffer.wrap(miniFatBytes).order(ByteOrder.LITTLE_ENDIAN)
            val miniFat = IntArray(miniFatBytes.size / 4) { miniFatBuf.getInt(it * 4) }

            fun readMini(start: Int, size: Long): ByteArray {
                val out = java.io.ByteArrayOutputStream()
                var s = start
                var guardMini = 0
                while (s >= 0 && out.size() < size) {
                    if (s >= miniFat.size || guardMini++ > miniFat.size) throw MetadataException("Документ повреждён (MiniFAT)")
                    val off = s * miniSs
                    if (off + miniSs > miniStream.size) throw MetadataException("Документ повреждён (мини-поток)")
                    out.write(miniStream, off, miniSs)
                    s = miniFat[s]
                }
                return out.toByteArray().copyOf(size.toInt())
            }

            for ((i, e) in entries.withIndex()) {
                if (e.type != TYPE_STREAM) continue
                val size = sizes[i]
                if (size > Int.MAX_VALUE) throw MetadataException("Поток слишком большой")
                e.data = when {
                    size == 0L -> ByteArray(0)
                    size < cutoff -> readMini(starts[i], size)
                    else -> readChain(starts[i], size)
                }
            }
            return CompoundFile(entries)
        }
    }
}
