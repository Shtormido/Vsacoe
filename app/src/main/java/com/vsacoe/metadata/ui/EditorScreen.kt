package com.vsacoe.metadata.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.vsacoe.metadata.core.DateUtil
import com.vsacoe.metadata.core.FieldType
import com.vsacoe.metadata.core.Groups
import com.vsacoe.metadata.core.MetaField
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.Locale

private val GROUP_ORDER = listOf(
    Groups.DESCRIPTION, Groups.AUTHORSHIP, Groups.DATES, Groups.LOCATION, Groups.DEVICE, Groups.INFO,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditorScreen(
    vm: MainViewModel,
    snackbar: SnackbarHostState,
    onSaveCopy: (strip: Boolean) -> Unit,
) {
    val doc = vm.doc ?: return
    var confirmExit by remember { mutableStateOf(false) }
    var confirmStrip by remember { mutableStateOf(false) }
    var confirmOverwrite by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    var dateFor by remember { mutableStateOf<MetaField?>(null) }

    val goBack = { if (vm.hasChanges) confirmExit = true else vm.close() }
    BackHandler(onBack = goBack)

    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = {
                    IconButton(onClick = goBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Назад") }
                },
                title = {
                    Column {
                        Text(doc.name, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleMedium)
                        Text(doc.formatName, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
                actions = {
                    IconButton(onClick = { menu = true }) { Icon(Icons.Default.MoreVert, contentDescription = "Меню") }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        DropdownMenuItem(
                            text = { Text("Отменить изменения") },
                            enabled = vm.hasChanges,
                            onClick = { menu = false; vm.discardEdits() },
                        )
                        DropdownMenuItem(text = { Text("Обучение") }, onClick = { menu = false; vm.replayOnboarding() })
                        DropdownMenuItem(text = { Text("Закрыть файл") }, onClick = { menu = false; goBack() })
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            Surface(tonalElevation = 3.dp) {
                Row(
                    Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    OutlinedButton(
                        onClick = { onSaveCopy(false) },
                        enabled = doc.writable,
                        modifier = Modifier.weight(1f).height(52.dp),
                    ) { Text("Копия") }
                    Button(
                        onClick = { confirmOverwrite = true },
                        enabled = doc.writable && vm.hasChanges,
                        modifier = Modifier.weight(1f).height(52.dp),
                    ) { Text(if (vm.hasChanges) "Сохранить (${vm.edits.size})" else "Сохранить") }
                }
            }
        },
    ) { padding ->
        val grouped = doc.fields.groupBy { it.group }
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (vm.showEditorTip) {
                item {
                    Card(
                        Modifier.fillMaxWidth().padding(bottom = 8.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer),
                    ) {
                        Column(Modifier.padding(16.dp)) {
                            Text("💡 Подсказка", fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(4.dp))
                            Text(
                                "Меняйте любые поля ниже. Пустое поле = тег будет удалён. " +
                                    "Затем нажмите «Сохранить» (перезаписать файл) или «Копия» (новый файл). " +
                                    "Кнопка удаления всех метаданных — в самом низу.",
                            )
                            TextButton(onClick = vm::dismissEditorTip, modifier = Modifier.align(Alignment.End)) { Text("Понятно") }
                        }
                    }
                }
            }
            item { FileInfoCard(doc) }
            for (group in GROUP_ORDER + (grouped.keys - GROUP_ORDER.toSet())) {
                val fields = grouped[group] ?: continue
                item(key = "h_$group") {
                    Text(
                        group,
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(top = 16.dp, bottom = 4.dp),
                    )
                }
                items(fields, key = { it.key }) { field ->
                    if (field.editable) {
                        FieldEditor(
                            field = field,
                            value = vm.valueOf(field),
                            changed = vm.edits.containsKey(field.key),
                            error = vm.errorOf(field),
                            onChange = { vm.setValue(field, it) },
                            onPickDate = { dateFor = field },
                        )
                    } else {
                        InfoRow(field.label, field.value)
                    }
                }
            }
            item {
                Spacer(Modifier.height(24.dp))
                HorizontalDivider()
                Spacer(Modifier.height(16.dp))
                Text("Конфиденциальность", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.error)
                Text(
                    "Удаляет автора, организацию, даты, координаты, сведения об устройстве и прочие теги. Содержимое файла не меняется.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                OutlinedButton(
                    onClick = { confirmStrip = true },
                    enabled = doc.writable,
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) { Text("🧹  Удалить все метаданные") }
                Spacer(Modifier.height(24.dp))
            }
        }
    }

    if (confirmExit) {
        AlertDialog(
            onDismissRequest = { confirmExit = false },
            title = { Text("Выйти без сохранения?") },
            text = { Text("Изменённые поля (${vm.edits.size}) не будут записаны в файл.") },
            confirmButton = { TextButton(onClick = { confirmExit = false; vm.close() }) { Text("Выйти") } },
            dismissButton = { TextButton(onClick = { confirmExit = false }) { Text("Остаться") } },
        )
    }

    if (confirmOverwrite) {
        AlertDialog(
            onDismissRequest = { confirmOverwrite = false },
            title = { Text("Перезаписать файл?") },
            text = { Text("Изменения будут записаны в «${doc.name}». Чтобы сохранить оригинал, выберите «Копия».") },
            confirmButton = { TextButton(onClick = { confirmOverwrite = false; vm.save(null, strip = false) }) { Text("Перезаписать") } },
            dismissButton = {
                TextButton(onClick = { confirmOverwrite = false; onSaveCopy(false) }) { Text("Копия") }
            },
        )
    }

    if (confirmStrip) {
        AlertDialog(
            onDismissRequest = { confirmStrip = false },
            title = { Text("Удалить все метаданные?") },
            text = { Text("Можно перезаписать исходный файл или сохранить очищенную копию (рекомендуется).") },
            confirmButton = {
                TextButton(onClick = { confirmStrip = false; onSaveCopy(true) }) { Text("Чистая копия") }
            },
            dismissButton = {
                Row {
                    TextButton(onClick = { confirmStrip = false }) { Text("Отмена") }
                    TextButton(onClick = { confirmStrip = false; vm.save(null, strip = true) }) {
                        Text("Перезаписать", color = MaterialTheme.colorScheme.error)
                    }
                }
            },
        )
    }

    dateFor?.let { field ->
        DateTimeDialog(
            initial = vm.valueOf(field),
            onDismiss = { dateFor = null },
            onPicked = { vm.setValue(field, it); dateFor = null },
        )
    }
}

@Composable
private fun FileInfoCard(doc: OpenedDoc) {
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(Modifier.padding(16.dp)) {
            Text(doc.formatName, style = MaterialTheme.typography.titleSmall)
            Text("Размер: ${formatSize(doc.size)}", style = MaterialTheme.typography.bodyMedium)
            if (!doc.writable) {
                Spacer(Modifier.height(4.dp))
                Text("Этот формат доступен только для просмотра.", color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Text(label, Modifier.weight(0.45f), color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.width(8.dp))
        Text(value, Modifier.weight(0.55f))
    }
}

@Composable
private fun FieldEditor(
    field: MetaField,
    value: String,
    changed: Boolean,
    error: String?,
    onChange: (String) -> Unit,
    onPickDate: () -> Unit,
) {
    val keyboard = when (field.type) {
        FieldType.INTEGER -> KeyboardOptions(keyboardType = KeyboardType.Number)
        FieldType.DECIMAL -> KeyboardOptions(keyboardType = KeyboardType.Decimal)
        else -> KeyboardOptions.Default
    }
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(field.label) },
        placeholder = {
            Text(
                when (field.type) {
                    FieldType.DATETIME -> "ГГГГ-ММ-ДД ЧЧ:ММ:СС"
                    FieldType.DECIMAL -> "например 55.7558"
                    else -> "не задано"
                },
            )
        },
        singleLine = field.type != FieldType.MULTILINE,
        minLines = if (field.type == FieldType.MULTILINE) 2 else 1,
        isError = error != null,
        supportingText = when {
            error != null -> ({ Text(error) })
            changed -> ({ Text(if (value.isEmpty()) "Будет удалено" else "Изменено", color = MaterialTheme.colorScheme.primary) })
            else -> null
        },
        keyboardOptions = keyboard,
        trailingIcon = {
            Row {
                if (field.type == FieldType.DATETIME) {
                    IconButton(onClick = onPickDate) { Icon(Icons.Default.DateRange, contentDescription = "Выбрать дату") }
                }
                if (value.isNotEmpty()) {
                    IconButton(onClick = { onChange("") }) { Icon(Icons.Default.Clear, contentDescription = "Очистить") }
                }
            }
        },
        modifier = Modifier.fillMaxWidth(),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateTimeDialog(initial: String, onDismiss: () -> Unit, onPicked: (String) -> Unit) {
    val zone = ZoneId.systemDefault()
    val start: LocalDateTime = remember(initial) {
        runCatching { DateUtil.parse(initial, zone) }.getOrNull()?.let { LocalDateTime.ofInstant(it, zone) }
            ?: LocalDateTime.now().withNano(0)
    }
    var pickedDate by remember { mutableStateOf<LocalDate?>(null) }

    if (pickedDate == null) {
        val state = rememberDatePickerState(
            initialSelectedDateMillis = start.toLocalDate().atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = onDismiss,
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let {
                        pickedDate = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()
                    }
                }) { Text("Далее") }
            },
            dismissButton = { TextButton(onClick = onDismiss) { Text("Отмена") } },
        ) { DatePicker(state = state) }
    } else {
        val time = rememberTimePickerState(start.hour, start.minute, is24Hour = true)
        AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text("Время") },
            text = { TimePicker(state = time) },
            confirmButton = {
                TextButton(onClick = {
                    val dt = LocalDateTime.of(pickedDate, LocalTime.of(time.hour, time.minute, start.second))
                    onPicked(dt.format(DateUtil.DISPLAY))
                }) { Text("Готово") }
            },
            dismissButton = { TextButton(onClick = onDismiss) { Text("Отмена") } },
        )
    }
}

private fun formatSize(bytes: Long): String = when {
    bytes < 1024 -> "$bytes Б"
    bytes < 1024 * 1024 -> String.format(Locale.US, "%.1f КБ", bytes / 1024.0)
    bytes < 1024L * 1024 * 1024 -> String.format(Locale.US, "%.1f МБ", bytes / 1048576.0)
    else -> String.format(Locale.US, "%.2f ГБ", bytes / 1073741824.0)
}
