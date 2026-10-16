package com.vsacoe.metadata.data

import com.vsacoe.metadata.core.LegacyOfficeHandler
import com.vsacoe.metadata.core.MetadataHandler
import com.vsacoe.metadata.core.OoxmlHandler
import com.vsacoe.metadata.core.mp4.Mp4Handler
import com.vsacoe.metadata.image.ImageHandler

enum class FileKind { OFFICE, IMAGE, VIDEO }

object Formats {
    private val ooxml by lazy { OoxmlHandler() }
    private val legacy by lazy { LegacyOfficeHandler() }
    private val mp4 by lazy { Mp4Handler() }
    private val image by lazy { ImageHandler() }

    private val MIME_TO_EXT = mapOf(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" to "docx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" to "xlsx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation" to "pptx",
        "application/msword" to "doc",
        "application/vnd.ms-excel" to "xls",
        "application/vnd.ms-powerpoint" to "ppt",
        "image/jpeg" to "jpg",
        "image/png" to "png",
        "image/webp" to "webp",
        "image/heic" to "heic",
        "image/heif" to "heif",
        "video/mp4" to "mp4",
        "video/quicktime" to "mov",
        "video/3gpp" to "3gp",
        "audio/mp4" to "m4a",
    )

    /** Picks the extension from the file name, falling back to the MIME type. */
    fun extensionOf(name: String, mime: String?): String {
        val ext = name.substringAfterLast('.', "").lowercase()
        if (handlerFor(ext) != null) return ext
        return MIME_TO_EXT[mime?.lowercase()] ?: ext
    }

    fun handlerFor(ext: String): MetadataHandler? = when (ext) {
        in OoxmlHandler.EXTENSIONS -> ooxml
        in LegacyOfficeHandler.EXTENSIONS -> legacy
        in Mp4Handler.EXTENSIONS -> mp4
        in ImageHandler.EXTENSIONS -> image
        else -> null
    }

    fun kindOf(ext: String): FileKind = when (ext) {
        in Mp4Handler.EXTENSIONS -> FileKind.VIDEO
        in ImageHandler.EXTENSIONS -> FileKind.IMAGE
        else -> FileKind.OFFICE
    }

    fun isWritable(ext: String): Boolean = handlerFor(ext) != image || image.isWritable(ext)

    fun mimeFor(ext: String): String = MIME_TO_EXT.entries.firstOrNull { it.value == ext }?.key ?: when (ext) {
        "jpeg", "jpe", "jfif" -> "image/jpeg"
        "m4v" -> "video/x-m4v"
        else -> "application/octet-stream"
    }

    /** MIME types offered in the system file picker. */
    val PICKER_TYPES = arrayOf("application/*", "image/*", "video/*", "audio/mp4")
}
