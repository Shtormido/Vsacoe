# «Под фундаментом» — мастер-промт для генерации графики

Промты написаны на английском: Midjourney, Stable Diffusion (SDXL, Flux) и DALL·E понимают его лучше русского. Русские пометки объясняют, что и зачем генерировать.

**Как пользоваться**
1. Каждый промт начинайте с блока **STYLE**, затем добавляйте промт конкретного ассета.
2. **NEGATIVE** вставляйте в поле negative prompt (в Midjourney — через `--no ...`).
3. Получившуюся картинку уменьшите до целевого размера с фильтром «ближайший сосед» (nearest neighbor) и прогоните через палитру ниже. Иначе пиксель-арт «поплывёт».

---

## 1. STYLE — общий стиль (вставлять первым)

```
2D side-view pixel art, horror point-and-click adventure, 16-bit era,
crisp hard pixels, no anti-aliasing, limited 32-color palette,
cold blue-gray and dark green tones, deep shadows, ordered (Bayer) dithering
on light falloff, warm orange only from flashlight and candles,
red reserved for danger, abandoned 1950s Soviet metro built over an old
monastery cemetery, damp concrete, cracked ceramic tile, rust, smalt mosaic,
quiet dread, atmospheric, cinematic lighting, flat orthographic side view,
no perspective distortion, game asset
```

## 2. NEGATIVE — что исключить

```
blood, gore, dismemberment, anime, chibi, cartoonish, 3D render, photorealistic,
smooth gradients, blur, anti-aliasing, soft brush, painterly, text, watermark,
signature, logo, frame, border, isometric, top-down, fisheye, lens flare overload,
neon, cyberpunk, bright saturated colors, cheerful
```

## 3. Технические требования

| Параметр | Значение |
|---|---|
| Внутреннее разрешение | 480×270 (масштаб ×4 до 1920×1080), фильтр nearest |
| Тайл | 16×16 |
| Спрайт персонажа | 32×48, ноги на нижней строке, центр по X |
| Анимации | 8–12 кадров/с; ходьба 6 кадров, остальное 2–4 |
| Фоны | ширина сцены 480–1600 px, высота 270; 3 слоя параллакса: дальний, основной, передний |
| Пол героев | линия y = 232 |
| Контур | 1 px почти чёрный (#07070c) у персонажей и духов |

**Палитра (32 цвета), HEX:**

```
#07070c #0e111a #181d26 #242b36 #3a424d #58616b #80888f #b0b6ba
#e2e4dc #c4ba9c #968e76 #162e28 #264a3e #4a705e #1c2a48 #304a78
#78b4e8 #d47028 #ffb050 #ffe08c #34241a #5e422a #7a3e24 #781416
#e63832 #543a80 #be96f5 #d6aa8c #ccc6ac #162c3a #101016
```

Добавка к промту в Midjourney: `--ar 16:9 --style raw --stylize 50`. Для спрайтов используйте `--ar 2:3` и `on plain flat #0e111a background`.

---

## 4. Персонажи (спрайт-листы)

### Дима (игровой герой, 28 лет)
```
pixel art character sprite sheet, 32x48 pixels per frame, side view facing right,
young man 28, neat, observant, dark navy blue work jacket, headlamp on forehead
strap, dark green backpack, small notebook in chest pocket, dark trousers, boots,
rows: idle (4 frames, subtle breathing), walk cycle (6 frames), inspect (lean
forward, hand extended, 3 frames), sit on bench, freeze (crouched, hand over mouth),
climb ladder (back view, 2 frames), kneel, frightened pose,
1px dark outline, plain #0e111a background, evenly spaced grid
```

### Лёха (напарник, 30 лет)
```
pixel art character sprite sheet, 32x48 pixels per frame, side view facing right,
man 30, stubble, messy dark hair, bright orange work jacket, film camera hanging
on neck strap, small voice recorder clipped to backpack strap, gray trousers,
dark backpack, talkative nervous body language,
rows: idle, walk (6 frames), taking photo with flash, sit, kneel crying,
possessed variant with faint red glowing eyes and slumped posture,
1px dark outline, plain #0e111a background
```

---

## 5. Духи

### Сестра Евдокия (инокиня, 1887) — добрый дух
```
pixel art ghost sprite, 32x52, nun in long black habit and black headscarf, pale
calm face, holding a lit wax candle at chest, warm orange candle glow on face,
hem dissolving into dithered transparency, faint horizontal scanline flicker,
sorrowful but kind, not scary, side view, 4-frame idle floating loop
```

### Пётр Лаптев (прораб, 1954) — добрый дух
```
pixel art light effect, soft pale glowing spot shaped like a 1950s construction
helmet projected on a wet brick wall, dithered glow edges, 4-frame gentle pulse;
second variant: translucent silhouette of a worker in a helmet holding a trowel,
light gray, faded
```

### Алёша Миронов (7 лет, 1931) — добрый дух
```
pixel art ghost child sprite, 22x34, boy 7 years old, old worn brown coat with
bone buttons, gray ushanka hat with ear flaps, barefoot with wet footprints,
holding a small wooden toy horse on wheels, translucent, faint cold blue glow,
shy, not scary, side view, idle and waving animation
```

### Безымянные (43 души общей ямы 1892) — враги
```
pixel art enemy sprite sheet, tall thin gray humanoid figures without faces,
smooth blank oval heads with two dark hollows, arms too long reaching the knees,
smudged dithered edges, glitchy horizontal row offsets, 4 body variants,
jerky movement frames (3 per variant), semi-transparent, unsettling,
no blood, side view
```

### Проповедник (Всеволод, 1979) — враг
```
pixel art enemy sprite, 40x66, very tall figure in coarse burlap cassock,
deep hood with pure black void instead of face and two tiny dim red points,
rope belt, torn ragged hem with dark smoke wisps, bony pale fingers,
slow walk cycle (4 frames), standing still frame, reflection variant (faded)
```

---

## 6. Локации (фоны, 3 слоя параллакса)

Для каждой сцены генерируйте три слоя: `far background layer`, `main layer`, `foreground silhouettes layer, transparent background`.

| № | Сцена | Промт ассета (добавить к STYLE) |
|---|---|---|
| 0 | Поверхность, вентшахта Н-2 | `night wasteland, waist-high dry weeds, rusty ventilation shaft "mushroom" with hatch and ladder rungs, distant city skyline with three yellow lights, moon with halo, drifting clouds, cold wind` |
| 1 | Служебный коридор | `long service corridor, gray peeling plaster, damp stains, empty cable trays, wire-caged lamps all dead, rusty half-open steel door, puddles` |
| 1 | Станция «Северная» | `1950s island platform, cream ceramic tile columns with dark green skirting, smalt mosaic sign "СЕВЕРНАЯ" above tracks, broken bell-shaped ceiling lamps, station clock stopped at 11:40, propaganda poster of workers, wooden bench` |
| 2 | Перегон «Северная»–«Липовая» | `cast-iron tunnel rings, rusty rails, cable trays both sides, white salt stains, blue distance sign "ЛИПОВАЯ — 400 м"` |
| 3 | Станция «Липовая» | `small side platform, light gray tile, yellow water stains on ceiling, wooden builders' hut with window, faded notice board, red graffiti "КРОТЫ. 2008", small niche with dusty curtain and wooden toy horse, loose tile at platform end` |
| 4 | Перегон и подсобки | `brick-lined tunnel, wet stone, many puddles, single drip from dry ceiling, side passage with thick dust and footprints ending at a bricked wall, lineman's booth with kerosene lamp and track scheme on wall` |
| 5 | Станция «Монастырская» | `low vaulted station, gray-green tile with relief crosses, remains of ceiling fresco, row of columns, dark service door across tracks, niche in plaster with exposed brick` |
| 6 | Служебный тоннель №3 | `extremely narrow claustrophobic service tunnel, walls almost touching, low ceiling, wet concrete, everything black except flashlight cone` |
| 7 | «Центральная», зеркальный коридор | `corridor of black polished granite, reflective floor and walls, empty lamp fixtures along ceiling, dark side arches, tall robed figure barely visible in reflection` |
| 8 | Административный блок | `long corridor with wooden office doors and plaques, peeling paint, cobwebs; office of construction chief: oak desk, green banker lamp, ebonite telephone, steel safe, folder cabinet, pale rectangle where a portrait was removed` |
| 9 | Депо секты | `huge dark depot, rows of rusted skeletal metro cars, chalk circles and symbols on floor, altar built from crates and doors covered with wax and candles, crude chalk drawing of a robed man with spread arms, notes nailed to wall` |
| 10 | Затопленный перегон | `tunnel flooded knee-deep, black still water with ripples, flashlight reflections, chalk drawing of a helmet on brick dead-end; foreman's room with table, photo, letter, wet brick wall` |
| 11 | Станция «Покровская» | `grand high-vaulted station, arched columns, erased saints on ceiling fresco, cracked concrete slab dated 1954 surrounded by iron bars, fog with faceless gray figures, brick crosses on walls, shaft ladder N-4 on the right, old escalator` |
| 12 | Концовки | `A: dawn over the wasteland, two exhausted men sitting in weeds; B: dawn, remains of white monastery wall, three faint light silhouettes on escalator steps` |

---

## 7. Предметы (иконки 16×16 и 32×32)

```
pixel art item icon set, 16x16 each, dark outline, plain #0e111a background:
flashlight, battery, chalk stick, voice recorder, compass, folded map, journal,
wooden toy horse on wheels, broken gravestone fragment with letters "...ДОКИЯ",
wooden rosary, thick wax candle in melted jar, old letter in envelope,
document folder "Дело №7", tracing paper roll, thermos, human skull (no gore),
rusty helmet with name, enamel teapot, bucket
```

## 8. Интерфейс

```
pixel art UI kit for dark horror game: dialogue speech bubbles in four colors
(light blue, orange, violet, red border on near-black), battery meter,
breathing rhythm bar with green window, audio spectrum bars, compass with red
needle, journal tabs, aged paper note background, tracing paper overlay with
cemetery plan, cursor set (crosshair, eye, arrow), no text
```

## 9. Скримеры (4–8 кадров, без крови)

```
pixel art jump-scare frames, high contrast, sudden pale woman's face in black
headscarf in a dark doorway (visible 0.4 s); dozens of gray faceless faces filling
the frame behind the viewer; tall hooded figure appearing in polished granite
reflection; no blood, no gore, sharp contrast, 4-6 frames each
```

## 10. Открытки финала «Покой»

```
pixel art postcard illustrations, warm dawn palette within the game palette:
1) two men showing a document to an archivist in a city archive;
2) newspaper headline about an old cemetery found under the metro;
3) journalist with a recorder interviewing a young man, his friend holds a stone
   fragment;
4) workers lifting a concrete slab on a wasteland, people with flowers,
   old woman holding a letter;
5) cemetery at dawn with 43 new crosses and three separate ones, a lit candle
```

---

## 11. Порядок работы

1. Начните с героев: Дима и Лёха задают стиль всего остального. Генерируйте 4–8 вариантов и выберите лучший.
2. Используйте выбранную картинку как референс для остальных: `--sref <url>` в Midjourney или IP-Adapter в Stable Diffusion.
3. Фоны генерируйте послойно и затем доводите вручную в Aseprite или LibreSprite: палитра, контур, выравнивание по сетке 16×16.
4. Анимации нейросети делают плохо. Лучше получить один кадр, а остальные дорисовать руками.
5. Готовые PNG складывайте в `game/assets/` с понятными именами (`dima_walk.png`, `bg_severnaya_main.png`). Чтобы игра их подхватила, нужно поменять код: сейчас вся графика рисуется программно.

---

## 12. Фоны для встраивания в игру

Персонажи и духи из присланного листа уже стоят в игре. Арт с входом в метро стал фоном главного меню, арт станции с мозаикой — фоном заставок актов. Вырезать спрайты повторно можно скриптом `build/sprites/cut_sprites.py`.

Чтобы фоны локаций выглядели так же, сгенерируйте их по таблице ниже.
- Размер: ширина × 270 точек игры. В нейросети делайте в 4 раза больше (например, 1100×270 → 4400×1080), а если сервис не даёт такой ширины, генерируйте кусками.
- Вид строго сбоку. Линия пола, по которой ходят герои, — на 232-й строке сверху из 270, то есть на 86 % высоты кадра.
- На фоне не должно быть людей и духов.
- Освещение рисуйте тёмным и ровным: свет фонаря, свечей и вентрешёток игра добавит сама.

Пришлите готовые картинки — я встрою их и подгоню под них интерактивные предметы (двери, таблички, ниши).

| ID сцены | Локация | Размер в игре |
|---|---|---|
| `surface` | Поверхность, вентшахта Н-2 | 560×270 |
| `corridor` | Служебный коридор | 1000×270 |
| `severnaya` | Станция «Северная» | 1200×270 |
| `tunnel_sl` | Перегон Северная–Липовая | 1500×270 |
| `lipovaya` | Станция «Липовая» | 1100×270 |
| `tunnel_drip` | Перегон с каплей | 1300×270 |
| `side_passage` | Боковой проход со следами | 820×270 |
| `booth` | Будка обходчика | 600×270 |
| `niche_dict` | Служебная ниша (диктофон) | 760×270 |
| `cable_tunnel` | Тоннель с кабельными коробами | 1300×270 |
| `clock_platform` | Платформа без названия (часы) | 1000×270 |
| `hands_passage` | Переход с ладошками | 900×270 |
| `monastyrskaya` | Станция «Монастырская» | 1000×270 |
| `tunnel3` | Служебный тоннель №3 | 1400×270 |
| `mirror` | «Центральная», зеркальный коридор | 1300×270 |
| `admin_corridor` | Административный коридор | 1000×270 |
| `office` | Кабинет Громова | 640×270 |
| `krots` | Ниша «Кротов» | 640×270 |
| `depot` | Депо секты | 1600×270 |
| `flooded` | Затопленный перегон | 1300×270 |
| `laptev_store` | Склад Лаптева | 640×270 |
| `glow_tunnel` | Тоннель со светящимися ладошками | 700×270 |
| `tunnel_pokr` | Тоннель к «Покровской» | 1300×270 |
| `pokrovskaya` | Станция «Покровская» | 1300×270 |

Добавка к промту фона: `side view background plate, no people, no characters, even dim ambient lighting, floor line at 86% of image height, seamless wide panorama`.
