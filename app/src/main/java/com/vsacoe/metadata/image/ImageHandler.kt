package com.vsacoe.metadata.image

import androidx.exifinterface.media.ExifInterface
import com.vsacoe.metadata.core.DateUtil
import com.vsacoe.metadata.core.FieldType
import com.vsacoe.metadata.core.Groups
import com.vsacoe.metadata.core.MetaField
import com.vsacoe.metadata.core.MetadataException
import com.vsacoe.metadata.core.MetadataHandler
import java.io.File
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** JPEG, PNG and WebP photos (EXIF + XMP) via AndroidX ExifInterface. HEIC/DNG are read-only. */
class ImageHandler(private val zone: ZoneId = ZoneId.systemDefault()) : MetadataHandler {

    private class Tag(val key: String, val tag: String, val label: String, val type: FieldType, val group: String)

    override fun formatName(extension: String): String = when (extension) {
        "jpg", "jpeg", "jpe", "jfif" -> "Фото JPEG"
        "png" -> "Изображение PNG"
        "webp" -> "Изображение WebP"
        "heic", "heif" -> "Фото HEIC (только просмотр)"
        "dng" -> "Фото RAW DNG (только просмотр)"
        else -> "Изображение (${extension.uppercase()})"
    }

    fun isWritable(extension: String) = extension in WRITABLE

    override fun read(file: File): List<MetaField> {
        val exif = open(file)
        val ext = file.extension.lowercase()
        val editable = isWritable(ext)
        val fields = ArrayList<MetaField>()
        for (t in TEXT_TAGS) {
            fields += MetaField(t.key, t.label, ExifText.read(exif, t.tag), t.type, t.group, editable)
        }
        for (t in DATE_TAGS) {
            fields += MetaField(t.key, t.label, exifDateToDisplay(exif.getAttribute(t.tag)), t.type, t.group, editable)
        }
        val ll = exif.latLong
        fields += MetaField("latitude", "Широта", ll?.get(0)?.let(::fmt).orEmpty(), FieldType.DECIMAL, Groups.LOCATION, editable)
        fields += MetaField("longitude", "Долгота", ll?.get(1)?.let(::fmt).orEmpty(), FieldType.DECIMAL, Groups.LOCATION, editable)
        val alt = exif.getAttribute(ExifInterface.TAG_GPS_ALTITUDE)?.let { exif.getAltitude(0.0) }
        fields += MetaField("altitude", "Высота над морем (м)", alt?.let(::fmt).orEmpty(), FieldType.DECIMAL, Groups.LOCATION, editable)

        val w = exif.getAttributeInt(ExifInterface.TAG_IMAGE_WIDTH, 0).takeIf { it > 0 }
            ?: exif.getAttributeInt(ExifInterface.TAG_PIXEL_X_DIMENSION, 0)
        val h = exif.getAttributeInt(ExifInterface.TAG_IMAGE_LENGTH, 0).takeIf { it > 0 }
            ?: exif.getAttributeInt(ExifInterface.TAG_PIXEL_Y_DIMENSION, 0)
        if (w > 0 && h > 0) fields += MetaField("info.size", "Разрешение", "$w × $h", group = Groups.INFO, editable = false)
        if (exif.getAttribute(ExifInterface.TAG_XMP) != null) {
            fields += MetaField("info.xmp", "Блок XMP", "есть (удаляется кнопкой «Удалить всё»)", group = Groups.INFO, editable = false)
        }
        if (!editable) {
            fields += MetaField("info.readonly", "Внимание", "Этот формат можно только просматривать. Сохраните фото как JPEG, чтобы менять данные.", group = Groups.INFO, editable = false)
        }
        return fields
    }

    override fun write(source: File, target: File, values: Map<String, String>) {
        checkWritable(source)
        source.copyTo(target, overwrite = true)
        val exif = open(target)
        for (t in TEXT_TAGS) {
            val v = values[t.key] ?: continue
            ExifText.write(exif, t.tag, v.trim())
        }
        for (t in DATE_TAGS) {
            val v = values[t.key] ?: continue
            exif.setAttribute(t.tag, displayToExifDate(v))
            // Time-zone offsets belong to the old date; drop them.
            OFFSET_TAGS[t.tag]?.let { exif.setAttribute(it, null) }
        }
        if (values.containsKey("latitude") || values.containsKey("longitude")) {
            val lat = values["latitude"]?.trim().orEmpty()
            val lon = values["longitude"]?.trim().orEmpty()
            if (lat.isEmpty() && lon.isEmpty()) {
                for (tag in listOf(ExifInterface.TAG_GPS_LATITUDE, ExifInterface.TAG_GPS_LATITUDE_REF,
                    ExifInterface.TAG_GPS_LONGITUDE, ExifInterface.TAG_GPS_LONGITUDE_REF)) exif.setAttribute(tag, null)
            } else {
                val la = lat.replace(',', '.').toDoubleOrNull()
                val lo = lon.replace(',', '.').toDoubleOrNull()
                if (la == null || lo == null) throw MetadataException("Укажите и широту, и долготу (или очистите оба поля)")
                if (la !in -90.0..90.0 || lo !in -180.0..180.0) throw MetadataException("Координаты вне допустимого диапазона")
                exif.setLatLong(la, lo)
            }
        }
        values["altitude"]?.let { v ->
            val a = v.trim().replace(',', '.')
            if (a.isEmpty()) {
                exif.setAttribute(ExifInterface.TAG_GPS_ALTITUDE, null)
                exif.setAttribute(ExifInterface.TAG_GPS_ALTITUDE_REF, null)
            } else {
                exif.setAltitude(a.toDoubleOrNull() ?: throw MetadataException("Высота должна быть числом"))
            }
        }
        exif.saveAttributes()
        // A JPEG comment segment would show up again as the comment.
        if (values["comment"]?.isBlank() == true && isJpeg(target)) Segments.cleanJpeg(target, all = false)
    }

    override fun stripAll(source: File, target: File) {
        checkWritable(source)
        source.copyTo(target, overwrite = true)
        val exif = open(target)
        for (tag in ALL_TAGS) {
            if (tag in KEEP) continue
            if (exif.getAttribute(tag) != null) exif.setAttribute(tag, null)
        }
        exif.saveAttributes()
        when {
            isJpeg(target) -> Segments.cleanJpeg(target, all = true)
            target.extension.equals("png", ignoreCase = true) -> Segments.cleanPng(target)
        }
    }

    private fun isJpeg(file: File) = file.extension.lowercase() in setOf("jpg", "jpeg", "jpe", "jfif")

    private fun checkWritable(file: File) {
        if (!isWritable(file.extension.lowercase())) {
            throw MetadataException("Изменение метаданных доступно для JPEG, PNG и WebP. Этот формат — только просмотр.")
        }
    }

    private fun open(file: File): ExifInterface = try {
        ExifInterface(file)
    } catch (e: Exception) {
        throw MetadataException("Не удалось прочитать изображение: ${e.message}", e)
    }

    private fun exifDateToDisplay(v: String?): String {
        if (v.isNullOrBlank()) return ""
        return try {
            LocalDateTime.parse(v.trim().take(19), EXIF_DATE).format(DateUtil.DISPLAY)
        } catch (e: Exception) {
            v.trim()
        }
    }

    private fun displayToExifDate(v: String): String? {
        val instant = DateUtil.parse(v, zone) ?: return null
        return LocalDateTime.ofInstant(instant, zone).format(EXIF_DATE)
    }

    private fun fmt(d: Double) = String.format(Locale.US, "%.6f", d).trimEnd('0').trimEnd('.')

    companion object {
        val EXTENSIONS = setOf("jpg", "jpeg", "jpe", "jfif", "png", "webp", "heic", "heif", "dng")
        private val WRITABLE = setOf("jpg", "jpeg", "jpe", "jfif", "png", "webp")

        private val EXIF_DATE: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy:MM:dd HH:mm:ss")

        private val TEXT_TAGS = listOf(
            Tag("description", ExifInterface.TAG_IMAGE_DESCRIPTION, "Описание", FieldType.MULTILINE, Groups.DESCRIPTION),
            Tag("comment", ExifInterface.TAG_USER_COMMENT, "Комментарий", FieldType.MULTILINE, Groups.DESCRIPTION),
            Tag("artist", ExifInterface.TAG_ARTIST, "Автор", FieldType.TEXT, Groups.AUTHORSHIP),
            Tag("copyright", ExifInterface.TAG_COPYRIGHT, "Авторские права", FieldType.TEXT, Groups.AUTHORSHIP),
            Tag("owner", ExifInterface.TAG_CAMERA_OWNER_NAME, "Владелец камеры", FieldType.TEXT, Groups.AUTHORSHIP),
            Tag("make", ExifInterface.TAG_MAKE, "Производитель камеры", FieldType.TEXT, Groups.DEVICE),
            Tag("model", ExifInterface.TAG_MODEL, "Модель камеры", FieldType.TEXT, Groups.DEVICE),
            Tag("lens", ExifInterface.TAG_LENS_MODEL, "Объектив", FieldType.TEXT, Groups.DEVICE),
            Tag("serial", ExifInterface.TAG_BODY_SERIAL_NUMBER, "Серийный номер камеры", FieldType.TEXT, Groups.DEVICE),
            Tag("software", ExifInterface.TAG_SOFTWARE, "Программа", FieldType.TEXT, Groups.DEVICE),
        )

        private val DATE_TAGS = listOf(
            Tag("dateOriginal", ExifInterface.TAG_DATETIME_ORIGINAL, "Дата съёмки", FieldType.DATETIME, Groups.DATES),
            Tag("dateDigitized", ExifInterface.TAG_DATETIME_DIGITIZED, "Дата оцифровки", FieldType.DATETIME, Groups.DATES),
            Tag("dateTime", ExifInterface.TAG_DATETIME, "Дата изменения", FieldType.DATETIME, Groups.DATES),
        )

        private val OFFSET_TAGS = mapOf(
            ExifInterface.TAG_DATETIME_ORIGINAL to ExifInterface.TAG_OFFSET_TIME_ORIGINAL,
            ExifInterface.TAG_DATETIME_DIGITIZED to ExifInterface.TAG_OFFSET_TIME_DIGITIZED,
            ExifInterface.TAG_DATETIME to ExifInterface.TAG_OFFSET_TIME,
        )

        /** Tags describing the pixel data itself; removing them could break the picture. */
        private val KEEP = setOf(
            ExifInterface.TAG_ORIENTATION, ExifInterface.TAG_IMAGE_WIDTH, ExifInterface.TAG_IMAGE_LENGTH,
            ExifInterface.TAG_PIXEL_X_DIMENSION, ExifInterface.TAG_PIXEL_Y_DIMENSION,
            ExifInterface.TAG_BITS_PER_SAMPLE, ExifInterface.TAG_COMPRESSION,
            ExifInterface.TAG_PHOTOMETRIC_INTERPRETATION, ExifInterface.TAG_SAMPLES_PER_PIXEL,
            ExifInterface.TAG_PLANAR_CONFIGURATION, ExifInterface.TAG_Y_CB_CR_SUB_SAMPLING,
            ExifInterface.TAG_Y_CB_CR_POSITIONING, ExifInterface.TAG_Y_CB_CR_COEFFICIENTS,
            ExifInterface.TAG_STRIP_OFFSETS, ExifInterface.TAG_STRIP_BYTE_COUNTS, ExifInterface.TAG_ROWS_PER_STRIP,
            ExifInterface.TAG_JPEG_INTERCHANGE_FORMAT, ExifInterface.TAG_JPEG_INTERCHANGE_FORMAT_LENGTH,
            ExifInterface.TAG_COLOR_SPACE, ExifInterface.TAG_RESOLUTION_UNIT,
            ExifInterface.TAG_X_RESOLUTION, ExifInterface.TAG_Y_RESOLUTION,
            ExifInterface.TAG_NEW_SUBFILE_TYPE, ExifInterface.TAG_SUBFILE_TYPE,
            ExifInterface.TAG_EXIF_VERSION, ExifInterface.TAG_DEFAULT_CROP_SIZE, ExifInterface.TAG_DNG_VERSION,
        )

        /** Every TAG_* constant declared by ExifInterface. */
        private val ALL_TAGS: List<String> by lazy {
            ExifInterface::class.java.fields
                .filter { it.name.startsWith("TAG_") && it.type == String::class.java && java.lang.reflect.Modifier.isStatic(it.modifiers) }
                .mapNotNull { runCatching { it.get(null) as String }.getOrNull() }
                .distinct()
        }
    }
}
