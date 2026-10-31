-- АКТ 5. «Могилы» (55:00–85:00): три просьбы добрых духов
local K = require("src.scenes.common")
local reg = World.register

-------------------------------------------------------------- ритуалы упокоения
-- Три шага: положить предмет, назвать имя (1 из 3), зажечь свечу
Rituals = {}

local function nameStep(id, correct, others)
  local lock = G.flags["lock_" .. id]
  if lock and G.time < lock then
    hint("Душа не откликается. Повторить через " .. math.ceil(lock - G.time) .. " с", 3)
    return false
  end
  local opts = U.shuffle({ correct, others[1], others[2] })
  local r = choose(opts, "Назвать имя")
  if opts[r] ~= correct then
    G.flags["lock_" .. id] = G.time + 60
    sfx("whisper", 0.3, 0.6)
    hint("Душа не откликается. Повторить можно через минуту", 4)
    return false
  end
  return true
end

local function candleStep()
  if not State.has("candle") then
    say(D, "Чего-то не хватает.")
    hint("Нужна свеча", 3)
    return false
  end
  local ok = UI.candleGame()
  sfx("whoosh", 0.4, 1.4)
  return ok
end

function Rituals.evdokia(sc)
  if not State.has("rosary") then
    say(D, "Чего-то не хватает.")
    if not G.flags.depotHint then
      G.flags.depotHint = true
      talk({
        { EV, "Чётки... они... у тех, кто... пел... в Депо...", { at = { 651, 100 }, slow = true } },
        { L, "Депо. Красным «не ходить»." },
        { D, "Да. Значит, надо." },
      })
      State.objective("rosary", "Найти чётки (Депо)")
    end
    return
  end
  if not State.has("candle") then
    say(D, "Чего-то не хватает.")
    hint("Нужна свеча (Депо)", 3)
    return
  end
  hint("Шаг 1 из 3: плита и чётки на месте", 2)
  if not nameStep("evd", "Евдокия", { "Евфросинья", "Евгения" }) then return end
  say(D, "Раба Божия Евдокия, инокиня. Прости нас. Мы возвращаем то, что взяли.")
  if not candleStep() then return end
  State.take("rosary")
  say(EV, "Спаси Христос.", { at = { 651, 100 }, slow = true })
  -- силуэт светлеет и растворяется
  local a = sc.actors.EVD
  if a then
    a.glow = 1.2
    for i = 1, 30 do a.a = 0.9 * (1 - i / 30) wait(0.07) end
    sc.actors.EVD = nil
  end
  G.flags.rest_evd = true
  Audio.amb("sing", 0, 0.3)
  sc.ambient = { 0.1, P.cream }
  State.trust(1)
  State.panic(-15)
  giveFragment(4)
  State.complete("evd")
  State.complete("rosary")
  UI.toast("Свеча Евдокии — точка отдыха", 3)
  G.rest = { scene = "monastyrskaya", x = 470 }
end

function Rituals.laptev(sc)
  if not State.has("letter") then
    say(D, "Чего-то не хватает.")
    return
  end
  if not nameStep("laptev", "Пётр Степанович", { "Павел Сергеевич", "Пётр Ильич" }) then return end
  talk({
    { D, "Пётр Степанович. Мы нашли вас." },
    { L, "Нина... Он просил передать." },
    { D, "«Нина, если найдёшь это письмо, значит, меня не нашли. Я под седьмым участком, у северной стены. Ты не плачь. Скажи Мишке, что отец не бросал работу, отец не стал делать плохое. Поставь свечу в Покровской церкви. Твой Пётр»." },
  })
  if not candleStep() then return end
  sc.v.candle = true
  Audio.amb("water", 0.05, 0.3)
  local a = sc.actors.LAPTEV
  say(LA, "Спасибо. Дальше... Покровская. Там яма. Сорок три. Дайте им имена.", { at = { 540, 120 }, slow = true })
  if a then
    for i = 1, 30 do a.y = a.y - 1 a.a = 1 - i / 30 wait(0.06) end
    sc.actors.LAPTEV = nil
  end
  G.flags.rest_laptev = true
  State.trust(1)
  State.panic(-10)
  State.note("n:43", "Сорок три: имена в акте №7.")
  State.complete("laptev")
  State.objective("pit", "Покровская: дать имена сорока трём")
  G.flags.grave_pit = true
  G.rest = { scene = "laptev_store", x = 470 }
end

function Rituals.alesha(sc)
  if not nameStep("alesha", "Алёша", { "Андрюша", "Антон" }) then return end
  talk({
    { D, "Алёша. Мы вернули твою лошадку." },
    { AL, "Теперь можно идти дальше? Тут холодно.", { slow = true } },
    { D, "Можно. Мы поможем тебе уйти." },
  })
  if not candleStep() then return end
  State.take("horse")
  local a = sc.actors.ALESHA
  if a then
    a.horse = true
    wait(1.2)
    sfx("whoosh", 0.6, 0.7)
    for i = 1, 30 do a.a = 1 - i / 30 wait(0.06) end
    sc.actors.ALESHA = nil
  end
  G.flags.rest_alesha = true
  State.trust(1)
  State.panic(-10)
  State.complete("alesha")
  G.rest = { scene = "lipovaya", x = 720 }
end

-------------------------------------------------------------- 5.2 Депо секты
local ALTAR_X = 800
local WAGONS = { { 300, 440 }, { 560, 700 }, { 960, 1100 }, { 1220, 1360 } }

local function depotChase(sc)
  sc.ambient = { 0.015, P.blue2 }
  sc.v.dark = true
  sfx("sting", 0.6)
  sc.actors.PREACHER = { kind = "preacher", x = 1500, y = FLOOR, a = 0.95, visible = true, h = 64 }
  say(PR, "Вы взяли то, что принадлежит хору.", { at = { 1500, 150 } })
  talk({
    { L, "Дима..." },
    { D, "Тихо." },
  })
  sc.actors.PREACHER = nil
  sc.enemies = { { kind = "preacher", x = 1500, dir = -1, speed = 22, minX = 120, maxX = 1530, a = 0.95 } }
  sc.danger = true
  Audio.setMusic("act6", 0.55)
  sc.hide = WAGONS
  G.flags.depotChase = true
  hint("Прячься за вагонами. ПРОБЕЛ — замри и не смотри на него", 7)
end

reg("depot", {
  w = 1600, spawn = 30, surface = "concrete", echo = true,
  ambient = { 0.035, P.orange1 },
  amb = { hum = 0.05, choir = 0.25 },
  static = function(sc)
    Gx.r(P.black, 0, 0, sc.w, H)
    for x = 0, sc.w, 80 do
      Gx.r(P.dk1, x, 0, 6, 206)
      Gx.line(P.dk1, x, 20, x + 80, 0)
    end
    Gx.concrete(0, 60, sc.w, 146, P.dk2, P.gray1, 91)
    -- большой рисунок: человек в рясе с раскинутыми руками
    Gx.r(P.white, 640, 70, 2, 70, 0.5)
    Gx.r(P.white, 600, 90, 82, 2, 0.5)
    Gx.r(P.white, 634, 60, 14, 12, 0.5)
    for i = 0, 30 do Gx.r(P.white, 641 - i, 110 + i, 1, 1, 0.5) Gx.r(P.white, 641 + i, 110 + i, 1, 1, 0.5) end
    -- записки на гвоздях
    for i = 0, 3 do
      Gx.r(P.cream2, 1090 + i * 16, 120 + (i % 2) * 6, 12, 15)
      Gx.px(P.gray3, 1095 + i * 16, 121 + (i % 2) * 6)
    end
    -- схема депо на стене
    Gx.r(P.cream2, 220, 110, 30, 22)
    Gx.line(P.dk2, 224, 116, 246, 126)
    K.floor(0, 206, sc.w, P.dk2, P.dk1)
    -- меловые круги и знаки на полу
    for i = 0, 6 do
      local cx = 150 + i * 200
      for a = 0, 40 do
        local ang = a / 40 * math.pi * 2
        Gx.px(P.white, cx + math.cos(ang) * 30, 236 + math.sin(ang) * 6, 0.5)
      end
      Gx.line(P.white, cx - 3, 230, cx + 3, 242, 0.4)
    end
    -- перевёрнутые кресты и глаза
    for i = 0, 5 do
      local x = 100 + i * 250
      Gx.r(P.white, x, 150, 1, 14, 0.4)
      Gx.r(P.white, x - 4, 158, 9, 1, 0.4)
      Gx.r(P.white, x + 60, 170, 9, 3, 0.35)
      Gx.px(P.black, x + 64, 171)
    end
    -- алтарь из ящиков и дверей
    Gx.r(P.brown1, ALTAR_X - 40, 196, 80, 36)
    Gx.r(P.brown2, ALTAR_X - 44, 192, 88, 5)
    Gx.r(P.cream, ALTAR_X - 44, 192, 88, 2, 0.6)
    for i = 0, 6 do Gx.r(P.bone, ALTAR_X - 34 + i * 10, 186 + (i % 3), 6, 3) end
    Gx.r(P.bone, ALTAR_X + 20, 180, 7, 6)
    -- выход, меловая стрелка
    Gx.r(P.black, 1560, 120, 40, 112)
    UI.arrow(1530, 140, 1, P.white)
  end,
  front = function(sc)
    -- вагоны-«скелеты» на переднем плане: за ними можно спрятаться
    for _, w in ipairs(WAGONS) do
      local x0, x1 = w[1], w[2]
      Gx.r(P.rust, x0, 150, x1 - x0, 6)
      Gx.r(P.rust, x0, 150, 5, 86)
      Gx.r(P.rust, x1 - 5, 150, 5, 86)
      Gx.r(P.brown1, x0, 200, x1 - x0, 36)
      for x = x0 + 12, x1 - 20, 26 do
        Gx.r(P.rust, x, 156, 3, 44)
      end
      Gx.r(P.black, x0 + 10, 236, 14, 6)
      Gx.r(P.black, x1 - 24, 236, 14, 6)
    end
  end,
  draw = function(sc)
    if not State.has("rosary") and not G.flags.rosaryTaken then
      Gx.r(P.brown2, ALTAR_X - 6, 189, 10, 2)
      Gx.px(P.brown2, ALTAR_X - 7, 190)
    end
    if not G.flags.candleTaken then
      Gx.r(P.dk2, ALTAR_X + 30, 184, 8, 8)
      Gx.candle(ALTAR_X + 34, 186, sc.t, not sc.v.dark)
    end
    for i = 0, 2 do Gx.candle(ALTAR_X - 30 + i * 14, 192, sc.t, not sc.v.dark) end
    if not G.flags.battery3 then Gx.r(P.gray2, 1400, FLOOR - 5, 6, 5) Gx.r(P.orange1, 1400, FLOOR - 5, 6, 1) end
  end,
  lights = function(sc)
    if sc.v.dark then return {} end
    return { { ALTAR_X, 186, 160, P.orange2, 0.6 } }
  end,
  setup = function(sc)
    if G.panic > 60 then G.flags.tremble = true end
    if G.flags.depotChase and not G.flags.depotEscaped then
      G.done["depot:t:preacher"] = nil
      G.flags.depotChase = false
    end
  end,
  leave = function(sc) G.flags.tremble = false end,
  update = function(sc, dt)
    if sc.danger then
      local touched = World.updateEnemies(dt)
      if touched then
        sc.danger = false
        World.caught("monastyrskaya", 470, 0.25, function()
          G.done["depot:t:preacher"] = nil
          G.flags.depotChase = false
        end)
      end
      if World.player.x > 1540 and not G.flags.depotEscaped and not Script.blocking() then
        G.flags.depotEscaped = true
        sc.danger = false
        sc.enemies = {}
        Script.run(function()
          talk({
            { L, "Я никогда так не бегал." },
            { D, "Ты не бегал. Ты полз." },
            { L, "Это тоже бег." },
          })
          World.go("monastyrskaya", 900, -1)
        end, true, "escape")
      end
    end
  end,
  enter = function(sc)
    if G.flags.depotEnter then return end
    G.flags.depotEnter = true
    talk({
      { L, "Они что, здесь жили?" },
      { D, "Судя по всему, да." },
      { L, "Давай быстро. Заберём чётки и уйдём." },
    })
  end,
  timers = {
    { id = "preacher", t = 0, cond = function(sc)
      return G.flags.rosaryTaken and not G.flags.depotEscaped and (G.flags.candleTaken or (sc.v.afterRosary and sc.t > sc.v.afterRosary + 8))
    end, fn = depotChase },
  },
  objects = {
    { id = "floor", name = "Рисунки на полу", x = 330, y = 226, w = 60, h = 20, ax = 300,
      cond = function() return not G.flags.depotChase end,
      lines = {
        { D, "Меловые круги. Знаки. Эти, кажется, обозначают участки кладбища." },
        { L, "Значит, они знали." },
        { D, "И использовали." },
      } },
    { id = "altar", name = "Алтарь", x = ALTAR_X - 44, y = 192, w = 30, h = 40, ax = ALTAR_X - 60,
      cond = function() return not G.flags.depotChase end,
      lines = {
        { D, "Кости. Много. Алтарь из чужих могил." },
        { L, "Дима, я не могу." },
        { D, "Просто смотри на меня." },
      },
      after = function(o, sc, first)
        if first then
          State.panic(10)
          if G.panic > 60 then G.flags.tremble = true end
        end
      end },
    { id = "notes", name = "Записки на стене", x = 1088, y = 118, w = 66, h = 26, ax = 1120,
      cond = function() return not G.flags.depotChase end,
      use = function(o, sc)
        World.player.pose = "inspect"
        wait(0.8)
        World.player.pose = "idle"
        if not G.flags.sectNotes then
          G.flags.sectNotes = true
          readDoc("C-1") readDoc("C-2") readDoc("C-3") readDoc("C-4")
        end
        talk({
          { D, "Записки Проповедника. Он писал по порядку. Сначала проповеди, потом оправдания." },
          { L, "И чем всё закончилось?" },
          { D, "Последняя: «Не открывайте седьмой»." },
        })
      end },
    { id = "rosary", name = "Чётки", x = ALTAR_X - 10, y = 184, w = 16, h = 10, ax = ALTAR_X - 20,
      cond = function() return not G.flags.rosaryTaken end,
      use = function(o, sc)
        World.player.pose = "inspect"
        wait(0.9)
        World.player.pose = "idle"
        talk({
          { D, "Чётки. Старые, деревянные." },
          { L, "Только не трогай кости." },
          { D, "Не трону." },
        })
        G.flags.rosaryTaken = true
        sc.v.afterRosary = sc.t
        State.give("rosary")
      end },
    { id = "candle", name = "Толстая восковая свеча", x = ALTAR_X + 28, y = 178, w = 14, h = 16, ax = ALTAR_X + 20,
      cond = function() return not G.flags.candleTaken end,
      use = function(o, sc)
        World.player.pose = "inspect"
        wait(0.9)
        World.player.pose = "idle"
        say(D, "Ещё пригодится.")
        G.flags.candleTaken = true
        State.give("candle")
      end },
    { id = "scheme", name = "Схема Депо", x = 218, y = 108, w = 34, h = 26, ax = 235,
      cond = function() return not G.mapFrag[3] end,
      use = function()
        World.player.pose = "inspect"
        wait(0.9)
        World.player.pose = "idle"
        giveFragment(3)
      end },
    { id = "battery", name = "Батарейка", x = 1396, y = FLOOR - 8, w = 14, h = 10, ax = 1400,
      cond = function() return not G.flags.battery3 end,
      use = function()
        G.flags.battery3 = true
        G.spares = G.spares + 1
        UI.toast("Запасная батарейка", 3)
      end },
    { id = "back", name = "Назад, на «Монастырскую»", x = 0, y = 130, w = 16, h = 102, ax = 10,
      cond = function() return not G.flags.depotChase end,
      exit = { to = "monastyrskaya", x = 900, facing = -1 } },
  },
})

-------------------------------------------------------------- 5.3 Затопленный перегон
reg("flooded", {
  w = 1300, spawn = 30, surface = "water", echo = true, sink = 10, speed = 42,
  ambient = { 0.03, P.blue2 },
  amb = { hum = 0.05, water = 0.35 },
  static = function(sc)
    K.tunnel(sc, { bricks = true, brick = P.dk2 })
    Gx.r(P.water, 0, 200, sc.w, 70)
    Gx.bricks(1250, 40, 50, 166, P.brown2, P.dk1, P.rust)
    -- каска мелом
    for i = 0, 8 do Gx.r(P.white, 1262 + i, 110 - math.floor(math.sqrt(16 - (i - 4) ^ 2) * 2), 1, 1, 0.8) end
    Gx.r(P.white, 1258, 110, 18, 1, 0.8)
  end,
  front = function(sc)
    local t = sc.t
    for y = FLOOR - 10, H, 3 do
      local off = math.sin(t * 2 + y * 0.3) * 3
      Gx.r(P.water, 0, y, sc.w, 3, 0.75)
      Gx.r(P.blue2, off + (y * 37) % 60, y, 30, 1, 0.3)
      for x = 0, sc.w, 90 do Gx.r(P.blue2, x + off + (y * 13) % 40, y, 18, 1, 0.25) end
    end
    if G.light then
      local p = World.player
      for k = 1, 3 do
        local r = (t * 20 + k * 12) % 36
        Gx.r(P.cream, p.x + p.facing * 40 - r, FLOOR - 9, r * 2, 1, 0.25 * (1 - r / 36))
      end
    end
  end,
  enter = function(sc)
    if G.panic > 70 and not G.flags.floodCalm then
      World.leha.manual = true
      World.leha.tx = nil
      UI.toast("Лёха не может войти в воду", 3)
      local n = 0
      while n < 2 or G.panic > 70 do
        local r = choose({ "«Смотри на меня»", "«Не думай про стены»", "«Всё нормально»" }, "Успокоить Лёху")
        if r == 3 then State.panic(5) else State.panic(-15) n = n + 1 end
      end
      G.flags.floodCalm = true
      lehaFollow()
    end
    if not G.flags.floodEnter then
      G.flags.floodEnter = true
      talk({
        { L, "Холодная." },
        { D, "Карандашом «вода». Это здесь." },
      })
    end
  end,
  zones = {
    { id = "knock", x1 = 600, x2 = 2000, fn = function()
      sfx("knock3", 0.9, 1, 1250)
      wait(1.5)
      talk({
        { D, "Слышишь?" },
        { L, "Три удара." },
        { D, "Идём туда." },
      })
    end },
  },
  listen = {
    { id = "knockW", x = 1250, sound = "knock3", every = 4, kind = "good", text = "...три удара... здесь... склад..." },
  },
  objects = {
    { id = "back", name = "Назад, на «Монастырскую»", x = 0, y = 120, w = 16, h = 112, ax = 10,
      exit = { to = "monastyrskaya", x = 30, facing = 1 } },
    { id = "exit", name = "Склад прораба", x = 1210, y = 120, w = 40, h = 112, ax = 1230,
      exit = { to = "laptev_store", x = 40, facing = 1 } },
  },
})

-------------------------------------------------------------- Склад Лаптева
local WALL_X = 520

reg("laptev_store", {
  w = 640, spawn = 40, surface = "water", sink = 4,
  ambient = { 0.04, P.blue2 },
  amb = { hum = 0.04, water = 0.2 },
  static = function(sc)
    Gx.r(P.dk1, 0, 0, sc.w, 40)
    Gx.concrete(0, 40, sc.w, 166, P.gray1, P.dk2, 101)
    K.floor(0, 206, sc.w, P.dk2, P.water)
    Gx.r(P.water, 0, 222, sc.w, 48, 0.7)
    -- стол, лампа, ящик, фото
    Gx.r(P.brown2, 140, 190, 80, 4)
    Gx.r(P.brown1, 144, 194, 3, 30)
    Gx.r(P.brown1, 212, 194, 3, 30)
    Gx.r(P.rust, 150, 180, 8, 10)
    Gx.r(P.gray2, 176, 180, 12, 10)
    Gx.r(P.cream2, 178, 182, 8, 6)
    Gx.r(P.brown1, 240, 210, 30, 18)
    Gx.r(P.gray2, 244, 206, 22, 4)
    -- каска мелом
    for i = 0, 10 do Gx.px(P.white, 330 + i, 100 - math.floor(math.sqrt(25 - (i - 5) ^ 2) * 1.6), 0.8) end
    Gx.r(P.white, 326, 100, 20, 1, 0.8)
  end,
  draw = function(sc)
    if not G.flags.wallBroken then
      Gx.bricks(WALL_X, 40, 120, 166, P.brown2, P.dk1, P.rust)
      for i = 0, 6 do Gx.r(P.water, WALL_X + 10 + i * 15, 60 + (i * 23) % 100, 1, 20, 0.6) end
    else
      Gx.bricks(WALL_X, 40, 120, 50, P.brown2, P.dk1, P.rust)
      Gx.r(P.black, WALL_X + 6, 90, 108, 116)
      for i = 0, 8 do Gx.r(P.brown2, WALL_X + Gx.hash(i, 1) * 110, 200 + Gx.hash(i, 2) * 6, 10, 5) end
      -- скелет в каске, кельма
      Gx.skeleton(WALL_X + 50, 206, true, P.gray1)
      Gx.r(P.rust, WALL_X + 46, 176, 10, 4)
      Gx.r(P.gray2, WALL_X + 64, 196, 8, 2)
      Gx.r(P.rust, WALL_X + 80, 198, 12, 5)
      if sc.v.candle or G.flags.rest_laptev then Gx.candle(WALL_X + 96, 204, sc.t, true) end
    end
    if not G.flags.letterTaken then Gx.r(P.cream, 196, 186, 12, 4) end
    if G.flags.rest_laptev and not G.flags.lNotes then Gx.r(P.brown2, 160, 186, 10, 4) end
  end,
  lights = function(sc)
    if sc.v.candle or G.flags.rest_laptev then return { { WALL_X + 96, 196, 110, P.orange2, 0.6 } } end
    return {}
  end,
  unrest = function(sc) if not G.flags.rest_laptev then return WALL_X end end,
  enter = function(sc) end,
  setup = function(sc)
    if G.flags.wallBroken and not G.flags.rest_laptev then
      sc.actors.LAPTEV = { kind = "helmet", x = WALL_X + 60, y = 130, a = 1, spirit = true, glow = 0.5, glowCol = P.white, gy = 0, h = 20 }
    end
  end,
  timers = {
    { id = "laptev", t = 0, cond = function() return G.flags.letterTaken and not G.flags.wallBroken end, fn = function(sc)
      wait(2)
      sc.actors.LAPTEV = { kind = "helmet", x = WALL_X + 60, y = 130, a = 1, spirit = true, glow = 0.5, glowCol = P.white, gy = 0, h = 20 }
      say(LA, "Слышишь, парень? Не плачь. Сорок третьих мы не оставим. Помоги достать меня. Три удара: туда бей.", { slow = true })
      hint("Кликни по стене", 4)
    end },
  },
  objects = {
    { id = "photo", name = "Стол прораба", x = 170, y = 176, w = 22, h = 16, ax = 170,
      lines = {
        { D, "Стол прораба. Фото. Мужчина с женщиной." },
        { L, "Это он?" },
        { D, "Пётр Лаптев. «Нине от Пети»." },
      } },
    { id = "letter", name = "Письмо в конверте", x = 194, y = 182, w = 16, h = 10, ax = 196,
      cond = function() return not G.flags.letterTaken end,
      use = function(o, sc)
        World.player.pose = "inspect"
        wait(0.9)
        World.player.pose = "idle"
        say(D, "Письмо. Он написал его, когда понял, что не выйдет.")
        G.flags.letterTaken = true
        State.give("letter")
        readDoc("L-5")
      end },
    { id = "wall", name = "Кирпичная стена", x = WALL_X, y = 40, w = 120, h = 166, ax = WALL_X - 16,
      cond = function() return not G.flags.wallBroken end,
      use = function(o, sc)
        if not G.flags.letterTaken or not sc.actors.LAPTEV then
          World.examine({ id = "wall", name = "Кирпичная стена", lines = { { D, "Стена кирпичная, влажная. Из неё сочится вода." } } })
          return
        end
        local ok = UI.bricksGame()
        if ok then
          G.flags.wallBroken = true
          shake(3, 0.8)
          wait(1)
          State.note("n:laptev", "За стеной: скелет в каске, в руке кельма. Ржавая каска «П.С. Лаптев».")
          UI.toast("За стеной — ниша. Каска «П.С. Лаптев»", 4)
        end
      end },
    { id = "remains", name = "Каска «П.С. Лаптев»", x = WALL_X + 30, y = 160, w = 70, h = 46, ax = WALL_X + 10,
      cond = function() return G.flags.wallBroken end,
      use = function(o, sc)
        if G.flags.rest_laptev then
          restAt(sc, WALL_X - 10)
          wait(1.5)
          standUp()
          return
        end
        Rituals.laptev(sc)
      end },
    { id = "notes", name = "Тетрадь прораба", x = 156, y = 182, w = 16, h = 10, ax = 160,
      cond = function() return G.flags.rest_laptev and not G.flags.lNotes end,
      use = function()
        G.flags.lNotes = true
        readDoc("L-1") readDoc("L-2") readDoc("L-3") readDoc("L-4")
      end },
    { id = "back", name = "Назад, в перегон", x = 0, y = 120, w = 16, h = 112, ax = 10,
      exit = { to = "flooded", x = 1200, facing = -1 } },
    { id = "passage", name = "Новый проход", x = WALL_X + 100, y = 90, w = 20, h = 116, ax = WALL_X + 108,
      cond = function() return G.flags.wallBroken end,
      exit = { to = "glow_tunnel", x = 30, facing = 1, pre = function() G.flags.act5lip = true end } },
  },
})

-------------------------------------------------------------- 5.4 Тоннель к «Липовой»: светящиеся ладошки
reg("glow_tunnel", {
  w = 700, spawn = 30, surface = "concrete",
  ambient = { 0.03, P.blue2 },
  amb = { hum = 0.05 },
  static = function(sc)
    Gx.r(P.black, 0, 0, sc.w, H)
    Gx.concrete(0, 110, sc.w, 96, P.dk2, P.gray1, 111)
    K.floor(0, 206, sc.w, P.dk2, P.dk1)
    Gx.r(P.black, 660, 120, 40, 112)
  end,
  draw = function(sc)
    for i = 0, 24 do
      local x = 40 + i * 25
      local y = 166 + Gx.hash(i, 3) * 10
      local a = 0.6 + 0.4 * math.sin(sc.t * 2 + i)
      Gx.r(P.blue3, x, y, 3, 3, a)
      for f = 0, 3 do Gx.px(P.blue3, x - 1 + f, y - 2, a) end
    end
    -- мокрые следы босых ног
    for i = 0, 12 do Gx.r(P.water, 60 + i * 48, 224 + (i % 2) * 4, 4, 2) end
  end,
  lights = function(sc)
    local t = {}
    for i = 0, 24, 4 do t[#t + 1] = { 40 + i * 25, 168, 40, P.blue3, 0.25 } end
    return t
  end,
  objects = {
    { id = "exit", name = "К «Липовой»", x = 660, y = 120, w = 40, h = 112, ax = 680,
      exit = { to = "lipovaya", x = 1020, facing = -1 } },
    { id = "back", name = "Назад", x = 0, y = 120, w = 16, h = 112, ax = 10,
      exit = { to = "laptev_store", x = 600, facing = -1 } },
  },
})

-------------------------------------------------------------- 5.5 Лёха начинает меняться
reg("tunnel_pokr", {
  w = 1300, spawn = 30, surface = "gravel", echo = true,
  ambient = { 0.025, P.blue2 },
  amb = { hum = 0.05, choir = 0.3 },
  static = function(sc) K.tunnel(sc, {}) Gx.r(P.black, 1260, 130, 40, 102) end,
  setup = function(sc)
    World.leha.slow = true
  end,
  update = function(sc, dt)
    local l = World.leha
    l.eyesRed = G.panic > 40 or (math.sin(sc.t * 3) > 0.9)
  end,
  zones = {
    { id = "names", x1 = 300, x2 = 2000, fn = function()
      talk({
        { L, "Я слышу их." },
        { D, "Кого?" },
        { L, "Имена. Они хотят, чтобы их назвали. Сорок три. Дима, они повторяют имена." },
        { D, "Ты в порядке?" },
        { L, "Я не знаю. Я устал. Мне кажется, что я не один в своей голове." },
      })
      if G.panic > 70 then
        say(L, "Пусть идут за мной.", { shaky = true })
        G.flags.possessStrong = true
      end
      G.act = 6
    end },
  },
  objects = {
    { id = "exit", name = "«Покровская»", x = 1260, y = 130, w = 40, h = 102, ax = 1280,
      cond = function() return G.act >= 6 end,
      exit = { to = "pokrovskaya", x = 40, facing = 1 } },
  },
})
