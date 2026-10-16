package com.vsacoe.metadata.image

import java.io.ByteArrayOutputStream
import java.io.File

/** Removes metadata blocks that ExifInterface does not manage (JPEG comments, IPTC, PNG text chunks). */
internal object Segments {
    private const val XMP_ID = "http://ns.adobe.com/xap/1.0/"

    /**
     * JPEG: drops COM segments, plus (when [all]) Photoshop/IPTC (APP13), Ducky (APP12)
     * and standalone XMP (APP1) segments. Everything from the first SOS marker on is copied as is.
     */
    fun cleanJpeg(file: File, all: Boolean) {
        val b = file.readBytes()
        if (b.size < 4 || b[0] != 0xFF.toByte() || b[1] != 0xD8.toByte()) return
        val out = ByteArrayOutputStream(b.size)
        out.write(b, 0, 2)
        var p = 2
        var changed = false
        while (p + 4 <= b.size) {
            if (b[p] != 0xFF.toByte()) break
            val marker = b[p + 1].toInt() and 0xFF
            if (marker == 0xDA || marker == 0xD9) break
            if (marker == 0xFF || marker == 0x01 || marker in 0xD0..0xD7) {
                out.write(b, p, 2); p += 2; continue
            }
            val len = ((b[p + 2].toInt() and 0xFF) shl 8) or (b[p + 3].toInt() and 0xFF)
            if (len < 2 || p + 2 + len > b.size) break
            val drop = when (marker) {
                0xFE -> true
                0xED, 0xEC -> all
                0xE1 -> all && String(b, p + 4, minOf(XMP_ID.length, len - 2), Charsets.ISO_8859_1) == XMP_ID
                else -> false
            }
            if (drop) changed = true else out.write(b, p, 2 + len)
            p += 2 + len
        }
        if (!changed) return
        out.write(b, p, b.size - p)
        file.writeBytes(out.toByteArray())
    }

    /** PNG: drops tEXt, zTXt, iTXt (including XMP) and tIME chunks. */
    fun cleanPng(file: File) {
        val b = file.readBytes()
        if (b.size < 8 || b[1] != 'P'.code.toByte() || b[2] != 'N'.code.toByte() || b[3] != 'G'.code.toByte()) return
        val out = ByteArrayOutputStream(b.size)
        out.write(b, 0, 8)
        var p = 8
        var changed = false
        while (p + 12 <= b.size) {
            val len = ((b[p].toInt() and 0xFF) shl 24) or ((b[p + 1].toInt() and 0xFF) shl 16) or
                ((b[p + 2].toInt() and 0xFF) shl 8) or (b[p + 3].toInt() and 0xFF)
            if (len < 0 || p + 12 + len > b.size) break
            val type = String(b, p + 4, 4, Charsets.ISO_8859_1)
            if (type in setOf("tEXt", "zTXt", "iTXt", "tIME")) changed = true else out.write(b, p, 12 + len)
            p += 12 + len
        }
        if (!changed) return
        out.write(b, p, b.size - p)
        file.writeBytes(out.toByteArray())
    }
}
