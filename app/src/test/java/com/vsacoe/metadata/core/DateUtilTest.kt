package com.vsacoe.metadata.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant
import java.time.ZoneOffset

class DateUtilTest {
    @Test
    fun parsesVariants() {
        val z = ZoneOffset.UTC
        assertEquals(Instant.parse("2024-05-01T10:20:30Z"), DateUtil.parse("2024-05-01 10:20:30", z))
        assertEquals(Instant.parse("2024-05-01T10:20:00Z"), DateUtil.parse("2024-05-01 10:20", z))
        assertEquals(Instant.parse("2024-05-01T00:00:00Z"), DateUtil.parse("2024-05-01", z))
        assertEquals(Instant.parse("2024-05-01T10:20:30Z"), DateUtil.parse("2024.05.01 10:20:30", z))
        assertNull(DateUtil.parse("  ", z))
        assertEquals("2024-05-01 10:20:30", DateUtil.format(Instant.parse("2024-05-01T10:20:30Z"), z))
    }

    @Test(expected = MetadataException::class)
    fun rejectsGarbage() {
        DateUtil.parse("вчера")
    }

    @Test
    fun validator() {
        val lat = MetaField("latitude", "Широта", "", FieldType.DECIMAL)
        assertNull(FieldValidator.validate(lat, "55,75"))
        assertNotNull(FieldValidator.validate(lat, "95"))
        val date = MetaField("d", "Дата", "", FieldType.DATETIME)
        assertNotNull(FieldValidator.validate(date, "2024-13-01"))
        assertNull(FieldValidator.validate(date, ""))
    }
}
