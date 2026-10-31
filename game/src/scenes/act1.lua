-- АКТ 1. «Прогулка» (00:00–10:00): ни одной странности, только разговоры
local K = require("src.scenes.common")
local reg = World.register

-------------------------------------------------------------- 1.1 Вентшахта Н-2
local SHAFT_X = 380

local function descend()
  if Script.running("descend") then return end
  Script.run(function()
    World.go("descent")
  end, true, "descend")
end

reg("surface", {
  w = 560, spawn = 200, surface = "gravel", noChalk = true,
  ambient = { 0.34, P.blue2 },
  amb = { wind = 0.45 },
  static = function(sc)
    K.vgrad(0, 0, sc.w, 175, P.night, P.blue1)
    for i = 1, 40 do Gx.px(P.gray3, Gx.hash(i, 1) * sc.w, Gx.hash(i, 2) * 120, 0.5 + Gx.hash(i, 3) * 0.5) end
    love.graphics.setColor(P.cream)
    love.graphics.circle("fill", 470, 40, 10)
    love.graphics.setColor(P.blue1)
    love.graphics.circle("fill", 475, 37, 9)
    Gx.r(P.dk1, 0, 168, sc.w, 12)
    -- огни города: 3 пикселя жёлтого
    Gx.px(P.yellow, 60, 166) Gx.px(P.yellow, 66, 167) Gx.px(P.yellow, 150, 166)
    K.floor(0, 180, sc.w, P.dk1, P.green1)
    for i = 0, 70 do
      local x = Gx.hash(i, 9) * sc.w
      Gx.line(P.green1, x, 236, x + 2, 205 + Gx.hash(i, 8) * 15)
    end
    -- вентиляционный «гриб»
    local x = SHAFT_X - 22
    Gx.r(P.rust, x, 184, 44, 48)
    Gx.r(P.brown1, x, 184, 6, 48)
    Gx.r(P.brown2, x + 36, 184, 8, 48)
    for y = 190, 230, 8 do Gx.r(P.brown1, x, y, 44, 1, 0.6) end
    Gx.r(P.gray1, x - 6, 176, 56, 8)
    Gx.r(P.dk2, x - 6, 182, 56, 2)
    Gx.r(P.dk1, x + 4, 172, 36, 4)
    for gx = x + 6, x + 38, 4 do Gx.r(P.gray2, gx, 172, 1, 4) end
    -- табличка
    Gx.r(P.cream2, SHAFT_X - 12, 196, 24, 11)
    Gx.r(P.dk1, SHAFT_X - 10, 199, 20, 1)
    Gx.r(P.dk1, SHAFT_X - 10, 202, 14, 1)
    -- скобы
    for y = 186, 230, 6 do Gx.r(P.gray2, SHAFT_X + 24, y, 6, 1) end
  end,
  front = function(sc)
    love.graphics.push()
    love.graphics.translate(-World.camx * 0.3, 0)
    for i = 0, 50 do
      local x = Gx.hash(i, 21) * (sc.w + 200) - 50
      local sway = math.sin(sc.t * 1.4 + i) * 2
      Gx.line(P.black, x, 270, x + sway, 238 + Gx.hash(i, 22) * 12)
      Gx.line(P.black, x + 1, 270, x + 1 + sway, 241 + Gx.hash(i, 22) * 12)
    end
    love.graphics.pop()
  end,
  charsDraw = function(sc, drawDima, drawLeha)
    local l = World.leha
    if not G.flags.lehaDown then
      Gx.leha(SHAFT_X + 27, FLOOR - 16, { facing = -1, pose = "climb", frame = 0 })
    end
    drawDima()
  end,
  setup = function(sc)
    World.leha.manual = true
    World.leha.x = SHAFT_X + 27
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
        { L, "Ну что, командир, после тебя. Или после меня. Я уже решил: после меня.", { at = { SHAFT_X + 27, FLOOR - 64 } } },
        { D, "Ты уже на скобе, Лёх." },
        { L, "Вот видишь, я всегда на шаг впереди.", { at = { SHAFT_X + 27, FLOOR - 64 } } },
      })
    end },
  },
  keypressed = function(sc, k)
    if (k == "down" or k == "s") and math.abs(World.player.x - SHAFT_X) < 70 and not Script.blocking() then
      descend()
      return true
    end
  end,
  objects = {
    { id = "plate", name = "Табличка", x = SHAFT_X - 14, y = 194, w = 28, h = 14, ax = SHAFT_X - 30,
      lines = function()
        return {
          { D, "Шахта Н-два. Вход воспрещён. Шрифт пятидесятых." },
          { L, "Воспрещён. Это по-нашему «заходите».", { at = { SHAFT_X + 27, FLOOR - 64 } } },
        }
      end,
      note = "Табличка «ШАХТА Н-2. ВХОД ВОСПРЕЩЁН». Шрифт пятидесятых." },
    { id = "grate", name = "Верхняя решётка", x = SHAFT_X - 26, y = 168, w = 52, h = 12, ax = SHAFT_X - 30,
      lines = function()
        return {
          { D, "Замка нет. Скобы целы. Для шахты, которую забыли, слишком целы." },
          { L, "Забыли, это когда хотят, чтобы не нашли. А мы нашли. Значит, не так уж и хотели.", { at = { SHAFT_X + 27, FLOOR - 64 } } },
        }
      end },
    { id = "ladder", name = "Спуститься (S)", x = SHAFT_X + 20, y = 182, w = 16, h = 50, ax = SHAFT_X + 10,
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
  w = 1000, spawn = 60, surface = "concrete", echo = false,
  ambient = { 0.05, P.blue2 },
  amb = { hum = 0.3 },
  static = function(sc)
    K.corridor(sc, {})
    -- бетонный карман у шахты
    Gx.r(P.dk1, 0, 0, 200, 206)
    Gx.concrete(10, 20, 180, 186, P.dk2, P.gray1, 11)
    for y = 0, 200, 8 do Gx.r(P.gray2, 50, y, 18, 1) end
    Gx.r(P.dk1, 48, 0, 2, 206)
    Gx.r(P.dk1, 68, 0, 2, 206)
    -- ржавая дверь с распахнутой створкой
    Gx.door(176, 148, 26, 58, P.rust, true)
    Gx.r(P.rust, 202, 150, 4, 56)
    Gx.r(P.water, 90, 214, 30, 3)
    Gx.r(P.water, 130, 222, 40, 3)
    Gx.r(P.water, 30, 228, 24, 2)
    -- лотки и лампы
    Gx.cableTray(210, 60, sc.w - 210)
    Gx.cableTray(210, 74, sc.w - 210)
    for x = 260, sc.w, 80 do Gx.cagedLamp(x, 38, false) end
    -- решётка вентиляции
    Gx.r(P.dk1, 412, 96, 30, 22)
    for gy = 98, 116, 3 do Gx.r(P.gray2, 413, gy, 28, 1) end
    -- указатель «К СТАНЦИИ»
    Gx.r(P.rust, 806, 100, 52, 14)
    Gx.text("К СТАНЦИИ", 809, 101, P.cream2)
    UI.arrow(816, 120, -1, P.cream2)
    Gx.r(P.gray1, 950, 90, 50, 116)
    Gx.r(P.black, 966, 140, 34, 66)
  end,
  draw = function(sc)
    -- паутина на решётке колышется внутрь
    local s = math.sin(sc.t * 2) * 1.5
    Gx.line(P.gray4, 416, 100, 426 + s, 108, 0.5)
    Gx.line(P.gray4, 438, 100, 428 + s, 108, 0.5)
  end,
  setup = function(sc) sc.v.walk = 0 end,
  update = function(sc, dt)
    if World.player.x > 210 and World.player.pose == "walk" then sc.v.walk = sc.v.walk + dt end
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
    { id = "vent", name = "Вентиляционная решётка", x = 410, y = 94, w = 34, h = 26,
      lines = {
        { D, "Тяга идёт в решётку, а не из неё. Странно: шахта сверху, воздух должен идти вниз." },
        { L, "Мы всегда идём против течения. Это наш бренд." },
      } },
    { id = "tray", name = "Кабельный лоток", x = 580, y = 56, w = 60, h = 22,
      lines = {
        { D, "Лоток. Кабелей нет, срезаны до нас. Кто-то вынес медь." },
        { L, "Значит, мы не первые." },
        { D, "Мы никогда не первые, Лёх. Просто первые, кто об этом пишет." },
      } },
    { id = "sign", name = "Указатель «К СТАНЦИИ»", x = 804, y = 98, w = 56, h = 28,
      lines = {
        { D, "Стрелка указывает налево. Остальное стёрто." },
        { L, "Зато как уверенно указывает. Мне бы так." },
      } },
    { id = "exit", name = "К станции", x = 962, y = 140, w = 38, h = 66, ax = 980,
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

local BENCH_X = 860

reg("severnaya", {
  w = 1200, spawn = 30, surface = "tile", echo = true,
  ambient = { 0.05, P.blue2 },
  amb = { hum = 0.22 },
  static = function(sc)
    K.station(sc, { wall = P.cream, grout = P.cream2, band = P.green1 })
    -- мозаика «СЕВЕРНАЯ» из смальты
    Gx.r(P.green2, 296, 46, 170, 30)
    for i = 0, 300 do
      Gx.px(Gx.hash(i, 1) > 0.5 and P.green3 or P.green1, 296 + Gx.hash(i, 2) * 170, 46 + Gx.hash(i, 3) * 30, 0.7)
    end
    Gx.textOc("СЕВЕРНАЯ", 381, 49, P.cream, 1, Fonts.big)
    -- колонны и плафоны
    for x = 140, sc.w - 60, 160 do
      K.column(x, 30, 232, P.cream, P.cream2, P.green1)
    end
    for x = 60, sc.w, 80 do K.bellLamp(x, 12, Gx.hash(x, 1) > 0.5) end
    -- часы над колонной: 11:40
    Gx.r(P.dk1, 607, 54, 2, 10)
    Gx.clock(608, 72, 11, 40, 8)
    -- плакат
    Gx.r(P.cream2, 50, 100, 46, 64)
    Gx.r(P.red1, 52, 102, 42, 12)
    Gx.text("СЛАВА", 57, 103, P.cream)
    Gx.r(P.brown2, 58, 120, 10, 26)
    Gx.r(P.skin, 59, 114, 8, 7)
    Gx.r(P.orange1, 76, 122, 10, 24)
    Gx.r(P.skin, 77, 116, 8, 7)
    Gx.text("СТРОИТЕЛЯМ", 50, 148, P.dk1)
    Gx.text("МЕТРО!", 58, 156, P.dk1)
    -- подсобка с инструментом
    Gx.door(1070, 174, 30, 58, P.green2, true)
    Gx.r(P.brown1, 1104, 214, 20, 18)
    Gx.r(P.gray2, 1130, 186, 2, 46)
    Gx.r(P.gray2, 1127, 228, 8, 4)
    Gx.bench(BENCH_X, 232)
    -- портал тоннеля
    Gx.r(P.black, 1160, 140, 40, 92)
  end,
  enter = function(sc) end,
  zones = {
    { id = "wow", x1 = 70, x2 = 2000, fn = function()
      talk({
        { L, "Вау. Серьёзно. Вау." },
        { D, "Не гони. Сначала осмотримся." },
      })
    end },
  },
  objects = {
    { id = "mosaic", name = "Мозаика «СЕВЕРНАЯ»", x = 296, y = 46, w = 170, h = 30, ax = 380,
      lines = {
        { D, "Смальта. Не краска. На заброшку столько денег не тратят." },
        { L, "Значит, не думали, что это заброшка. Думали, что будут ездить." },
        { D, "А потом закрыли. Не открыв." },
        { L, "Вот и вся история всех на свете станций." },
      } },
    { id = "clock", name = "Станционные часы", x = 598, y = 62, w = 20, h = 20, ax = 600,
      lines = {
        { D, "Одиннадцать сорок. Стоят." },
        { L, "Классика. Все заброшки встали в одно время, когда хозяева ушли." },
        { D, "Не все. Просто сломанные часы, Лёх." },
      } },
    { id = "poster", name = "Плакат «СЛАВА СТРОИТЕЛЯМ МЕТРО!»", x = 50, y = 100, w = 46, h = 64, ax = 76,
      lines = {
        { D, "Ударники труда. Станцию сдали за одиннадцать месяцев. Я видел даты на табличках." },
        { L, "Хорошо били, значит." },
        { D, "Слишком быстро для такого объёма. Либо людей было втрое больше, либо ничего не переделывали." },
        { L, "В пятидесятых гнали по плану. Нужно к празднику, значит, к празднику. Что там под ногами, никому не интересно." },
      } },
    { id = "tile", name = "Плитка на колонне", x = 460, y = 150, w = 18, h = 50, ax = 450,
      lines = {
        { D, "Плитка толстая и тёплая на ощупь." },
        { L, "Это ты просто руки в карманах держал." },
      } },
    { id = "closet", name = "Подсобка с инструментом", x = 1068, y = 174, w = 66, h = 58, ax = 1086,
      lines = {
        { D, "Лопата, ящик под инструмент, пустой. Всё, что можно было унести, унесли." },
        { L, "Лопату оставили. Значит, лопатой никто не интересовался." },
      } },
    { id = "bench", name = "Скамейка: присесть", x = BENCH_X, y = 210, w = 34, h = 22, ax = BENCH_X + 10,
      use = function(o, sc)
        restAt(sc, BENCH_X + 10)
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
    { id = "back", name = "Назад, в коридор", x = 0, y = 150, w = 16, h = 82, ax = 10,
      exit = { to = "corridor", x = 960, facing = -1 } },
    { id = "exit", name = "В тоннель", x = 1160, y = 140, w = 40, h = 92, ax = 1185,
      exit = { to = "tunnel_sl", x = 30, facing = 1 } },
  },
})

-------------------------------------------------------------- 1.4 Перегон «Северная»–«Липовая»
reg("tunnel_sl", {
  w = 1500, spawn = 30, surface = "gravel", echo = true,
  ambient = { 0.035, P.blue2 },
  amb = { hum = 0.25 },
  static = function(sc)
    K.tunnel(sc, {})
    for i = 1, 14 do
      Gx.stain(Gx.hash(i, 31) * sc.w, 110 + Gx.hash(i, 32) * 60, 10 + Gx.hash(i, 33) * 12, 6, P.gray4, 0.5, i)
    end
    Gx.stain(530, 140, 22, 12, P.gray4, 0.8, 99)
    Gx.r(P.blue2, 1270, 110, 110, 16)
    Gx.r(P.dk1, 1272, 112, 106, 12, 0.3)
    Gx.text("ЛИПОВАЯ — 400 м", 1276, 112, P.white)
  end,
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
    { id = "sign", name = "Указатель «ЛИПОВАЯ — 400 м»", x = 1270, y = 108, w = 110, h = 20, ax = 1320,
      lines = {
        { D, "Липовая. Название как у улицы в старом городе." },
        { L, "Красиво. Кто называет станцию в честь дерева, которого рядом нет?" },
        { D, "Может, было." },
      } },
    { id = "salt", name = "Белые пятна соли", x = 506, y = 126, w = 48, h = 28,
      lines = {
        { D, "Соль. Вода тут была. Давно." },
        { L, "Видишь, затопление. Значит, не враньё." },
        { D, "Затопление не мешает строить. Мешает что-то другое." },
      } },
    { id = "back", name = "Назад, на «Северную»", x = 0, y = 150, w = 16, h = 82, ax = 10,
      exit = { to = "severnaya", x = 1170, facing = -1 } },
    { id = "exit", name = "К «Липовой»", x = 1480, y = 150, w = 20, h = 82, ax = 1490,
      exit = { to = "lipovaya", x = 30, facing = 1 } },
  },
})

-------------------------------------------------------------- 1.5 Станция «Липовая» (и возвращения в Актах 2 и 5)
local HUT_X, NICHE_X, TILE_X = 300, 760, 1000

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
  w = 1100, spawn = 30, surface = "tile", echo = true,
  ambient = { 0.05, P.blue2 },
  amb = { hum = 0.22 },
  static = function(sc)
    Gx.r(P.dk1, 0, 0, sc.w, 30)
    Gx.tiles(0, 30, sc.w, 176, 10, 6, P.gray3, P.gray2, 0.05)
    for i = 1, 10 do Gx.stain(Gx.hash(i, 41) * sc.w, 30, 20 + Gx.hash(i, 42) * 20, 6, P.cream2, 0.5, i + 40) end
    Gx.r(P.gray2, 0, 120, sc.w, 2)
    K.floor(0, 206, sc.w, P.gray1, P.dk2)
    for x = 70, sc.w, 110 do K.bellLamp(x, 10, true) end
    -- бытовка
    Gx.r(P.brown1, HUT_X - 40, 160, 90, 72)
    for x = HUT_X - 40, HUT_X + 50, 6 do Gx.r(P.brown2, x, 160, 5, 72) end
    Gx.r(P.brown1, HUT_X - 44, 154, 98, 6)
    Gx.r(P.black, HUT_X + 14, 178, 20, 14)
    Gx.r(P.gray1, HUT_X + 15, 179, 18, 12, 0.3)
    -- доска объявлений
    Gx.r(P.brown2, HUT_X - 34, 108, 70, 36)
    Gx.r(P.cream2, HUT_X - 30, 112, 62, 28)
    Gx.r(P.gray2, HUT_X - 26, 116, 40, 2)
    Gx.r(P.gray2, HUT_X - 26, 122, 50, 2)
    Gx.r(P.gray2, HUT_X - 26, 128, 30, 2)
    -- граффити
    Gx.text("КРОТЫ. 2008", 560, 140, P.red2, 0.85, Fonts.big)
    -- ниша с занавеской
    Gx.r(P.black, NICHE_X, 150, 34, 40)
    Gx.r(P.dk2, NICHE_X + 2, 178, 30, 2)
    -- торец платформы
    Gx.r(P.gray2, TILE_X - 4, 30, 8, 176)
    Gx.r(P.black, 1040, 120, 60, 112)
    Gx.r(P.dk1, 1034, 116, 72, 4)
  end,
  draw = function(sc)
    local t = sc.t
    -- дверь бытовки
    local doorOpen = not G.flags.hutClosed or thermosTrip() or G.flags.thermosBack
    Gx.door(HUT_X - 26, 182, 22, 50, P.brown2, doorOpen)
    -- термос
    if not G.flags.thermosTaken then
      if G.flags.hutSeen and not thermosTrip() and not G.flags.thermosBack then
        Gx.r(P.green2, HUT_X - 12 + 34, 182, 4, 9)
      elseif thermosTrip() then
        Gx.r(P.green2, HUT_X + 32, 182, 4, 9)
        Gx.px(P.gray2, HUT_X + 31, 184)
      end
    end
    -- лошадка и занавеска
    if not G.inv.horse and not G.flags.rest_alesha then Gx.horse(NICHE_X + 12, 178) end
    if G.flags.handprint and not act5() then
      Gx.r(P.gray3, NICHE_X + 14, 176, 3, 2, 0.6)
      Gx.px(P.gray3, NICHE_X + 14, 175, 0.6) Gx.px(P.gray3, NICHE_X + 16, 175, 0.6)
    end
    local sway = (thermosTrip() and sc.v.lookNiche) and math.sin(t * 3) * 2 or 0
    if not act5() then
      for i = 0, 5 do Gx.r(P.cream2, NICHE_X + i * 6 + sway * (i / 5), 148, 4, 26 - i % 2 * 3, 0.85) end
    end
    if G.flags.rest_alesha then Gx.candle(NICHE_X + 6, 178, t, true) end
    -- плитка у торца
    if G.flags.tileTaken then
      Gx.r(P.gray1, TILE_X - 8, 196, 14, 10)
      for i = 0, 3 do Gx.r(P.dk2, TILE_X - 7 + i * 3, 198, 1, 7) end
      if sc.v.reveal and sc.v.reveal > 0 then
        Gx.r(P.gray2, TILE_X - 10, 190, 18, 16)
        for i = 0, 4 do Gx.r(P.dk1, TILE_X - 9 + i * 3, 192, 1, 13) end
      end
    else
      Gx.r(P.gray3, TILE_X - 7, 196, 12, 10)
      Gx.r(P.gray2, TILE_X - 7, 196, 12, 1)
    end
    if sc.v.reveal then sc.v.reveal = sc.v.reveal - love.timer.getDelta() end
  end,
  lights = function(sc)
    local t = {}
    if G.flags.rest_alesha then t[#t + 1] = { NICHE_X + 6, 168, 70, P.orange2, 0.5 } end
    if act5() and sc.actors.ALESHA and sc.actors.ALESHA.visible then t[#t + 1] = { NICHE_X + 17, 170, 50, P.blue3, 0.3 } end
    return t
  end,
  unrest = function(sc) if not G.flags.rest_alesha then return NICHE_X end end,
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
      sc.actors.ALESHA = { kind = "alesha", x = NICHE_X + 17, y = 192, a = 0, spirit = true, glow = 0.3, glowCol = P.blue3, h = 40 }
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
      sc.actors.ALESHA = { kind = "alesha", x = NICHE_X + 17, y = 192, a = 1, spirit = true, glow = 0.3, glowCol = P.blue3, h = 40 }
    end
  end,
  zones = {
    { id = "enter", x1 = 60, x2 = 2000, cond = function() return not act5() and not thermosTrip() end, fn = function()
      talk({
        { L, "Ого. Милая. Прямо хочется переехать." },
        { D, "Тебя приглашали на семейные ужины, а ты отказывался." },
        { L, "Это другое. Тут хотя бы никто не спрашивает, когда я женюсь." },
      })
    end },
    { id = "tile", x1 = 820, x2 = 2000, cond = function() return not G.flags.tileTaken and not act5() end, fn = tileEvent },
  },
  timers = {
    { id = "tile2", t = 95, cond = function() return not G.flags.tileTaken and not act5() end, fn = tileEvent },
  },
  objects = {
    { id = "graffiti", name = "Граффити «КРОТЫ. 2008»", x = 556, y = 138, w = 130, h = 22, ax = 620,
      cond = function() return not thermosTrip() end,
      lines = {
        { D, "Кроты. Две тысячи восьмой." },
        { L, "Я их знал. Хорошие ребята. Давно их не видел." },
        { D, "Давно, это сколько?" },
        { L, "Лет десять. У всех семьи, дела." },
      } },
    { id = "hut", name = "Бытовка", x = HUT_X - 40, y = 160, w = 50, h = 72, ax = HUT_X - 20,
      cond = function() return not thermosTrip() and not act5() end,
      lines = {
        { D, "Строительная бытовка. Чайник эмалированный, ведро, стол." },
        { L, "Не похоже на место, где хочется работать." },
      },
      after = function(o, sc, first)
        G.flags.hutSeen = true
        if not G.flags.hutClosed then
          wait(0.3)
          sfx("thud", 0.3, 1.6, HUT_X)
          G.flags.hutClosed = true
          UI.toast("Дима прикрыл дверь бытовки", 2)
        end
      end },
    { id = "tabel", name = "Табель на столе", x = HUT_X + 12, y = 176, w = 24, h = 18, ax = HUT_X + 10,
      cond = function() return not thermosTrip() end,
      lines = {
        { D, "Табель бригады номер четыре. Октябрь пятьдесят четвёртого. Читаю: «Участок семь: работы не ведутся. Люди отказываются, говорят, что земля не пускает. Ждём распоряжения»." },
        { L, "Ленились ребята. Профсоюз." },
        { D, "Земля не пускает. Странная формулировка." },
        { L, "Это они грунт так ругали." },
      },
      after = function(o, sc, first) if first then readDoc("N-01") end end },
    { id = "board", name = "Доска объявлений", x = HUT_X - 34, y = 108, w = 70, h = 36, ax = HUT_X,
      lines = {
        { D, "Выцвело всё. Читаю: «Строителям! Сдача ветки первого мая пятьдесят пятого. Выполним досрочно!»" },
        { L, "Выполнили. Только никто не поехал." },
      },
      after = function(o, sc, first) if first then State.doc("N-02") end end },
    { id = "niche", name = "Ниша с занавеской", x = NICHE_X, y = 146, w = 34, h = 46, ax = NICHE_X + 10,
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
    { id = "door2", name = "Дверь бытовки", x = HUT_X - 28, y = 180, w = 26, h = 52, ax = HUT_X - 34,
      cond = function() return thermosTrip() end,
      lines = {
        { D, "Дверь открыта." },
        { L, "Ветер." },
        { D, "Тут нет ветра." },
        { L, "Тут тяга. Ты сам говорил." },
      },
      after = function(o, sc, first) if first then strange(1) end end },
    { id = "thermos", name = "Термос", x = HUT_X + 26, y = 178, w = 16, h = 16, ax = HUT_X + 10,
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
    { id = "niche2", name = "Ниша", x = NICHE_X, y = 146, w = 34, h = 46, ax = NICHE_X + 10,
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
    { id = "niche5", name = "Ниша", x = NICHE_X, y = 146, w = 34, h = 46, ax = NICHE_X - 10,
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
    { id = "back", name = "Назад, к «Северной»", x = 0, y = 150, w = 16, h = 82, ax = 10,
      cond = function() return not act5() and not thermosTrip() end,
      exit = { to = "tunnel_sl", x = 1470, facing = -1 } },
    { id = "exit", name = "В перегон", x = 1040, y = 120, w = 60, h = 112, ax = 1060,
      cond = function() return G.flags.act1done and not act5() end,
      exit = function()
        if thermosTrip() then
          return { to = "tunnel_drip", x = 820, facing = 1, pre = function() G.flags.thermosBack = true end }
        end
        return { to = "tunnel_drip", x = 30, facing = 1 }
      end },
    { id = "exit5", name = "Переход к «Покровской»", x = 1040, y = 120, w = 60, h = 112, ax = 1060,
      cond = function() return act5() and G.flags.aleshaSeen end,
      exit = { to = "tunnel_pokr", x = 30, facing = 1 } },
  },
})
