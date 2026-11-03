-- АКТ 1. «Прогулка» (00:00–10:00): ни одной странности, только разговоры
local K = require("src.scenes.common")
local reg = World.register

-------------------------------------------------------------- 1.1 Вентшахта Н-2
local SHAFT_X, LADDER_X = 256, 289
local LEHA_AT = { LADDER_X + 6, FLOOR - 56 }

local function descend()
  if Script.running("descend") then return end
  Script.run(function()
    World.go("descent")
  end, true, "descend")
end

reg("surface", {
  cold = true,
  w = 811, spawn = 150, surface = "gravel", noChalk = true,
  bg = { img = "surface", viewTop = 129.54 }, noDeco = true, puddles = false, vents = false,
  ambient = { 0.8, P.blue3 },
  amb = { wind = 0.45 },
  charsDraw = function(sc, drawDima, drawLeha)
    local l = World.leha
    if not G.flags.lehaDown then
      -- Лёха уже на нижней скобе лестницы
      Gx.leha(LADDER_X + 6, FLOOR - 6, { facing = -1, pose = "idle", frame = 0 })
    end
    drawDima()
  end,
  setup = function(sc)
    World.leha.manual = true
    World.leha.x = LADDER_X + 6
    World.leha.visible = false
  end,
  overlay = function(sc)
    local t = sc.t
    if t < 7 then
      local a = math.min(1, t / 1.5) * math.min(1, (7 - t) / 1.5)
      Gx.textOc("ПОД ФУНДАМЕНТОМ", W / 2, 70, P.white, a, Fonts.big)
      Gx.textOc("27 октября", W / 2, 96, P.gray3, a)
    end
  end,
  enterBlock = false,
  enter = function(sc)
    hint("ЛКМ: идти", 5)
    wait(5)
    hint("ЛКМ по предмету: осмотреть", 6)
  end,
  timers = {
    { id = "intro", t = 5, block = false, fn = function()
      talk({
        { L, "Ну что, командир, после тебя. Или после меня. Я уже решил: после меня.", { at = LEHA_AT } },
        { D, "Ты уже на скобе, Лёх." },
        { L, "Вот видишь, я всегда на шаг впереди.", { at = LEHA_AT } },
      })
    end },
  },
  keypressed = function(sc, k)
    if (k == "down" or k == "s") and math.abs(World.player.x - SHAFT_X) < 90 and not Script.blocking() then
      descend()
      return true
    end
  end,
  objects = {
    { id = "plate", name = "Табличка", x = 230, y = 184, w = 32, h = 20, ax = SHAFT_X - 50,
      lines = function()
        return {
          { D, "Шахта Н-два. Вход воспрещён. Шрифт пятидесятых." },
          { L, "Воспрещён. Это по-нашему «заходите».", { at = LEHA_AT } },
        }
      end,
      note = "Табличка «ШАХТА Н-2. ВХОД ВОСПРЕЩЁН». Шрифт пятидесятых." },
    { id = "grate", name = "Верхняя решётка", x = 203, y = 137, w = 106, h = 25, ax = SHAFT_X - 50,
      lines = function()
        return {
          { D, "Замка нет. Скобы целы. Для шахты, которую забыли, слишком целы." },
          { L, "Забыли, это когда хотят, чтобы не нашли. А мы нашли. Значит, не так уж и хотели.", { at = LEHA_AT } },
        }
      end },
    { id = "ladder", name = "Спуститься (S)", x = 279, y = 167, w = 21, h = 64, ax = LADDER_X - 14,
      use = function() descend() end },
  },
})

-------------------------------------------------------------- спуск по скобам (~12 секунд)
reg("descent", {
  custom = true, noHud = true, music = "act1",
  ambient = { 0.16, P.blue2 },
  amb = { hum = 0.15, wind = 0.1 },
  setup = function(sc) sc.v.rung = 0 sc.v.y = 0 end,
  update = function(sc, dt)
    sc.v.y = sc.v.y + dt * 26
    local r = math.floor(sc.v.y / 9)
    if r ~= sc.v.rung then
      sc.v.rung = r
      Audio.play("stepE_metal", 0.25, 0.9 + love.math.random() * 0.2)
    end
  end,
  speakerPos = function(sc, sp)
    if sp == "DIMA" then return 240, 70 end
    if sp == "LEHA" then return 240, 170 end
  end,
  drawCustom = function(sc)
    local y = sc.v.y
    Gx.r(P.dk1, 0, 0, W, H)
    Gx.concrete(160, 0, 160, H, P.gray1, P.dk2, 7)
    Gx.r(P.black, 140, 0, 20, H)
    Gx.r(P.black, 320, 0, 20, H)
    for i = -1, 32 do
      local ry = (i * 9 + y) % (H + 18) - 9
      Gx.r(P.gray2, 222, ry, 36, 2)
      Gx.r(P.dk2, 222, ry + 2, 36, 1)
    end
    for i = 0, 6 do
      local sy = (i * 60 + y * 0.9) % (H + 40) - 20
      Gx.stain(190 + Gx.hash(i, 1) * 100, sy, 10, 6, P.dk2, 0.6, i)
    end
    local fr = math.floor(y / 9) % 2
    Gx.dima(240, 132, { facing = 1, pose = "climb", frame = fr })
    Gx.leha(240, 238, { facing = 1, pose = "climb", frame = 1 - fr })
    Gx.textO("скоба " .. (sc.v.rung + 1), 330, 20, P.gray3)
  end,
  timers = {
    { id = "count", t = 3, fn = function()
      talk({
        { L, "Дима, ты считаешь скобы?" },
        { D, "Тридцать две. Тридцать три." },
        { L, "Ты чудовище." },
      })
    end },
    { id = "land", t = 12, fn = function()
      World.go("corridor", 60, 1)
    end },
  },
})

-------------------------------------------------------------- 1.2 Служебный коридор
reg("corridor", {
  w = 965, spawn = 69, surface = "concrete", echo = false,
  bg = { img = "corridor", viewTop = 127.67 }, noDeco = true, puddles = false, vents = false,
  ambient = { 0.32, P.blue2 },
  lights = function(sc)
    return {
      { 69, 137, 80, P.blue3, 0.5 },
      { 434, 152, 75, P.cream, 0.55 },
      { 857, 154, 75, P.cream, 0.55 },
    }
  end,
  amb = { hum = 0.3 },
  setup = function(sc) sc.v.walk = 0 end,
  update = function(sc, dt)
    if World.player.x > 260 and World.player.pose == "walk" then sc.v.walk = sc.v.walk + dt end
  end,
  enter = function(sc)
    if G.flags.landed then return end
    G.flags.landed = true
    G.flags.lehaDown = true
    talk({
      { L, "Ноги целы? Мои нет. Записывай: колени ушли в отставку." },
      { D, "Включай фонарь." },
    })
    G.flags.lightTut = true
    hint("F: фонарь. Курсор направляет луч", 6)
  end,
  timers = {
    { id = "talk", t = 0, block = false, cond = function(sc) return sc.v.walk >= 6 end, fn = function()
      talk({
        { L, "Слушай, а ты вообще что-нибудь про эту ветку читал? Ты же у нас библиотекарь." },
        { D, "Читал. Официально ветку закрыли из-за «неблагоприятных грунтовых условий». Так и написано. Её построили в пятьдесят пятом, а пассажиров не возили ни дня." },
        { L, "Ни дня? То есть построили, и всё?" },
        { D, "Построили и закрыли. Даже не открыв." },
        { L, "Грунтовые условия. Ага. А мы сейчас по колено в воде идём? Нет. Значит, враньё." },
        { D, "Или вода была, а потом ушла. Бывает." },
        { L, "Бывает. Но врут всё равно." },
      })
    end },
  },
  objects = {
    { id = "vent", name = "Вентиляционная решётка", x = 483, y = 157, w = 42, h = 30,
      lines = {
        { D, "Тяга идёт в решётку, а не из неё. Странно: шахта сверху, воздух должен идти вниз." },
        { L, "Мы всегда идём против течения. Это наш бренд." },
      } },
    { id = "tray", name = "Кабельный лоток", x = 283, y = 130, w = 157, h = 18,
      lines = {
        { D, "Лоток. Кабелей нет, срезаны до нас. Кто-то вынес медь." },
        { L, "Значит, мы не первые." },
        { D, "Мы никогда не первые, Лёх. Просто первые, кто об этом пишет." },
      } },
    { id = "sign", name = "Указатель «К СТАНЦИИ»", x = 618, y = 160, w = 105, h = 27,
      lines = {
        { D, "Стрелка указывает налево. Остальное стёрто." },
        { L, "Зато как уверенно указывает. Мне бы так." },
      } },
    { id = "exit", name = "К станции", x = 940, y = 140, w = 26, h = 92, ax = 955,
      exit = { to = "severnaya", x = 30, facing = 1 } },
  },
})

-------------------------------------------------------------- 1.3 Станция «Северная»
local function benchTalk()
  local used = G.flags.benchTopics or {}
  G.flags.benchTopics = used
  while true do
    local opts, map = {}, {}
    local topics = {
      { "t1", "«Помнишь прошлые вылазки?»" },
      { "t2", "«Что ты думаешь про это место?»" },
      { "t3", "«Ты ничего не боишься?»" },
    }
    for _, tp in ipairs(topics) do
      if not used[tp[1]] then opts[#opts + 1] = tp[2] map[#opts] = tp[1] end
    end
    opts[#opts + 1] = "Встать"
    local r = choose(opts, "Поговорить с Лёхой")
    local id = map[r]
    if not id then break end
    used[id] = true
    if id == "t1" then
      talk({
        { L, "Помнишь Каменку? Ты провалился по пояс и орал: «Я нашёл клад!»" },
        { D, "Не напоминай." },
        { L, "А это оказалась труба." },
        { D, "Это была очень странная труба." },
        { L, "Труба с характером. Я её сфотографировал." },
        { D, "Ты фотографируешь всё." },
        { L, "Потому что иначе никто нам не поверит." },
      })
    elseif id == "t2" then
      talk({
        { L, "Я думаю, клад, склад или бункер." },
        { D, "А я думаю: просто дыра в земле. Очень аккуратная дыра." },
        { L, "Поэтому мы и не поэты." },
        { D, "Мне только странно, что над веткой пустырь. Ни дома, ни гаража. Весь район застроен, а над метро пусто." },
        { L, "Земля, наверное, дорогая." },
        { D, "Или никто не хочет." },
        { L, "Мне дед рассказывал, что тут до метро вроде что-то было. Огороды, что ли. Не помню... Ладно, неважно. Ты чего задумался?" },
      })
    elseif id == "t3" then
      talk({
        { L, "Темноты нет. Стен." },
        { D, "Стен?" },
        { L, "Когда они ближе метра, у меня внутри всё сжимается. Я начинаю болтать без остановки." },
        { D, "Я заметил." },
        { L, "Ты думал, я такой от рождения?" },
        { D, "Я думал, это талант." },
        { L, "Это защитная реакция. Талант потом." },
      })
    end
    State.panic(-3)
  end
end

local BENCH_X = 285

reg("severnaya", {
  w = 758, spawn = 20, surface = "tile", echo = true,
  bg = { img = "severnaya", viewTop = 146.14 }, noDeco = true, puddles = false, vents = false,
  ambient = { 0.36, P.blue3 },
  lights = function(sc)
    return {
      { 173, 167, 70, P.orange2, 0.55 },
      { 339, 167, 70, P.orange2, 0.55 },
      { 606, 167, 70, P.orange2, 0.55 },
    }
  end,
  amb = { hum = 0.22 },
  enter = function(sc) end,
  zones = {
    { id = "wow", x1 = 40, x2 = 2000, fn = function()
      talk({
        { L, "Вау. Серьёзно. Вау." },
        { D, "Не гони. Сначала осмотримся." },
      })
    end },
  },
  objects = {
    { id = "mosaic", name = "Мозаика «СЕВЕРНАЯ»", x = 252, y = 175, w = 170, h = 21, ax = 326,
      lines = {
        { D, "Смальта. Не краска. На заброшку столько денег не тратят." },
        { L, "Значит, не думали, что это заброшка. Думали, что будут ездить." },
        { D, "А потом закрыли. Не открыв." },
        { L, "Вот и вся история всех на свете станций." },
      } },
    { id = "clock", name = "Станционные часы", x = 481, y = 160, w = 35, h = 36, ax = 498,
      lines = {
        { D, "Одиннадцать сорок. Стоят." },
        { L, "Классика. Все заброшки встали в одно время, когда хозяева ушли." },
        { D, "Не все. Просто сломанные часы, Лёх." },
      } },
    { id = "poster", name = "Плакат «СЛАВА СТРОИТЕЛЯМ МЕТРО!»", x = 539, y = 165, w = 77, h = 43, ax = 577,
      lines = {
        { D, "Ударники труда. Станцию сдали за одиннадцать месяцев. Я видел даты на табличках." },
        { L, "Хорошо били, значит." },
        { D, "Слишком быстро для такого объёма. Либо людей было втрое больше, либо ничего не переделывали." },
        { L, "В пятидесятых гнали по плану. Нужно к празднику, значит, к празднику. Что там под ногами, никому не интересно." },
      } },
    { id = "tile", name = "Плитка на колонне", x = 221, y = 176, w = 22, h = 44, ax = 232,
      lines = {
        { D, "Плитка толстая и тёплая на ощупь." },
        { L, "Это ты просто руки в карманах держал." },
      } },
    { id = "closet", name = "Подсобка с инструментом", x = 626, y = 178, w = 22, h = 47, ax = 637,
      lines = {
        { D, "Лопата, ящик под инструмент, пустой. Всё, что можно было унести, унесли." },
        { L, "Лопату оставили. Значит, лопатой никто не интересовался." },
      } },
    { id = "bench", name = "Скамейка: присесть", x = 285, y = 208, w = 66, h = 20, ax = 311,
      use = function(o, sc)
        restAt(sc, 311)
        if not G.flags.sevBench then
          G.flags.sevBench = true
          talk({
            { L, "Сядем? Пять минут. Дадим этому месту нас переварить." },
            { D, "Ты просто хочешь бутерброд." },
            { L, "Это не исключает первого." },
          })
        end
        benchTalk()
        standUp()
      end },
    { id = "back", name = "Назад, в коридор", x = 0, y = 181, w = 11, h = 44, ax = 6,
      exit = { to = "corridor", x = 930, facing = -1 } },
    { id = "exit", name = "В тоннель", x = 688, y = 166, w = 70, h = 69, ax = 718,
      exit = { to = "tunnel_sl", x = 30, facing = 1 } },
  },
})

-------------------------------------------------------------- 1.4 Перегон «Северная»–«Липовая»
reg("tunnel_sl", {
  w = 987, spawn = 20, surface = "gravel", echo = true,
  bg = { img = "tunnel_sl", viewTop = 130.43 }, noDeco = true, puddles = false, vents = false,
  ambient = { 0.28, P.blue2 },
  lights = function(sc)
    return {
      { 77, 166, 70, P.cream, 0.5 },
      { 350, 166, 70, P.cream, 0.5 },
      { 667, 163, 70, P.cream, 0.5 },
      { 958, 171, 70, P.cream, 0.5 },
    }
  end,
  amb = { hum = 0.25 },
  setup = function(sc)
    if not G.done["tunnel_sl:t:silence"] then Audio.amb("hum", 0.25) end
  end,
  update = function(sc, dt)
    if sc.t > 20 and sc.t < 31 and not G.done["tunnel_sl:t:listen"] then
      Audio.amb("hum", 0.05, 1)
      Audio.musicMult(0.15, 0.5)
    end
  end,
  timers = {
    { id = "rats", t = 10, block = false, fn = function()
      talk({
        { L, "Знаешь, что странно? Тут нет крыс." },
        { D, "Нет. И запаха нет." },
        { L, "Может, они ушли?" },
        { D, "Или им тут не нравится." },
      })
    end },
    { id = "silence", t = 20, block = false, fn = function()
      G.flags.silenceTest = true
      wait(4)
      sfx("drip", 0.3)
    end },
    { id = "listen", t = 31, block = false, fn = function()
      Audio.amb("hum", 0.25, 0.3)
      Audio.resumeMusic()
      talk({
        { L, "Слышишь?" },
        { D, "Что?" },
        { L, "Вот именно, ничего. Тишина такая, что я слышу, как капаю себе на нервы." },
      })
    end },
  },
  objects = {
    { id = "sign", name = "Указатель «ЛИПОВАЯ — 400 м»", x = 815, y = 170, w = 88, h = 23, ax = 858,
      lines = {
        { D, "Липовая. Название как у улицы в старом городе." },
        { L, "Красиво. Кто называет станцию в честь дерева, которого рядом нет?" },
        { D, "Может, было." },
      } },
    { id = "salt", name = "Белые пятна соли", x = 653, y = 188, w = 39, h = 29,
      lines = {
        { D, "Соль. Вода тут была. Давно." },
        { L, "Видишь, затопление. Значит, не враньё." },
        { D, "Затопление не мешает строить. Мешает что-то другое." },
      } },
    { id = "back", name = "Назад, на «Северную»", x = 0, y = 143, w = 14, h = 89, ax = 6,
      exit = { to = "severnaya", x = 715, facing = -1 } },
    { id = "exit", name = "К «Липовой»", x = 968, y = 143, w = 20, h = 89, ax = 980,
      exit = { to = "lipovaya", x = 30, facing = 1 } },
  },
})

-------------------------------------------------------------- 1.5 Станция «Липовая» (и возвращения в Актах 2 и 5)
-- координаты по фону assets/bg/lipovaya.png
local DOOR = { 116, 174, 28, 57 }      -- дверь бытовки
local NICHE_X, NICHE_C, TILE_X = 399, 423, 516

local function act5() return G.flags.act5lip end
local function thermosTrip() return G.flags.thermosTrip and not G.flags.thermosBack end

local function tileEvent(sc)
  if G.flags.tileTaken then return end
  G.flags.tileTaken = true
  local l = World.leha
  l.manual = true
  l.tx = TILE_X - 4
  waitUntil(function() return l.tx == nil end)
  l.facing = 1
  say(L, "О, смотри, отходит. Дай-ка.")
  local r = choose({ "Положи", "Забирай" })
  G.flags.tileChoice = r == 1 and "put" or "take"
  if r == 1 then
    talk({
      { D, "Лёх, положи." },
      { L, "Да ладно. Ей лет семьдесят. Сорок из них никто не смотрел." },
      { D, "Семьдесят." },
      { L, "Тем более." },
    })
  else
    talk({
      { D, "Забирай. Всё равно в музей не понесёшь." },
      { L, "В нашем музее ей самое место." },
      { D, "В нашем музее ничего нет." },
      { L, "Вот и повод начать." },
    })
  end
  l.pose = "inspect"
  sfx("crack", 0.9, 1, TILE_X)
  sc.v.reveal = 2
  wait(0.3)
  l.pose = "idle"
  sfx("thud", 0.35, 1.4, TILE_X)
  wait(1.8)
  say(L, "Сувенир. Скажем, будет подпорка для чайника.")
  lehaFollow()
  wait(4)
  -- 10:00: звук на секунду глуше, одна капля
  Audio.amb("hum", 0.04, 4)
  sfx("drip", 0.5, 1, TILE_X - 120)
  wait(1.2)
  Audio.amb("hum", 0.22, 1)
  say(L, "Пошли дальше. Тут пусто.")
  G.act = 2
  G.flags.act1done = true
end

reg("lipovaya", {
  w = 793, spawn = 20, surface = "tile", echo = true,
  bg = { img = "lipovaya", viewTop = 142.21 }, noDeco = true, puddles = false, vents = false,
  ambient = { 0.36, P.blue3 },
  amb = { hum = 0.22 },
  draw = function(sc)
    local t = sc.t
    -- открытая дверь бытовки: тёмный проём и створка
    local doorOpen = not G.flags.hutClosed or thermosTrip() or G.flags.thermosBack
    if doorOpen then
      Gx.r(P.black, DOOR[1], DOOR[2], DOOR[3], DOOR[4], 0.92)
      Gx.r(P.brown1, DOOR[1] + DOOR[3] - 1, DOOR[2], 4, DOOR[4])
      Gx.r(P.brown2, DOOR[1] + DOOR[3], DOOR[2] + 2, 2, DOOR[4] - 4)
      -- стол и термос в глубине
      Gx.r(P.brown2, DOOR[1] + 2, DOOR[2] + 34, DOOR[3] - 6, 2)
      if thermosTrip() and not G.flags.thermosTaken then
        Gx.r(P.green2, DOOR[1] + DOOR[3] - 10, DOOR[2] + 27, 4, 7)
        Gx.px(P.gray2, DOOR[1] + DOOR[3] - 11, DOOR[2] + 29)
      end
    end
    -- лошадка под занавеской
    if not G.inv.horse and not G.flags.rest_alesha then Gx.horse(NICHE_C - 6, FLOOR - 4) end
    if G.flags.handprint and not act5() then
      Gx.r(P.gray3, NICHE_C - 2, FLOOR - 10, 3, 2, 0.7)
      Gx.px(P.gray3, NICHE_C - 2, FLOOR - 11, 0.7) Gx.px(P.gray3, NICHE_C, FLOOR - 11, 0.7)
    end
    if G.flags.rest_alesha then Gx.candle(NICHE_C - 10, FLOOR - 3, t, true) end
    -- обломок у торца: камень с бороздами на 2 секунды
    if sc.v.reveal and sc.v.reveal > 0 then
      Gx.r(P.gray2, TILE_X - 9, FLOOR - 12, 18, 10)
      for i = 0, 4 do Gx.r(P.dk1, TILE_X - 8 + i * 3, FLOOR - 11, 1, 8) end
      sc.v.reveal = sc.v.reveal - love.timer.getDelta()
    end
  end,
  lights = function(sc)
    local t = {}
    t[#t + 1] = { 135, 164, 75, P.orange2, 0.55 }
    t[#t + 1] = { 342, 164, 75, P.orange2, 0.55 }
    t[#t + 1] = { 532, 164, 75, P.orange2, 0.55 }
    if G.flags.rest_alesha then t[#t + 1] = { NICHE_C - 10, FLOOR - 10, 70, P.orange2, 0.5 } end
    if act5() and sc.actors.ALESHA and sc.actors.ALESHA.visible then t[#t + 1] = { NICHE_C, FLOOR - 20, 50, P.blue3, 0.3 } end
    return t
  end,
  unrest = function(sc) if not G.flags.rest_alesha then return NICHE_C end end,
  setup = function(sc)
    if act5() then Audio.amb("hum", 0.15) end
  end,
  enter = function(sc)
    if act5() and not G.flags.lip5enter then
      G.flags.lip5enter = true
      talk({
        { L, "Мы снова здесь." },
        { D, "Да. Смотри, ниша." },
      })
      if G.inv.horse then
        say(D, "Лёх, я знаю, что нужно делать.")
      else
        say(D, "Лошадка здесь. Значит, надо её забрать.")
      end
      wait(4)
      sc.actors.ALESHA = { kind = "alesha", x = NICHE_C, y = FLOOR - 2, a = 0, spirit = true, glow = 0.3, glowCol = P.blue3, h = 40 }
      for i = 1, 20 do sc.actors.ALESHA.a = i / 20 wait(0.05) end
      sfx("whisper", 0.25, 1.6)
      talk({
        { AL, "Это моя. Отдай.", { slow = true } },
        { L, "Дим... это же ребёнок." },
        { D, "Нет. Уже нет." },
      })
      G.flags.aleshaSeen = true
      G.flags.grave_alesha = true
      State.objective("alesha", "Вернуть Алёше лошадку")
    elseif act5() and G.flags.aleshaSeen and not G.flags.rest_alesha then
      sc.actors.ALESHA = { kind = "alesha", x = NICHE_C, y = FLOOR - 2, a = 1, spirit = true, glow = 0.3, glowCol = P.blue3, h = 40 }
    end
  end,
  zones = {
    { id = "enter", x1 = 40, x2 = 2000, cond = function() return not act5() and not thermosTrip() end, fn = function()
      talk({
        { L, "Ого. Милая. Прямо хочется переехать." },
        { D, "Тебя приглашали на семейные ужины, а ты отказывался." },
        { L, "Это другое. Тут хотя бы никто не спрашивает, когда я женюсь." },
      })
    end },
    { id = "tile", x1 = 464, x2 = 2000, cond = function() return not G.flags.tileTaken and not act5() end, fn = tileEvent },
  },
  timers = {
    { id = "tile2", t = 95, cond = function() return not G.flags.tileTaken and not act5() end, fn = tileEvent },
  },
  objects = {
    { id = "graffiti", name = "Граффити «КРОТЫ. 2008»", x = 276, y = 177, w = 41, h = 31, ax = 297,
      cond = function() return not thermosTrip() end,
      lines = {
        { D, "Кроты. Две тысячи восьмой." },
        { L, "Я их знал. Хорошие ребята. Давно их не видел." },
        { D, "Давно, это сколько?" },
        { L, "Лет десять. У всех семьи, дела." },
      } },
    { id = "hut", name = "Бытовка", x = 54, y = 163, w = 60, h = 67, ax = 103,
      cond = function() return not thermosTrip() and not act5() end,
      lines = {
        { D, "Строительная бытовка. Чайник эмалированный, ведро, стол." },
        { L, "Не похоже на место, где хочется работать." },
      },
      after = function(o, sc, first)
        G.flags.hutSeen = true
        if not G.flags.hutClosed then
          wait(0.3)
          sfx("thud", 0.3, 1.6, DOOR[1])
          G.flags.hutClosed = true
          UI.toast("Дима прикрыл дверь бытовки", 2)
        end
      end },
    { id = "tabel", name = "Табель на столе", x = 67, y = 176, w = 26, h = 26, ax = 83,
      cond = function() return not thermosTrip() end,
      lines = {
        { D, "Табель бригады номер четыре. Октябрь пятьдесят четвёртого. Читаю: «Участок семь: работы не ведутся. Люди отказываются, говорят, что земля не пускает. Ждём распоряжения»." },
        { L, "Ленились ребята. Профсоюз." },
        { D, "Земля не пускает. Странная формулировка." },
        { L, "Это они грунт так ругали." },
      },
      after = function(o, sc, first) if first then readDoc("N-01") end end },
    { id = "board", name = "Доска объявлений", x = 172, y = 174, w = 42, h = 24, ax = 193,
      lines = {
        { D, "Выцвело всё. Читаю: «Строителям! Сдача ветки первого мая пятьдесят пятого. Выполним досрочно!»" },
        { L, "Выполнили. Только никто не поехал." },
      },
      after = function(o, sc, first) if first then State.doc("N-02") end end },
    { id = "niche", name = "Ниша с занавеской", x = 399, y = 163, w = 49, h = 65, ax = NICHE_C - 14,
      cond = function() return not act5() and not thermosTrip() end,
      use = function(o, sc)
        if G.flags.horseDecided then
          if G.inv.horse then
            World.player.pose = "inspect"
            wait(0.8)
            World.player.pose = "idle"
          else
            say(D, "Деревянная лошадка. Старая, колёса стёрты.")
            local r = choose({ "Взять", "Оставить" })
            if r == 1 then
              G.flags.horseTakenEver = true
              State.give("horse")
              talk({ { D, "Пусть будет у меня. Мало ли." }, { L, "Сентиментальный какой." } })
            end
          end
          return
        end
        World.examine({ id = "horse", name = "Деревянная лошадка", note = "Деревянная лошадка на колёсиках в нише на «Липовой». На боку детская зарубка.", lines = {
          { D, "Деревянная лошадка. Старая, колёса стёрты." },
          { L, "Кто-то из строителей сыну делал." },
          { D, "Строители детей в шахты не брали." },
          { L, "Строители много чего не делали." },
        } })
        G.flags.horseDecided = true
        local r = choose({ "Взять", "Оставить" })
        if r == 1 then
          G.flags.horseTakenEver = true
          State.give("horse")
          talk({ { D, "Пусть будет у меня. Мало ли." }, { L, "Сентиментальный какой." } })
        else
          say(D, "Оставим. Не наша.")
        end
      end },
    -- Акт 2: поход за термосом
    { id = "door2", name = "Дверь бытовки", x = 116, y = 174, w = 28, h = 30, ax = 106,
      cond = function() return thermosTrip() end,
      lines = {
        { D, "Дверь открыта." },
        { L, "Ветер." },
        { D, "Тут нет ветра." },
        { L, "Тут тяга. Ты сам говорил." },
      },
      after = function(o, sc, first) if first then strange(1) end end },
    { id = "thermos", name = "Термос", x = 120, y = 204, w = 25, h = 27, ax = 124,
      cond = function() return thermosTrip() and not G.flags.thermosTaken end,
      lines = {
        { D, "Ты его так оставил?" },
        { L, "Ну... может, и так." },
        { D, "Ручка смотрит на нас." },
        { L, "Гостеприимный термос." },
      },
      after = function(o, sc, first)
        G.flags.thermosTaken = true
        strange(1)
        State.objective("go", "Идти дальше по перегону")
      end },
    { id = "niche2", name = "Ниша", x = 399, y = 163, w = 49, h = 65, ax = NICHE_C - 14,
      cond = function() return thermosTrip() end, inspect = true,
      use = function(o, sc)
        sc.v.lookNiche = true
        World.player.pose = "inspect"
        wait(1.5)
        World.player.pose = "idle"
        if G.inv.horse then
          G.flags.handprint = true
          UI.toast("На пыли полки — маленький отпечаток ладошки", 4)
        else
          UI.toast("Занавеска чуть колышется. Лошадка на месте.", 4)
        end
        State.note("n:niche2", "В нише на «Липовой» колыхнулась занавеска.")
      end },
    -- Акт 5: Алёша
    { id = "niche5", name = "Ниша", x = 399, y = 163, w = 49, h = 65, ax = NICHE_C - 24,
      cond = function() return act5() end,
      use = function(o, sc)
        if not G.flags.bookE1 then
          G.flags.bookE1 = true
          World.examine({ id = "book", name = "Книга записей монастыря", lines = {
            { D, "Книга записей. Запись тысяча девятьсот тридцать первого: «Алексей Миронов, семь лет. Погребён на участке семь с игрушкой»." },
            { L, "Алёша." },
          } })
          readDoc("E-1")
          return
        end
        if G.flags.rest_alesha then
          say(D, "Свеча горит ровно.")
          return
        end
        if not G.inv.horse then
          G.flags.horseTakenEver = true
          World.player.pose = "inspect"
          wait(0.8)
          World.player.pose = "idle"
          State.give("horse")
        end
        Rituals.alesha(sc)
      end },
    { id = "back", name = "Назад, к «Северной»", x = 0, y = 158, w = 11, h = 74, ax = 6,
      cond = function() return not act5() and not thermosTrip() end,
      exit = { to = "tunnel_sl", x = 964, facing = -1 } },
    { id = "exit", name = "В перегон", x = 720, y = 158, w = 73, h = 74, ax = 746,
      cond = function() return G.flags.act1done and not act5() end,
      exit = function()
        if thermosTrip() then
          return { to = "tunnel_drip", x = 820, facing = 1, pre = function() G.flags.thermosBack = true end }
        end
        return { to = "tunnel_drip", x = 30, facing = 1 }
      end },
    { id = "exit5", name = "Переход к «Покровской»", x = 720, y = 158, w = 73, h = 74, ax = 746,
      cond = function() return act5() and G.flags.aleshaSeen end,
      exit = { to = "tunnel_pokr", x = 30, facing = 1 } },
  },
})
