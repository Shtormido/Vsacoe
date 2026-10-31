-- АКТ 4. «Открытие» (42:00–55:00)
local K = require("src.scenes.common")
local reg = World.register

-------------------------------------------------------------- 4.1 Административный блок и 4.4 Безымянные
local OFFICE_X = 900

local function namelessEvent(sc)
  sc.v.lampsOff = false
  for i = 1, 8 do
    sc.v.flick = (i % 2 == 0)
    wait(0.15 + love.math.random() * 0.2)
  end
  sc.v.lampsOff = true
  sc.v.flick = false
  sc.ambient = { 0.02, P.blue2 }
  say(D, "Лёх, ни звука.")
  say(L, "Что это?")
  say(D, "Просто замри.")
  hint("Удерживай ПРОБЕЛ. Дыши, когда полоска в зелёном окне", 8)
  sfx("whisper", 0.6)
  -- безымянные идут из конца коридора
  sc.enemies = {}
  local px = World.player.x
  for i = 1, 3 do
    table.insert(sc.enemies, { kind = "nameless", x = px - 220 - i * 45, dir = 1, speed = 40, variant = i, a = 0.85 })
  end
  sc.v.passX = px
  sc.danger = true
  sc.v.passT = 0
  waitUntil(function()
    return sc.v.namelessResult ~= nil
  end)
  if sc.v.namelessResult == "ok" then
    sc.enemies = {}
    sc.danger = false
    wait(0.5)
    talk({
      { L, "Они ушли?" },
      { D, "Да. Пока да." },
    })
    G.flags.namelessDone = true
    sc.ambient = nil
    State.complete("back")
    State.objective("krots", "Осмотреть боковую нишу «Центральной»")
  end
end

reg("admin_corridor", {
  wallProps = false, props = "light",
  w = 1000, spawn = 30, surface = "concrete", echo = false,
  ambient = { 0.05, P.blue2 },
  amb = { hum = 0.18 },
  static = function(sc)
    K.corridor(sc, { wall = P.gray2, paint = P.green2 })
    local plaques = { "ТЕХОТДЕЛ", "ОТДЕЛ КАДРОВ", "БУХГАЛТЕРИЯ", "МАРКШЕЙДЕР", "ПЛАНОВЫЙ ОТДЕЛ" }
    for i, t in ipairs(plaques) do
      local x = 80 + (i - 1) * 160
      Gx.door(x, 160, 26, 46, P.brown2, false)
      Gx.r(P.cream2, x - 8, 146, 42, 9)
      Gx.text(t, x - 6, 145, P.dk1)
    end
    Gx.door(OFFICE_X, 160, 28, 46, P.brown2, false)
    Gx.r(P.cream2, OFFICE_X - 30, 132, 88, 24)
    Gx.text("НАЧАЛЬНИК", OFFICE_X - 26, 132, P.dk1)
    Gx.text("СТРОИТЕЛЬСТВА", OFFICE_X - 26, 140, P.dk1)
    Gx.text("Н. В. ГРОМОВ", OFFICE_X - 26, 148, P.dk1)
    for i = 1, 6 do Gx.line(P.gray3, Gx.hash(i, 1) * sc.w, 36, Gx.hash(i, 2) * sc.w, 46, 0.4) end
  end,
  draw = function(sc)
    for x = 60, sc.w, 140 do
      local lit = not sc.v.lampsOff and not sc.v.flick
      Gx.r(P.dk2, x - 4, 36, 9, 2)
      Gx.r(lit and P.cream or P.gray1, x - 3, 38, 7, 3)
    end
  end,
  lights = function(sc)
    local t = {}
    if not sc.v.lampsOff and not sc.v.flick then
      for x = 60, sc.w, 140 do t[#t + 1] = { x, 42, 90, P.cream, 0.35 } end
    end
    return t
  end,
  update = function(sc, dt)
    if sc.danger then
      sc.v.passT = (sc.v.passT or 0) + dt
      local touched = World.updateEnemies(dt)
      if touched and not sc.v.namelessResult then
        sc.v.namelessResult = "fail"
        World.caught("office", 300, 0.2, function()
          G.done["admin_corridor:z:nameless"] = nil
        end)
      end
      local allPast = true
      for _, e in ipairs(sc.enemies) do if e.x < (sc.v.passX or 0) + 130 then allPast = false end end
      if (allPast or sc.v.passT > 40) and not sc.v.namelessResult then sc.v.namelessResult = "ok" end
    end
  end,
  zones = {
    { id = "nameless", x1 = 0, x2 = 2000, cond = function() return G.flags.phoneDone and not G.flags.namelessDone end, fn = namelessEvent },
  },
  objects = {
    { id = "back", name = "Назад, в зеркальный коридор", x = 0, y = 130, w = 16, h = 102, ax = 10,
      cond = function() return not G.flags.phoneDone or G.flags.namelessDone end,
      exit = { to = "mirror", x = 1270, facing = -1 } },
    { id = "office", name = "Кабинет Громова", x = OFFICE_X, y = 160, w = 28, h = 46, ax = OFFICE_X + 14,
      cond = function() return not G.flags.phoneDone or G.flags.namelessDone end,
      exit = { to = "office", x = 40, facing = 1 } },
  },
})

-------------------------------------------------------------- Кабинет Громова (4.1–4.3)
local DESK_X = 320

local function tileReveal()
  if G.flags.tileChoice == "put" then
    talk({
      { D, "Лёх, достань плитку." },
      { L, "Дима... не надо." },
      { D, "Достань." },
    })
  else
    talk({
      { L, "Это ты разрешил." },
      { D, "Я знаю." },
    })
  end
  World.leha.pose = "inspect"
  wait(1.0)
  UI.openDoc("TILE")
  waitUntil(function() return UI.modal == nil end)
  World.leha.pose = "idle"
  talk({
    { D, "Это надгробие." },
    { L, "Я отломил его от чьей-то могилы." },
    { D, "Да. Теперь она нас ищет." },
  })
  State.panic(15)
  G.flags.grave_evd = true
  State.note("n:evdgrave", "Могила Евдокии: не найдена.")
end

DOCS.TILE = { title = "Обломок плитки", text = "Серый камень с буквами «...ДОКИЯ. 1887 г.». С обратной стороны плитки видна часть креста." }

local function phoneEvent(sc)
  wait(2)
  sc.v.ring = true
  Audio.phone(true)
  sc.v.lampFlick = true
  talk({
    { L, "Он же отключён с пятьдесят четвёртого." },
    { D, "Да." },
  })
  local r = choose({ "Снять трубку", "Не снимать" })
  if r == 1 then
    Audio.phone(false)
    sc.v.ring = false
    walkTo("DIMA", DESK_X + 30)
    World.player.pose = "inspect"
    say(PH, "Парень... слышишь меня? Плиту верни сестре. Потом ко мне. Я под стеной. Три удара. Слушай три удара.", { at = { DESK_X + 34, 170 }, shaky = true })
    World.player.pose = "idle"
    talk({
      { L, "Это розыгрыш." },
      { D, "Телефон отключён с пятьдесят четвёртого, Лёх." },
      { L, "Тогда это очень хороший розыгрыш." },
    })
    State.voice("phone", "Телефон: «Плиту верни сестре. Потом ко мне. Я под стеной. Три удара».")
  else
    wait(14)
    Audio.phone(false)
    sc.v.ring = false
    State.panic(5)
  end
  sc.v.lampFlick = false
  State.objective("evd", "Вернуть плиту сестре (Евдокия)")
  State.objective("laptev", "Найти Лаптева (три удара)")
  G.flags.phoneDone = true
  G.flags.grave_laptev = true
end

reg("office", {
  wet = false,
  vents = false,
  props = false, puddles = false,
  w = 640, spawn = 40, surface = "concrete",
  ambient = { 0.05, P.blue2 },
  amb = { hum = 0.12 },
  static = function(sc)
    Gx.r(P.dk1, 0, 0, sc.w, 40)
    Gx.r(P.green1, 0, 40, sc.w, 166)
    for x = 0, sc.w, 16 do Gx.r(P.green2, x, 40, 1, 166, 0.5) end
    Gx.r(P.brown1, 0, 150, sc.w, 56)
    Gx.r(P.brown2, 0, 150, sc.w, 2)
    K.floor(0, 206, sc.w, P.brown1, P.dk1)
    -- светлое пятно от снятого портрета
    Gx.r(P.green3, 200, 70, 40, 52)
    Gx.r(P.dk2, 219, 64, 2, 6)
    -- шкаф с папками
    Gx.r(P.brown1, 90, 90, 60, 116)
    Gx.r(P.brown2, 92, 92, 56, 112)
    for y = 100, 190, 22 do
      Gx.r(P.dk1, 94, y + 14, 52, 2)
      for x = 96, 140, 7 do Gx.r(Gx.hash(x, y) > 0.5 and P.cream2 or P.gray2, x, y, 5, 14) end
    end
    -- дубовый стол
    Gx.r(P.brown2, DESK_X - 10, 186, 110, 6)
    Gx.r(P.brown1, DESK_X - 6, 192, 102, 30)
    Gx.r(P.brown2, DESK_X + 30, 200, 30, 6)
    Gx.r(P.gray3, DESK_X + 42, 202, 6, 2)
    -- чернильный прибор, телефон
    Gx.r(P.dk2, DESK_X + 10, 180, 14, 6)
    Gx.r(P.black, DESK_X + 30, 178, 14, 8)
    Gx.r(P.black, DESK_X + 28, 175, 18, 3)
    -- сейф
    Gx.r(P.gray1, 540, 160, 46, 46)
    Gx.r(P.gray2, 542, 162, 42, 42)
    Gx.r(P.dk2, 576, 176, 4, 10)
  end,
  draw = function(sc)
    local on = sc.v.lampFlick and (love.math.random() < 0.5) or false
    Gx.r(P.green2, DESK_X + 70, 170, 14, 6)
    Gx.r(P.brown1, DESK_X + 76, 176, 2, 10)
    if on then Gx.r(P.yellow, DESK_X + 72, 176, 10, 1) end
    if sc.v.ring then
      local k = math.floor(sc.t * 20) % 2
      Gx.r(P.black, DESK_X + 28, 174 - k, 18, 3)
    end
  end,
  lights = function(sc)
    if sc.v.lampFlick and love.math.random() < 0.5 then return { { DESK_X + 77, 178, 110, P.green3, 0.8 } } end
    return {}
  end,
  enter = function(sc)
    if G.flags.officeEnter then return end
    G.flags.officeEnter = true
    talk({
      { L, "Ого. Вот это кабинет." },
      { D, "Тут всё как будто ждут хозяина." },
    })
  end,
  update = function(sc, dt)
    if G.flags.kalkaDone and not G.flags.kalkaTalk and not Script.blocking() and not UI.modal then
      G.flags.kalkaTalk = true
      Script.run(function()
        talk({
          { D, "Покровская стоит прямо на участке семь. Старейшая часть." },
          { L, "То есть мы идём..." },
          { D, "По людям." },
          { L, "Я хочу выйти." },
          { D, "Я тоже." },
        })
        G.flags.compassDown = false
        wait(1)
        tileReveal()
        phoneEvent(sc)
      end, true, "kalka")
    end
  end,
  objects = {
    { id = "stain", name = "Пятно на стене", x = 200, y = 70, w = 40, h = 52, ax = 220,
      lines = {
        { D, "Здесь висел портрет. Кто-то его снял." },
        { L, "Наверное, чтобы не смотрел." },
      } },
    { id = "shelf", name = "Шкаф с папками", x = 90, y = 90, w = 60, h = 116, ax = 120,
      use = function(o, sc)
        if G.flags.folderRead then
          World.examine({ id = "shelf2", name = "Шкаф", lines = { { D, "Папка. «Дело номер семь»." } } })
          return
        end
        G.flags.folderRead = true
        World.player.pose = "inspect"
        wait(0.9)
        World.player.pose = "idle"
        talk({
          { D, "Папка. «Дело номер семь». Читаю." },
          { D, "«Акт. Захоронения на участках с первого по шестой перенесены частично, около сорока процентов. Участок номер семь, старая часть, тысяча восемьсот восьмидесятый до тысяча девятьсот тридцать первого, включая общую могилу тысяча восемьсот девяносто второго года, сорок три человека, детские и монашеские захоронения, не перенесён ввиду нехватки сроков. Решение: перекрыть бетонной плитой, облицевать станцию»." },
          { L, "Это что же получается?" },
          { D, "Получается, они закрыли кладбище плиткой." },
        })
        State.give("act7")
        readDoc("A-1")
        State.doc("A-2")
        talk({
          { D, "На полях: «Если спросят — грунт. Н. Г.»." },
          { L, "Грунт. Ну да, конечно. Грунт." },
        })
        talk({
          { D, "«Обвал на участке семь. Выработку считать закрытой. Работы по извлечению не вести. Лаптева П. С. считать выбывшим»." },
          { L, "Выбывшим. То есть он остался там?" },
          { D, "Двадцать седьмое октября пятьдесят четвёртого." },
          { L, "Это..." },
          { D, "Сегодня." },
        })
        State.doc("A-3")
        wait(1.5)
        if not G.flags.saidToday then
          G.flags.saidToday = true
          say(L, "Сегодня двадцать седьмое. Мы вошли в годовщину.")
        end
        State.note("n:act7", "Акт №7: участок №7 не перенесён. Лаптев П. С. «выбыл» 27.10.1954.")
      end },
    { id = "drawer", name = "Ящик стола", x = DESK_X + 26, y = 196, w = 40, h = 14, ax = DESK_X + 20,
      cond = function() return G.flags.folderRead end,
      use = function(o, sc)
        if G.flags.kalkaGot then
          if not G.flags.kalkaDone then UI.openMap() end
          return
        end
        G.flags.kalkaGot = true
        World.player.pose = "inspect"
        wait(0.9)
        World.player.pose = "idle"
        talk({
          { D, "Калька. План кладбища. Липовая аллея, главная аллея, северные ворота." },
          { L, "Липовая... Центральная... Северная..." },
          { D, "Станции названы по частям кладбища." },
          { L, "Только не говори, что..." },
        })
        State.give("kalka")
        giveFragment(5)
        hint("Наложи кальку на карту: перетащи её мышью", 6)
        wait(0.5)
        UI.openMap()
      end },
    { id = "phone", name = "Эбонитовый телефон", x = DESK_X + 26, y = 172, w = 22, h = 14, ax = DESK_X + 30,
      lines = { { D, "Эбонитовый телефон. Провод обрезан." } } },
    { id = "safe", name = "Сейф", x = 540, y = 160, w = 46, h = 46, ax = 530,
      use = function(o, sc)
        if G.flags.safeOpen then say(D, "Пусто.") return end
        G.flags.safeOpen = true
        World.player.pose = "inspect"
        wait(1)
        World.player.pose = "idle"
        G.spares = G.spares + 1
        UI.toast("Запасная батарейка", 3)
        readDoc("A-4")
      end },
    { id = "back", name = "В коридор", x = 0, y = 130, w = 16, h = 102, ax = 10,
      cond = function() return not Script.running("kalka") end,
      exit = { to = "admin_corridor", x = OFFICE_X + 14, facing = -1 } },
  },
})

-------------------------------------------------------------- 4.5 «Кроты»
reg("krots", {
  vents = false,
  wallProps = false,
  w = 640, spawn = 40, surface = "concrete",
  ambient = { 0.03, P.blue2 },
  amb = { hum = 0.08 },
  static = function(sc)
    Gx.r(P.granite, 0, 0, sc.w, H)
    Gx.concrete(0, 90, sc.w, 116, P.dk2, P.gray1, 61)
    for i = 1, 300 do Gx.px(P.gray2, Gx.hash(i, 1) * sc.w, 200 + Gx.hash(i, 2) * 40, 0.5) end
    K.floor(0, 206, sc.w, P.dk2, P.gray1)
    Gx.r(P.black, 560, 120, 50, 86)
    Gx.bricks(560, 120, 50, 86, P.dk2, P.black, P.dk1)
  end,
  draw = function(sc)
    Gx.skeleton(300, FLOOR, false, P.dk2)
    Gx.r(P.orange1, 292, FLOOR - 6, 4, 2)
    Gx.text("КРОТЫ", 270, FLOOR - 20, P.gray2, 0.6)
    Gx.skeleton(430, FLOOR, true, P.blue1)
    if not G.inv.skull then Gx.r(P.bone, 436, FLOOR - 12, 6, 5) end
    Gx.r(P.green1, 370, FLOOR - 12, 14, 12)
    Gx.r(P.black, 388, FLOOR - 3, 6, 3)
    if G.flags.krotsBreach then Gx.r(P.black, 566, 140, 38, 66) end
  end,
  enter = function(sc)
    if G.flags.krotsEnter then return end
    G.flags.krotsEnter = true
    talk({
      { L, "Нет." },
      { D, "Лёх..." },
      { L, "Это Серёга. Это его куртка. Я эту куртку помню." },
    })
    State.panic(10)
    hint("Кликни по Лёхе, чтобы поддержать его", 5)
  end,
  setup = function(sc)
    sc.v.lehaTalk = 0
  end,
  objects = {
    { id = "leha", name = "Поддержать Лёху", noShimmer = true,
      x = 0, y = FLOOR - 48, w = 16, h = 48,
      cond = function() return G.flags.krotsEnter end,
      use = function(o, sc)
        if (sc.v.lehaTalk or 0) >= 2 then return end
        sc.v.lehaTalk = (sc.v.lehaTalk or 0) + 1
        World.player.facing = World.leha.x > World.player.x and 1 or -1
        World.player.pose = "inspect"
        wait(1.2)
        World.player.pose = "idle"
        State.panic(-5)
        UI.toast("Дима кладёт руку Лёхе на плечо", 2)
      end },
    { id = "bag", name = "Рюкзак", x = 368, y = FLOOR - 14, w = 30, h = 14, ax = 360,
      use = function(o, sc)
        if G.flags.krotsRead then say(D, "Дневник «Кротов». Я всё прочитал.") return end
        World.player.pose = "inspect"
        wait(0.9)
        World.player.pose = "idle"
        talk({
          { D, "В рюкзаке дневник. И телефон. Заряда нет." },
          { L, "Прочти." },
          { D, "Прочту. Но мы вряд ли обрадуемся." },
        })
        readDoc("K-1")
        readDoc("K-2")
        readDoc("K-3")
        G.flags.krotsRead = true
        talk({
          { L, "Это писал Серёга." },
          { D, "Да." },
          { L, "Он звал меня. А я... я не пришёл." },
          { D, "Ты не мог знать." },
          { L, "Мог. Мне сказали, что они уехали. Я не проверил." },
        })
        local r = choose({ "«Это не твоя вина»", "«Ты мог проверить»" })
        if r == 1 then State.panic(-10) else State.panic(15) G.flags.harsh = true end
        G.flags.krotsDone = true
        G.flags.krotsBreach = true
        G.act = 5
        State.complete("krots")
        State.complete("exit")
        State.objective("evd", "Вернуть плиту сестре: «Монастырская»")
        sfx("collapse", 0.4)
        UI.toast("В кладке за скелетами — пролом", 4)
      end },
    { id = "skull", name = "Череп в руках скелета", x = 428, y = FLOOR - 26, w = 18, h = 18, ax = 410,
      cond = function() return not G.flags.skullDecided end,
      use = function(o, sc)
        World.player.pose = "inspect"
        wait(0.9)
        World.player.pose = "idle"
        talk({
          { D, "Череп. Это Евдокия?" },
          { L, "Откуда я знаю." },
          { D, "Он не её. Но они его взяли. Значит, они тоже взяли чужое." },
        })
        local r = choose({ "Оставить", "Взять" })
        G.flags.skullDecided = true
        if r == 1 then
          say(D, "Лежи, дружище.")
        else
          State.give("skull")
        end
      end },
    { id = "back", name = "Назад, в коридор", x = 0, y = 130, w = 16, h = 102, ax = 10,
      exit = { to = "mirror", x = 1085, facing = 1 } },
    { id = "breach", name = "Пролом: к «Монастырской»", x = 560, y = 120, w = 50, h = 86, ax = 585,
      cond = function() return G.flags.krotsBreach end,
      exit = { to = "monastyrskaya", x = 900, facing = -1 } },
  },
})

-- объект «Лёха» следует за Лёхой
local kr = World.scenes.krots
kr.update = function(sc, dt)
  for _, o in ipairs(kr.objects) do
    if o.id == "leha" then o.x = World.leha.x - 8 end
  end
end
