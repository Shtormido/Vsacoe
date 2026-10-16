package com.vsacoe.metadata.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

private class TutorialPage(
    val emoji: String,
    val title: String,
    val text: String,
    val demo: (@Composable () -> Unit)? = null,
)

private val pages = listOf(
    TutorialPage(
        "👋", "Добро пожаловать!",
        "Метаданные — это скрытые сведения внутри файла: автор, организация, даты создания и изменения, " +
            "модель телефона, GPS-координаты места съёмки.\n\nЭто приложение показывает их и позволяет изменить " +
            "или полностью удалить. Пролистайте несколько коротких шагов, чтобы узнать, как им пользоваться.",
    ),
    TutorialPage(
        "📂", "Шаг 1. Выберите файл",
        "Нажмите большую кнопку «Выбрать файл» на главном экране и найдите нужный документ, фото или видео.\n\n" +
            "Ещё способ: в галерее или файловом менеджере нажмите «Поделиться» и выберите это приложение.",
    ) { DemoPickButton() },
    TutorialPage(
        "✏️", "Шаг 2. Измените поля",
        "Все сведения разложены по разделам: «Описание», «Авторство», «Даты», «Местоположение», «Устройство».\n\n" +
            "• Нажмите на поле и введите новый текст.\n" +
            "• Значок календаря — выбрать дату и время.\n" +
            "• Крестик — очистить поле. Пустое поле при сохранении удаляется из файла.\n" +
            "• Изменённые поля помечаются надписью «Изменено».",
    ) { DemoField() },
    TutorialPage(
        "💾", "Шаг 3. Сохраните",
        "«Сохранить» — записать изменения прямо в исходный файл.\n\n" +
            "«Копия» — создать новый файл с изменениями, а оригинал оставить как был. " +
            "Если не уверены — выбирайте копию.\n\n" +
            "Если файл открыт через «Поделиться», перезапись может быть запрещена системой — тогда используйте копию.",
    ) { DemoSaveButtons() },
    TutorialPage(
        "🧹", "Удалить всё одним нажатием",
        "Перед отправкой файла чужим людям удобно стереть из него все личные данные: имя автора, организацию, " +
            "координаты, модель телефона, даты.\n\nКнопка «Удалить все метаданные» находится внизу экрана редактирования. " +
            "Сама картинка, видео или текст документа не меняются.",
    ) { DemoStripButton() },
    TutorialPage(
        "📋", "Что поддерживается",
        "📄 Word: DOCX, DOCM, DOTX, DOC, DOT\n" +
            "📊 Excel: XLSX, XLSM, XLTX, XLSB, XLS, XLT\n" +
            "📽 PowerPoint: PPTX, PPTM, PPSX, POTX, PPT, PPS, POT\n" +
            "📐 Visio: VSDX, VSD; Publisher: PUB\n" +
            "🖼 Фото: JPEG, PNG, WebP (HEIC и DNG — только просмотр)\n" +
            "🎬 Видео: MP4, MOV, M4V, 3GP (и аудио M4A)\n\n" +
            "Обучение можно открыть снова кнопкой ⓘ в правом верхнем углу главного экрана.",
    ),
)

@Composable
fun OnboardingScreen(onFinish: () -> Unit) {
    val state = rememberPagerState { pages.size }
    val scope = rememberCoroutineScope()
    val last = state.currentPage == pages.lastIndex

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize().safeDrawingPadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Обучение · ${state.currentPage + 1} из ${pages.size}",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 12.dp).weight(1f),
                )
                if (!last) TextButton(onClick = onFinish) { Text("Пропустить") }
            }

            HorizontalPager(state = state, modifier = Modifier.weight(1f)) { index ->
                PageContent(pages[index])
            }

            Row(
                Modifier.fillMaxWidth().padding(vertical = 12.dp),
                horizontalArrangement = Arrangement.Center,
            ) {
                repeat(pages.size) { i ->
                    val selected = i == state.currentPage
                    val width by animateDpAsState(if (selected) 24.dp else 8.dp, label = "dot")
                    val color by animateColorAsState(
                        if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                        label = "dotColor",
                    )
                    Box(
                        Modifier.padding(horizontal = 4.dp).height(8.dp).width(width)
                            .clip(CircleShape).background(color),
                    )
                }
            }

            Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                if (state.currentPage > 0) {
                    OutlinedButton(
                        onClick = { scope.launch { state.animateScrollToPage(state.currentPage - 1) } },
                        modifier = Modifier.weight(1f).height(52.dp),
                    ) { Text("Назад") }
                }
                Button(
                    onClick = {
                        if (last) onFinish() else scope.launch { state.animateScrollToPage(state.currentPage + 1) }
                    },
                    modifier = Modifier.weight(1f).height(52.dp),
                ) { Text(if (last) "Начать работу" else "Далее") }
            }
        }
    }
}

@Composable
private fun PageContent(page: TutorialPage) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier.size(120.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer),
            contentAlignment = Alignment.Center,
        ) { Text(page.emoji, fontSize = 56.sp) }
        Spacer(Modifier.height(24.dp))
        Text(
            page.title,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(16.dp))
        Text(page.text, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.fillMaxWidth())
        page.demo?.let {
            Spacer(Modifier.height(20.dp))
            Card(
                Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            ) {
                Column(Modifier.padding(16.dp)) {
                    Text("Так это выглядит:", style = MaterialTheme.typography.labelMedium)
                    Spacer(Modifier.height(8.dp))
                    it()
                }
            }
        }
    }
}

@Composable
private fun DemoPickButton() {
    Button(onClick = {}, modifier = Modifier.fillMaxWidth().height(56.dp)) { Text("📂  Выбрать файл") }
}

@Composable
private fun DemoField() {
    OutlinedTextField(
        value = "Иван Петров",
        onValueChange = {},
        readOnly = true,
        label = { Text("Автор") },
        supportingText = { Text("Изменено", color = MaterialTheme.colorScheme.primary) },
        trailingIcon = { Icon(Icons.Default.Clear, contentDescription = null) },
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = "2024-05-12 14:30:00",
        onValueChange = {},
        readOnly = true,
        label = { Text("Дата создания") },
        trailingIcon = { Icon(Icons.Default.DateRange, contentDescription = null) },
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun DemoSaveButtons() {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = {}, modifier = Modifier.weight(1f)) { Text("Копия") }
        Button(onClick = {}, modifier = Modifier.weight(1f)) { Text("Сохранить") }
    }
}

@Composable
private fun DemoStripButton() {
    OutlinedButton(
        onClick = {},
        modifier = Modifier.fillMaxWidth(),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
    ) { Text("🧹  Удалить все метаданные") }
}
