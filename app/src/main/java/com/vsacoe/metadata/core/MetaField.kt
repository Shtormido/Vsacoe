package com.vsacoe.metadata.core

import java.io.File

/** How a field is edited in the UI. */
enum class FieldType { TEXT, MULTILINE, DATETIME, INTEGER, DECIMAL }

/** Group headers shown in the editor. */
object Groups {
    const val DESCRIPTION = "Описание"
    const val AUTHORSHIP = "Авторство"
    const val DATES = "Даты"
    const val LOCATION = "Местоположение"
    const val DEVICE = "Устройство и программа"
    const val INFO = "Сведения о файле"
}

/**
 * One metadata value of a file.
 *
 * [value] is always in display form: dates are `yyyy-MM-dd HH:mm:ss` in the
 * device time zone, numbers use a dot as decimal separator. An empty value
 * means the tag is absent; saving an empty value removes the tag.
 */
data class MetaField(
    val key: String,
    val label: String,
    val value: String,
    val type: FieldType = FieldType.TEXT,
    val group: String = Groups.DESCRIPTION,
    val editable: Boolean = true,
)

/** An error whose [message] is meant for the user (in Russian). */
class MetadataException(message: String, cause: Throwable? = null) : Exception(message, cause)

interface MetadataHandler {
    /** Human-readable format name, e.g. "Документ Word (DOCX)". */
    fun formatName(extension: String): String

    fun read(file: File): List<MetaField>

    /**
     * Copies [source] to [target] with the given fields changed.
     * Only keys present in [values] are touched; an empty string removes the tag.
     */
    fun write(source: File, target: File, values: Map<String, String>)

    /** Copies [source] to [target] removing every metadata tag the format allows. */
    fun stripAll(source: File, target: File)
}
