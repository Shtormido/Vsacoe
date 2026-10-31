# Промты для фонов локаций — готовые к вставке

Каждый блок — готовый промт: копируете целиком, вставляете в нейросеть. Негативный промт один для всех, он ниже. В Midjourney допишите в конец `--no` и негатив через запятую.

**Правила для всех фонов**
- Генерируйте в 4 раза больше игрового размера (указан у каждой сцены) или ближайшее, что позволяет сервис. Если сервис не даёт такой ширины, делайте 2–3 куска одной сцены, указав в промте `left part` / `middle part` / `right part`.
- На фоне не должно быть людей и духов: их добавляет игра.
- Пол, по которому ходят герои, — на 86 % высоты кадра.
- Лучший результат даёт референс: прикладывайте свою картинку со станцией (`--sref` в Midjourney, IP-Adapter в Stable Diffusion), чтобы все фоны были в одном стиле.

**Негативный промт (для всех):**
```
people, characters, figures, ghosts, blood, gore, anime, 3D render, photorealistic, blur, smooth gradients, text, watermark, logo, frame, isometric, top-down, perspective vanishing point, fisheye, neon, bright colors
```

## 1. Поверхность, вентшахта Н-2 — `surface`, 560×270 (генерировать 2240×1080)
```
night wasteland on the edge of a city, waist-high dry weeds and burdock, rusty round ventilation shaft 'mushroom' with a hatch on top and ladder rungs on its side, rusty sign plate on the shaft, distant city skyline with three tiny yellow lights, moon with halo, low clouds, cold wind. 2D side-view pixel art background plate, horror point-and-click adventure, 16-bit era, crisp hard pixels, no anti-aliasing, limited 32-color palette, cold blue-gray and dark green tones, deep shadows, Bayer dithering, abandoned 1950s Soviet metro built over an old monastery cemetery, damp, cinematic, flat orthographic side view, no people, no characters, even dim ambient lighting, floor line at 86% of image height, seamless wide panorama --ar 21:10 --style raw --stylize 50
```

## 2. Служебный коридор — `corridor`, 1000×270 (генерировать 4000×1080)
```
left part: low concrete pocket at the bottom of a vertical shaft with ladder rungs and puddles, rusty steel door half open; right part: long service corridor, gray peeling plaster, damp stains, empty cable trays along the wall, wire-caged lamps all dead, ventilation grille in the wall, rusty sign with arrow 'К СТАНЦИИ'. 2D side-view pixel art background plate, horror point-and-click adventure, 16-bit era, crisp hard pixels, no anti-aliasing, limited 32-color palette, cold blue-gray and dark green tones, deep shadows, Bayer dithering, abandoned 1950s Soviet metro built over an old monastery cemetery, damp, cinematic, flat orthographic side view, no people, no characters, even dim ambient lighting, floor line at 86% of image height, seamless wide panorama --ar 37:10 --style raw --stylize 50
```

## 3. Станция «Северная» — `severnaya`, 1200×270 (генерировать 4800×1080)
```
1950s Soviet metro island platform seen from the side, back wall across the tracks with cream ceramic tiles and a dark green band, large smalt mosaic sign 'СЕВЕРНАЯ' above the tracks, dark track pit with rusty rails, cream tiled columns with dark green skirting, broken bell-shaped ceiling lamps, station clock stopped at 11:40, propaganda poster 'СЛАВА СТРОИТЕЛЯМ МЕТРО!', wooden bench, tool closet door, dark tunnel portal at the right end. 2D side-view pixel art background plate, horror point-and-click adventure, 16-bit era, crisp hard pixels, no anti-aliasing, limited 32-color palette, cold blue-gray and dark green tones, deep shadows, Bayer dithering, abandoned 1950s Soviet metro built over an old monastery cemetery, damp, cinematic, flat orthographic side view, no people, no characters, even dim ambient lighting, floor line at 86% of image height, seamless wide panorama --ar 44:10 --style raw --stylize 50
```

## 4. Перегон «Северная»–«Липовая» — `tunnel_sl`, 1500×270 (генерировать 6000×1080)
```
long round metro tunnel, cast-iron tubing rings, cable trays on both sides, rusty rails on gravel, white salt stains on the walls, broken caged lamps, blue distance sign 'ЛИПОВАЯ — 400 м' near the right end. 2D side-view pixel art background plate, horror point-and-click adventure, 16-bit era, crisp hard pixels, no anti-aliasing, limited 32-color palette, cold blue-gray and dark green tones, deep shadows, Bayer dithering, abandoned 1950s Soviet metro built over an old monastery cemetery, damp, cinematic, flat orthographic side view, no people, no characters, even dim ambient lighting, floor line at 86% of image height, seamless wide panorama --ar 56:10 --style raw --stylize 50
```

## 5. Станция «Липовая» — `lipovaya`, 1100×270 (генерировать 4400×1080)
```
small side platform with one track, light gray tiles, yellow water stains on the ceiling, wooden plank builders' hut with a small window and door, faded notice board above the hut, red spray graffiti 'КРОТЫ. 2008', small wall niche with a dusty curtain, a loose tile at the far end of the platform, dark tunnel portal on the right. 2D side-view pixel art background plate, horror point-and-click adventure, 16-bit era, crisp hard pixels, no anti-aliasing, limited 32-color palette, cold blue-gray and dark green tones, deep shadows, Bayer dithering, abandoned 1950s Soviet metro built over an old monastery cemetery, damp, cinematic, flat orthographic side view, no people, no characters, even dim ambient lighting, floor line at 86% of image height, seamless wide panorama --ar 41:10 --style raw --stylize 50
```

## 6. Перегон с каплей — `tunnel_drip`, 1300×270 (генерировать 5200×1080)
```
brick-lined metro tunnel, wet dark stone, rusty rails, many small puddles on the floor, dry ceiling, dark passage opening on the right end. 2D side-view pixel art background plate, horror point-and-click adventure, 16-bit era, crisp hard pixels, no anti-aliasing, limited 32-color palette, cold blue-gray and dark green tones, deep shadows, Bayer dithering, abandoned 1950s Soviet metro built over an old monastery cemetery, damp, cinematic, flat orthographic side view, no people, no characters, even dim ambient lighting, floor line at 86% of image height, seamless wide panorama --ar 48:10 --style raw --stylize 50
```

## 7. Боковой проход со следами — `side_passage`, 820×270 (генерировать 3280×1080)
```
narrow side passage between tunnels, thick gray dust on the floor, plastered walls, a doorway in the back wall, the passage ends in a bricked-up wall made of old bricks with fresh mortar. 2D side-view pixel art background plate, horror point-and-click adventure, 16-bit era, crisp hard pixels, no anti-aliasing, limited 32-color palette, cold blue-gray and dark green tones, deep shadows, Bayer dithering, abandoned 1950s Soviet metro built over an old monastery cemetery, damp, cinematic, flat orthographic side view, no people, no characters, even dim ambient lighting, floor line at 86% of image height, seamless wide panorama --ar 30:10 --style raw --stylize 50
```

## 8. Будка обходчика — `booth`, 600×270 (генерировать 2400×1080)
```
small lineman's booth inside a service corridor, wooden table, kerosene 'bat' lamp, faded track scheme nailed to the wall with pencil notes, narrow wooden door. 2D side-view pixel art background plate, horror point-and-click adventure, 16-bit era, crisp hard pixels, no anti-aliasing, limited 32-color palette, cold blue-gray and dark green tones, deep shadows, Bayer dithering, abandoned 1950s Soviet metro built over an old monastery cemetery, damp, cinematic, flat orthographic side view, no people, no characters, even dim ambient lighting, floor line at 86% of image height, seamless wide panorama --ar 22:10 --style raw --stylize 50
```

## 9. Служебная ниша — `niche_dict`, 760×270 (генерировать 3040×1080)
```
wide service niche, electrical switchboards with knife switches on the wall, a bench welded from steel pipes, concrete floor. 2D side-view pixel art background plate, horror point-and-click adventure, 16-bit era, crisp hard pixels, no anti-aliasing, limited 32-color palette, cold blue-gray and dark green tones, deep shadows, Bayer dithering, abandoned 1950s Soviet metro built over an old monastery cemetery, damp, cinematic, flat orthographic side view, no people, no characters, even dim ambient lighting, floor line at 86% of image height, seamless wide panorama --ar 28:10 --style raw --stylize 50
```

## 10. Тоннель с кабельными коробами — `cable_tunnel`, 1300×270 (генерировать 5200×1080)
```
quiet metro tunnel with large metal cable boxes running along the wall, rails, dark arches. 2D side-view pixel art background plate, horror point-and-click adventure, 16-bit era, crisp hard pixels, no anti-aliasing, limited 32-color palette, cold blue-gray and dark green tones, deep shadows, Bayer dithering, abandoned 1950s Soviet metro built over an old monastery cemetery, damp, cinematic, flat orthographic side view, no people, no characters, even dim ambient lighting, floor line at 86% of image height, seamless wide panorama --ar 48:10 --style raw --stylize 50
```

## 11. Платформа без названия — `clock_platform`, 1000×270 (генерировать 4000×1080)
```
wide nameless metro platform, gray tiled columns, station clock over the tracks stopped at 3:17, dim emergency lamp on the wall. 2D side-view pixel art background plate, horror point-and-click adventure, 16-bit era, crisp hard pixels, no anti-aliasing, limited 32-color palette, cold blue-gray and dark green tones, deep shadows, Bayer dithering, abandoned 1950s Soviet metro built over an old monastery cemetery, damp, cinematic, flat orthographic side view, no people, no characters, even dim ambient lighting, floor line at 86% of image height, seamless wide panorama --ar 37:10 --style raw --stylize 50
```

## 12. Переход с ладошками — `hands_passage`, 900×270 (генерировать 3600×1080)
```
narrow low underground passage, low concrete ceiling, wet walls with a chain of small dark wet child handprints at one meter height, drops on the floor, flickering blue station sign 'МОНАСТЫРСКАЯ' at the right end. 2D side-view pixel art background plate, horror point-and-click adventure, 16-bit era, crisp hard pixels, no anti-aliasing, limited 32-color palette, cold blue-gray and dark green tones, deep shadows, Bayer dithering, abandoned 1950s Soviet metro built over an old monastery cemetery, damp, cinematic, flat orthographic side view, no people, no characters, even dim ambient lighting, floor line at 86% of image height, seamless wide panorama --ar 33:10 --style raw --stylize 50
```

## 13. Станция «Монастырская» — `monastyrskaya`, 1000×270 (генерировать 4000×1080)
```
low vaulted metro station, gray-green tiles with relief crosses that look like ornament, remains of a faded ceiling fresco, row of columns, dark service door across the tracks, a coffin-sized niche in peeling plaster with exposed old bricks. 2D side-view pixel art background plate, horror point-and-click adventure, 16-bit era, crisp hard pixels, no anti-aliasing, limited 32-color palette, cold blue-gray and dark green tones, deep shadows, Bayer dithering, abandoned 1950s Soviet metro built over an old monastery cemetery, damp, cinematic, flat orthographic side view, no people, no characters, even dim ambient lighting, floor line at 86% of image height, seamless wide panorama --ar 37:10 --style raw --stylize 50
```

## 14. Служебный тоннель №3 — `tunnel3`, 1400×270 (генерировать 5600×1080)
```
extremely narrow claustrophobic service tunnel, walls almost touching, very low ceiling, wet concrete with water streaks, a small metal plate with a tunnel scheme on the wall, almost total darkness. 2D side-view pixel art background plate, horror point-and-click adventure, 16-bit era, crisp hard pixels, no anti-aliasing, limited 32-color palette, cold blue-gray and dark green tones, deep shadows, Bayer dithering, abandoned 1950s Soviet metro built over an old monastery cemetery, damp, cinematic, flat orthographic side view, no people, no characters, even dim ambient lighting, floor line at 86% of image height, seamless wide panorama --ar 52:10 --style raw --stylize 50
```

## 15. «Центральная», зеркальный коридор — `mirror`, 1300×270 (генерировать 5200×1080)
```
station corridor clad in black polished granite, glossy reflective floor and walls, empty lamp fixtures along the ceiling, dark side arches, one pitch-black side branch, a dark side niche, service entrance door at the right end. 2D side-view pixel art background plate, horror point-and-click adventure, 16-bit era, crisp hard pixels, no anti-aliasing, limited 32-color palette, cold blue-gray and dark green tones, deep shadows, Bayer dithering, abandoned 1950s Soviet metro built over an old monastery cemetery, damp, cinematic, flat orthographic side view, no people, no characters, even dim ambient lighting, floor line at 86% of image height, seamless wide panorama --ar 48:10 --style raw --stylize 50
```

## 16. Административный коридор — `admin_corridor`, 1000×270 (генерировать 4000×1080)
```
long administrative corridor, wooden office doors with small plaques, peeling green paint, cobwebs, ceiling lamps, last door on the right with a plaque 'НАЧАЛЬНИК СТРОИТЕЛЬСТВА Н. В. ГРОМОВ'. 2D side-view pixel art background plate, horror point-and-click adventure, 16-bit era, crisp hard pixels, no anti-aliasing, limited 32-color palette, cold blue-gray and dark green tones, deep shadows, Bayer dithering, abandoned 1950s Soviet metro built over an old monastery cemetery, damp, cinematic, flat orthographic side view, no people, no characters, even dim ambient lighting, floor line at 86% of image height, seamless wide panorama --ar 37:10 --style raw --stylize 50
```

## 17. Кабинет Громова — `office`, 640×270 (генерировать 2560×1080)
```
1950s Soviet construction chief's office, big oak desk with green banker lamp, ink set and black ebonite telephone, steel safe in the corner, wooden cabinet with folders, pale rectangle on the wall where a portrait was removed, wood paneling. 2D side-view pixel art background plate, horror point-and-click adventure, 16-bit era, crisp hard pixels, no anti-aliasing, limited 32-color palette, cold blue-gray and dark green tones, deep shadows, Bayer dithering, abandoned 1950s Soviet metro built over an old monastery cemetery, damp, cinematic, flat orthographic side view, no people, no characters, even dim ambient lighting, floor line at 86% of image height, seamless wide panorama --ar 24:10 --style raw --stylize 50
```

## 18. Ниша «Кротов» — `krots`, 640×270 (генерировать 2560×1080)
```
dark dusty side niche of a metro station, rough concrete walls, a breach in a brick wall at the right side, empty floor (bodies will be added by the game). 2D side-view pixel art background plate, horror point-and-click adventure, 16-bit era, crisp hard pixels, no anti-aliasing, limited 32-color palette, cold blue-gray and dark green tones, deep shadows, Bayer dithering, abandoned 1950s Soviet metro built over an old monastery cemetery, damp, cinematic, flat orthographic side view, no people, no characters, even dim ambient lighting, floor line at 86% of image height, seamless wide panorama --ar 24:10 --style raw --stylize 50
```

## 19. Депо секты — `depot`, 1600×270 (генерировать 6400×1080)
```
huge dark metro depot, rows of rusted skeletal metro cars, chalk circles and occult symbols drawn on the floor, crude chalk drawing of a robed man with spread arms on the wall, an altar built from crates and doors covered in melted wax, notes nailed to the wall, exit on the right marked with a chalk arrow. 2D side-view pixel art background plate, horror point-and-click adventure, 16-bit era, crisp hard pixels, no anti-aliasing, limited 32-color palette, cold blue-gray and dark green tones, deep shadows, Bayer dithering, abandoned 1950s Soviet metro built over an old monastery cemetery, damp, cinematic, flat orthographic side view, no people, no characters, even dim ambient lighting, floor line at 86% of image height, seamless wide panorama --ar 59:10 --style raw --stylize 50
```

## 20. Затопленный перегон — `flooded`, 1300×270 (генерировать 5200×1080)
```
metro tunnel flooded knee-deep with black still water, brick walls, ripples, dripping ceiling, dead end of bricks on the right with a chalk drawing of a construction helmet. 2D side-view pixel art background plate, horror point-and-click adventure, 16-bit era, crisp hard pixels, no anti-aliasing, limited 32-color palette, cold blue-gray and dark green tones, deep shadows, Bayer dithering, abandoned 1950s Soviet metro built over an old monastery cemetery, damp, cinematic, flat orthographic side view, no people, no characters, even dim ambient lighting, floor line at 86% of image height, seamless wide panorama --ar 48:10 --style raw --stylize 50
```

## 21. Склад Лаптева — `laptev_store`, 640×270 (генерировать 2560×1080)
```
small foreman's storeroom with water on the floor, wooden table with a lamp and a framed photo, toolbox, chalk drawing of a helmet on the wall, wet brick wall on the right side with water seeping through. 2D side-view pixel art background plate, horror point-and-click adventure, 16-bit era, crisp hard pixels, no anti-aliasing, limited 32-color palette, cold blue-gray and dark green tones, deep shadows, Bayer dithering, abandoned 1950s Soviet metro built over an old monastery cemetery, damp, cinematic, flat orthographic side view, no people, no characters, even dim ambient lighting, floor line at 86% of image height, seamless wide panorama --ar 24:10 --style raw --stylize 50
```

## 22. Тоннель со светящимися ладошками — `glow_tunnel`, 700×270 (генерировать 2800×1080)
```
short dark tunnel, concrete walls with small child handprints that faintly glow cold blue, wet barefoot footprints on the floor. 2D side-view pixel art background plate, horror point-and-click adventure, 16-bit era, crisp hard pixels, no anti-aliasing, limited 32-color palette, cold blue-gray and dark green tones, deep shadows, Bayer dithering, abandoned 1950s Soviet metro built over an old monastery cemetery, damp, cinematic, flat orthographic side view, no people, no characters, even dim ambient lighting, floor line at 86% of image height, seamless wide panorama --ar 26:10 --style raw --stylize 50
```

## 23. Тоннель к «Покровской» — `tunnel_pokr`, 1300×270 (генерировать 5200×1080)
```
long dark metro tunnel, tubing rings, rails, faint fog on the floor, deep shadows, oppressive atmosphere. 2D side-view pixel art background plate, horror point-and-click adventure, 16-bit era, crisp hard pixels, no anti-aliasing, limited 32-color palette, cold blue-gray and dark green tones, deep shadows, Bayer dithering, abandoned 1950s Soviet metro built over an old monastery cemetery, damp, cinematic, flat orthographic side view, no people, no characters, even dim ambient lighting, floor line at 86% of image height, seamless wide panorama --ar 48:10 --style raw --stylize 50
```

## 24. Станция «Покровская» — `pokrovskaya`, 1300×270 (генерировать 5200×1080)
```
grand high-vaulted old metro station, arched columns, ceiling fresco with erased faces of saints, cracked concrete slab dated 1954 in the center surrounded by rusty iron bars, brick crosses on the walls, old escalator on the left, vertical shaft with ladder behind a grate on the right, fog near the floor. 2D side-view pixel art background plate, horror point-and-click adventure, 16-bit era, crisp hard pixels, no anti-aliasing, limited 32-color palette, cold blue-gray and dark green tones, deep shadows, Bayer dithering, abandoned 1950s Soviet metro built over an old monastery cemetery, damp, cinematic, flat orthographic side view, no people, no characters, even dim ambient lighting, floor line at 86% of image height, seamless wide panorama --ar 48:10 --style raw --stylize 50
```

---

Готовые картинки назовите по ID сцены (`severnaya.png`, `depot.png` …) и пришлите. Я встрою их в игру и подгоню двери, таблички и ниши под новые фоны.
