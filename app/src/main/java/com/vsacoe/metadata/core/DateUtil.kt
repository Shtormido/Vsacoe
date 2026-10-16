package com.vsacoe.metadata.core

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

object DateUtil {
    val DISPLAY: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")

    fun format(instant: Instant?, zone: ZoneId = ZoneId.systemDefault()): String =
        if (instant == null) "" else LocalDateTime.ofInstant(instant, zone).format(DISPLAY)

    /** Parses `yyyy-MM-dd HH:mm[:ss]` or `yyyy-MM-dd`; returns null for blank text. */
    fun parse(text: String, zone: ZoneId = ZoneId.systemDefault()): Instant? {
        val t = text.trim().replace('T', ' ').replace('/', '-').replace('.', '-')
        if (t.isEmpty()) return null
        val ldt = try {
            when {
                t.length <= 10 -> LocalDate.parse(t).atStartOfDay()
                t.length <= 16 -> LocalDateTime.parse(t, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"))
                else -> LocalDateTime.parse(t.substring(0, 19), DISPLAY)
            }
        } catch (e: DateTimeParseException) {
            throw MetadataException("Неверная дата «$text». Формат: ГГГГ-ММ-ДД ЧЧ:ММ:СС")
        } catch (e: StringIndexOutOfBoundsException) {
            throw MetadataException("Неверная дата «$text». Формат: ГГГГ-ММ-ДД ЧЧ:ММ:СС")
        }
        return ldt.atZone(zone).toInstant()
    }

    fun isValid(text: String): Boolean = try {
        parse(text); true
    } catch (e: MetadataException) {
        false
    }
}

/** Checks a value typed by the user; returns an error message or null. */
object FieldValidator {
    fun validate(field: MetaField, value: String): String? {
        val v = value.trim()
        if (v.isEmpty()) return null
        return when (field.type) {
            FieldType.DATETIME -> if (DateUtil.isValid(v)) null else "Формат: ГГГГ-ММ-ДД ЧЧ:ММ:СС"
            FieldType.INTEGER -> if (v.toLongOrNull() != null && v.toLong() >= 0) null else "Введите целое число"
            FieldType.DECIMAL -> {
                val d = v.replace(',', '.').toDoubleOrNull()
                when {
                    d == null -> "Введите число, например 55.7558"
                    field.key.endsWith("latitude") && (d < -90 || d > 90) -> "Широта от -90 до 90"
                    field.key.endsWith("longitude") && (d < -180 || d > 180) -> "Долгота от -180 до 180"
                    else -> null
                }
            }
            else -> null
        }
    }
}
