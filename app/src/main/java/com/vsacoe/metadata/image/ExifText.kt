package com.vsacoe.metadata.image

import androidx.exifinterface.media.ExifInterface
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.CharacterCodingException
import java.nio.charset.Charset
import java.nio.charset.CodingErrorAction

/**
 * Unicode-aware text tags for [ExifInterface].
 *
 * ExifInterface encodes every string as US-ASCII, which turns Cyrillic and other
 * non-Latin text into "????". Here text tags are stored as UTF-8 (the de-facto
 * convention used by phones, Windows and ExifTool) and UserComment uses the
 * standard "UNICODE" character code. The attribute object is swapped through
 * reflection; the library version is pinned and covered by tests.
 */
internal object ExifText {
    private const val FORMAT_ASCII = 2
    private const val FORMAT_UNDEFINED = 7
    private val ASCII_PREFIX = byteArrayOf(0x41, 0x53, 0x43, 0x49, 0x49, 0, 0, 0)
    private val UNICODE_PREFIX = byteArrayOf(0x55, 0x4E, 0x49, 0x43, 0x4F, 0x44, 0x45, 0)

    private val attributesField by lazy {
        ExifInterface::class.java.getDeclaredField("mAttributes").apply { isAccessible = true }
    }
    private val byteOrderField by lazy {
        ExifInterface::class.java.getDeclaredField("mExifByteOrder").apply { isAccessible = true }
    }
    private val attributeCtor by lazy {
        Class.forName("androidx.exifinterface.media.ExifInterface\$ExifAttribute")
            .getDeclaredConstructor(Int::class.javaPrimitiveType, Int::class.javaPrimitiveType, ByteArray::class.java)
            .apply { isAccessible = true }
    }

    fun read(exif: ExifInterface, tag: String): String {
        val raw = exif.getAttributeBytes(tag) ?: return ""
        val text = if (tag == ExifInterface.TAG_USER_COMMENT) decodeComment(raw, byteOrder(exif)) else decode(raw)
        return text.trimEnd('\u0000', ' ').trim()
    }

    fun write(exif: ExifInterface, tag: String, value: String?) {
        if (value.isNullOrEmpty()) {
            exif.setAttribute(tag, null)
            return
        }
        val comment = tag == ExifInterface.TAG_USER_COMMENT
        val ascii = value.all { it.code in 0x20..0x7E || it == '\n' || it == '\r' || it == '\t' }
        if (ascii && !comment) {
            exif.setAttribute(tag, value)
            return
        }
        val (format, bytes) = if (comment) {
            if (ascii) {
                FORMAT_UNDEFINED to ASCII_PREFIX + value.toByteArray(Charsets.US_ASCII)
            } else {
                val be = byteOrder(exif) != ByteOrder.LITTLE_ENDIAN
                FORMAT_UNDEFINED to UNICODE_PREFIX + value.toByteArray(if (be) Charsets.UTF_16BE else Charsets.UTF_16LE)
            }
        } else {
            FORMAT_ASCII to value.toByteArray(Charsets.UTF_8) + 0
        }
        try {
            exif.setAttribute(tag, "x") // puts the tag into the right IFD
            @Suppress("UNCHECKED_CAST")
            val maps = attributesField.get(exif) as Array<HashMap<String, Any>>
            val attr = attributeCtor.newInstance(format, bytes.size, bytes)
            var replaced = false
            for (m in maps) if (m.containsKey(tag)) {
                m[tag] = attr
                replaced = true
            }
            if (!replaced) exif.setAttribute(tag, value)
        } catch (e: ReflectiveOperationException) {
            exif.setAttribute(tag, value)
        } catch (e: ClassCastException) {
            exif.setAttribute(tag, value)
        }
    }

    private fun decode(raw: ByteArray): String {
        var end = raw.size
        while (end > 0 && raw[end - 1].toInt() == 0) end--
        val bytes = raw.copyOf(end)
        return strictDecode(bytes, Charsets.UTF_8) ?: String(bytes, Charset.forName("windows-1252"))
    }

    private fun byteOrder(exif: ExifInterface): ByteOrder? =
        runCatching { byteOrderField.get(exif) as ByteOrder }.getOrNull()

    private fun decodeComment(raw: ByteArray, order: ByteOrder?): String {
        if (raw.size < 8) return decode(raw)
        val head = raw.copyOf(8)
        val body = raw.copyOfRange(8, raw.size)
        return when {
            head.contentEquals(UNICODE_PREFIX) -> {
                // Byte order follows the TIFF header; guess from the text if it is unknown.
                val be = order?.let { it == ByteOrder.BIG_ENDIAN }
                    ?: (body.size >= 2 && body[0].toInt() == 0 && body[1].toInt() != 0)
                String(body, if (be) Charsets.UTF_16BE else Charsets.UTF_16LE).trimEnd('\u0000')
            }
            head.contentEquals(ASCII_PREFIX) || head.all { it.toInt() == 0 } -> decode(body)
            String(head, Charsets.US_ASCII).startsWith("JIS") -> decode(body)
            else -> decode(raw)
        }
    }

    private fun strictDecode(bytes: ByteArray, cs: Charset): String? = try {
        cs.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(bytes)).toString()
    } catch (e: CharacterCodingException) {
        null
    }
}
