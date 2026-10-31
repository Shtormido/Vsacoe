-- АКТ 6. «Участок 7» (85:00–100:00): «Покровская», развилка, финальный ритуал
local K = require("src.scenes.common")
local reg = World.register

local PLATE_X, GATE_X = 640, 1180

-------------------------------------------------------------- 43 имени
local NAMES = {
  "Анна", "Агафья", "Василий", "Дарья", "Евфимия", "Ефросинья", "Иван", "Мария Петровна", "Прасковья", "Степан",
  "Акулина", "Аксинья", "Алексей", "Анисья", "Антип", "Варвара", "Василиса", "Гавриил", "Глафира", "Григорий",
  "Евдоким", "Екатерина", "Елизавета", "Емельян", "Зиновий", "Илья", "Ирина", "Кузьма", "Лукерья", "Марфа",
  "Матрёна", "Митрофан", "Наталья", "Никифор", "Пелагея", "Пётр", "Савва", "Серафима", "Татьяна", "Устинья",
  "Фёкла", "Фома", "Неизвестная",
}
local DECOY = { "Аглая", "Анфиса", "Валентина", "Дмитрий", "Евгения", "Ефим", "Игнат", "Марина", "Прохор", "Степанида",
  "Акилина", "Ксения", "Алевтина", "Антонина", "Арина", "Вера", "Виктор", "Геннадий", "Галина", "Георгий",
  "Елисей", "Есения", "Зинаида", "Иннокентий", "Инна", "Клавдия", "Лука", "Мавра", "Мирон", "Надежда",
  "Никита", "Павел", "Полина", "Семён", "Софья", "Тихон", "Ульяна", "Фаина", "Фрол", "Безымянная", "Забытая" }

local function mask(name)
  local out = {}
  local n = U.ulen(name)
  for i = 1, n do
    local ch = U.usub(name, i, i)
    if ch == " " or i == 1 or i == n or i % 2 == 0 then out[#out + 1] = ch else out[#out + 1] = "_" end
  end
  return table.concat(out)
end

local function buildNames()
  local list = {}
  for i, nm in ipairs(NAMES) do
    local pool = {}
    for _, d in ipairs(DECOY) do if d ~= nm and mask(d) ~= mask(nm) then pool[#pool + 1] = d end end
    for _, d in ipairs(NAMES) do if d ~= nm and mask(d) ~= mask(nm) then pool[#pool + 1] = d end end
    U.shuffle(pool)
    local card = mask(nm)
    if nm == "Неизвестная" then card = "Неизв_стная, 20 лет" pool = { "Безымянная", "Забытая" } end
    list[i] = { answer = nm, card = card, options = U.shuffle({ nm, pool[1], pool[2] }) }
  end
  return list
end

-- светлые силуэты помощников
local function lightFigure(a, sc)
  if a.who == "evd" then Gx.evdokia(a.x, FLOOR, sc.t, a.a)
  elseif a.who == "alesha" then Gx.alesha(a.x, FLOOR, sc.t, a.a, true)
  else
    Gx.laptevFigure(a.x, FLOOR, sc.t, a.a, -1)
  end
end

-------------------------------------------------------------- финальный ритуал
local function readSegment(sc, list, from, to)
  local i = from
  while i <= to do
    local res, idx = UI.namesGame(list, i, to)
    sc.v.named = idx - 1
    if res == "ok" then return end
    -- три ошибки: просыпается у свечи, читает с последнего правильного имени
    i = idx
    Audio.play("caught", 0.6)
    fadeOut(1.2)
    wait(0.6)
    fadeIn(1.0)
    hint("Ты очнулся у свечи. Читай дальше с последнего имени", 4)
  end
end

local function finalRitual(sc)
  G.flags.finalRitual = true
  sc.v.candlePlate = true
  sc.v.named = 0
  sc.actors.F1 = { kind = "fig", who = "evd", x = PLATE_X - 70, a = 0, draw = lightFigure, spirit = true, glow = 0.5, glowCol = P.white, gy = 30 }
  sc.actors.F2 = { kind = "fig", who = "laptev", x = PLATE_X - 100, a = 0, draw = lightFigure, spirit = true, glow = 0.5, glowCol = P.white, gy = 30 }
  sc.actors.F3 = { kind = "fig", who = "alesha", x = PLATE_X - 130, a = 0, draw = lightFigure, spirit = true, glow = 0.4, glowCol = P.white, gy = 20 }
  for i = 1, 20 do
    for _, k in ipairs({ "F1", "F2", "F3" }) do sc.actors[k].a = i / 20 end
    wait(0.06)
  end
  sc.actors.PREACHER.x = PLATE_X + 90
  Audio.amb("sing", 0.2, 0.2)
  wait(0.8)
  say(D, "Мария Петровна. Ефросинья. Иван. Прасковья. Степан...")
  local list = buildNames()
  readSegment(sc, list, 1, 15)
  World.leha.pose = "kneel"
  talk({
    { L, "Они говорят спасибо." },
    { D, "Продолжаем." },
  })
  readSegment(sc, list, 16, 34)
  -- Проповедник сопротивляется
  say(PR, "Не смейте! Я их нашёл первым!", { shaky = true })
  say(EV, "Они не твои. Они Божьи.", { at = { PLATE_X - 70, FLOOR - 52 } })
  sfx("collapse", 1)
  shake(3, 1.2)
  sc.v.wallOpen = true
  wait(1.2)
  local pr = sc.actors.PREACHER
  sc.actors.DUST = { kind = "dust", x = pr.x, y = FLOOR, t = 0, a = 1, col = P.brown2 }
  sc.actors.PREACHER = nil
  for i = 1, 30 do sc.actors.DUST.t = i / 10 sc.actors.DUST.a = 1 - i / 30 wait(0.05) end
  sc.actors.DUST = nil
  readSegment(sc, list, 35, 43)
  sc.v.named = 43
  say(D, "Сорок третий. Неизвестная. Мы запомним тебя.")
  wait(1)
  Audio.silenceAll(0.8)
  wait(1.5)
  World.leha.pose = "idle"
  World.leha.eyesRed = false
  G.flags.freed = true
  talk({
    { L, "Дима... я снова я." },
    { D, "Да. Пошли." },
  })
  G.flags.rest_pit = true
  sc.v.escalator = true
  sfx("bell", 0.4)
  wait(2.5)
  fadeOut(1.5)
  Dialog.clear()
  World.enter("escalator")
  fadeIn(1.0)
end

-------------------------------------------------------------- «Покровская»
reg("pokrovskaya", {
  cold = true, wallProps = false,
  w = 1300, spawn = 40, surface = "tile", echo = true,
  ambient = { 0.035, P.blue2 },
  amb = { hum = 0.0, choir = 0.35 },
  static = function(sc)
    Gx.r(P.black, 0, 0, sc.w, H)
    -- высокие своды с росписью (лики стёрты)
    for x = 0, sc.w, 160 do
      for i = 0, 40 do
        local y = 40 - math.floor(math.sqrt(i * 40))
        Gx.r(P.dk2, x + i * 2, y, 2, 6)
        Gx.r(P.dk2, x + 160 - i * 2, y, 2, 6)
      end
      Gx.r(P.cream2, x + 64, 40, 32, 30, 0.25)
      Gx.r(P.violet1, x + 72, 44, 16, 16, 0.3)
    end
    Gx.tiles(0, 50, sc.w, 156, 12, 7, P.gray2, P.gray1, 0.15)
    K.tileArt("vault", 0, sc.w, 1, 64)
    -- лик святого над плитой: лицо стёрто
    local mos = K.art("mosaic")
    if mos then
      local mx, my = PLATE_X - 73, 60
      love.graphics.setColor(0.85, 0.85, 0.9, 0.9)
      love.graphics.draw(mos, mx, my)
      for y = my + 28, my + 52 do
        for x = mx + 47, mx + 66 do
          if Gx.hash(x, y) < 0.75 then Gx.px((Gx.hash(y, x) > 0.5) and P.gray2 or P.gray1, x, y, 1) end
        end
      end
    end
    for x = 60, sc.w, 160 do
      K.column(x, 50, 232, P.gray2, P.gray1, P.dk2)
      Gx.r(P.gray1, x - 14, 50, 46, 6)
    end
    -- кирпичные кресты вдоль стены
    for x = 140, sc.w - 100, 160 do
      Gx.r(P.rust, x + 4, 80, 6, 30)
      Gx.r(P.rust, x - 4, 88, 22, 6)
    end
    K.floor(0, 206, sc.w, P.gray1, P.dk2)
    -- главная арка и плита
    Gx.r(P.dk2, PLATE_X - 90, 70, 180, 8)
    Gx.r(P.gray1, PLATE_X - 46, 216, 92, 12)
    Gx.r(P.gray2, PLATE_X - 46, 216, 92, 2)
    Gx.text("1954 г.", PLATE_X - 14, 218, P.dk2)
    for x = PLATE_X - 60, PLATE_X + 60, 8 do Gx.r(P.rust, x, 196, 2, 34) end
    Gx.r(P.rust, PLATE_X - 60, 196, 122, 2)
    -- шахта Н-4
    Gx.r(P.dk1, GATE_X - 4, 110, 48, 122)
    Gx.r(P.black, GATE_X, 114, 40, 118)
    for y = 120, 228, 8 do Gx.r(P.gray1, GATE_X + 12, y, 16, 1) end
    -- эскалатор
    Gx.r(P.dk1, 120, 140, 70, 92)
    for i = 0, 10 do Gx.r(P.gray1, 124 + i * 6, 228 - i * 8, 6, 2) end
  end,
  draw = function(sc)
    -- трещины плиты
    Gx.line(P.black, PLATE_X - 30, 217, PLATE_X - 10, 227)
    Gx.line(P.black, PLATE_X + 5, 216, PLATE_X + 25, 226)
    -- имена мелом появляются по мере ритуалов
    if G.flags.rest_alesha then Gx.text("Алексей Миронов", 260, 120, P.white, 0.8) end
    if G.flags.rest_evd then Gx.text("Евдокия", 430, 120, P.white, 0.8) end
    if G.flags.rest_laptev then Gx.text("П.С. Лаптев", 900, 120, P.white, 0.8) end
    -- решётка Н-4
    if not sc.v.gateOpen then
      for x = GATE_X, GATE_X + 40, 5 do Gx.r(P.gray2, x, 114, 1, 118) end
    end
    -- три огня у плиты
    if sc.v.fires then
      if G.flags.rest_evd then Gx.candle(PLATE_X - 30, 214, sc.t, true) end
      if G.flags.rest_laptev then Gx.candle(PLATE_X, 214, sc.t, true) end
      if G.flags.rest_alesha then Gx.candle(PLATE_X + 30, 214, sc.t, true) end
    end
    if sc.v.candlePlate then Gx.candle(PLATE_X, 216, sc.t, true) end
    if sc.v.wallOpen then
      Gx.r(P.black, 980, 150, 40, 56)
      Gx.skeleton(1000, 206, true, P.brown1)
    end
    if sc.v.escalator then
      for i = 0, 10 do Gx.r(P.yellow, 124 + i * 6, 226 - i * 8, 6, 1, 0.8) end
    end
  end,
  front = function(sc)
    -- туман над плитой и серые фигуры без лиц
    local left = 43 - (sc.v.named or 0)
    if G.flags.rest_pit then left = 0 end
    local t = sc.t
    local shown = math.min(12, math.ceil(left / 3.6))
    for i = 1, shown do
      local x = PLATE_X - 90 + ((i * 47 + t * 6) % 180)
      Gx.nameless(x, 214 - (i % 3) * 3, t + i, 0.35, (i % 4) + 1)
    end
    for i = 0, 40 do
      local x = PLATE_X - 110 + ((i * 29 + t * (5 + i % 5)) % 220)
      local y = 196 + math.sin(t + i) * 6
      Gx.r(P.gray3, x, y, 14, 2, 0.12 * (left / 43 + 0.2))
    end
  end,
  lights = function(sc)
    local t = {}
    if sc.v.fires or sc.v.candlePlate then t[#t + 1] = { PLATE_X, 210, 140, P.orange2, 0.7 } end
    if sc.v.gateOpen then t[#t + 1] = { GATE_X + 20, 140, 80, P.blue3, 0.35 } end
    if sc.v.escalator then t[#t + 1] = { 155, 190, 120, P.yellow, 0.6 } end
    return t
  end,
  unrest = function(sc) if not G.flags.rest_pit then return PLATE_X end end,
  enter = function(sc)
    if G.flags.pokEnter then return end
    G.flags.pokEnter = true
    G.flags.grave_pit = true
    talk({
      { D, "Это «Покровская». Участок семь." },
      { L, "Здесь тихо." },
      { D, "Слишком тихо." },
    })
  end,
  timers = {
    { id = "possess", t = 35, fn = function(sc) sc.v.possessGo = true end },
  },
  update = function(sc, dt)
    if (sc.v.possessGo or G.seen["pokrovskaya:plate"]) and not G.flags.possessed and not Script.blocking() and G.flags.pokEnter then
      G.flags.possessed = true
      Script.run(function() sc.def.possession(sc) end, true, "possess")
    end
  end,
  possession = function(sc)
    wait(1.5)
    local l = World.leha
    l.eyesRed = true
    l.manual = true
    talk({
      { L, "Мы хотим наружу. Мы так долго ждали.", { shaky = true } },
      { D, "Лёха?" },
      { CH, "Нас сорок три. У нас нет имён.", { shaky = true } },
    })
    if G.panic > 70 or G.flags.possessStrong then
      -- полностью теряется на 20 секунд и идёт к плите
      l.tx = PLATE_X - 50
      l.slow = true
      wait(20)
      l.tx = World.player.x - 26
      waitUntil(function() return l.tx == nil end)
    end
    sc.actors.PREACHER = { kind = "preacher", x = PLATE_X + 40, y = FLOOR, a = 0, h = 66, facing = -1 }
    for i = 1, 20 do sc.actors.PREACHER.a = i / 20 wait(0.05) end
    talk({
      { PR, "Они мои. Они пели в моём хоре. Я не отдам вам их." },
      { D, "Они не твои. Они чьи-то дети, матери, отцы." },
      { PR, "Они мои. Я нашёл их первым.", { quiet = true } },
    })
    -- 6.2 Развилка
    sc.v.gateOpen = true
    sfx("thud", 0.6, 0.7, GATE_X)
    Audio.amb("wind", 0.12, 0.2)
    sc.v.fires = true
    talk({
      { CH, "Уходите. Мы вас отпустим. Не трогайте нас больше. Оставьте нас в покое.", { shaky = true } },
      { D, "Лёх, послушай. Это не ты говоришь." },
      { L, "Дима, я не хочу... я хочу уйти. Пожалуйста. Давай уйдём." },
    })
    local ready = G.trust >= 3 and State.has("act7")
    while true do
      local r = choose({
        "Уйти",
        { text = "Остаться", disabled = not ready, onDisabled = function()
          Dialog.push(D, "Мы не готовы. Нам нечего им дать.")
        end },
      })
      if r == 1 then
        lehaFollow()
        fadeOut(1.5)
        Dialog.clear()
        World.enter("climb_n4")
        fadeIn(1.0)
        return
      elseif r == 2 then
        finalRitual(sc)
        return
      end
    end
  end,
  objects = {
    { id = "plate", name = "Бетонная плита", x = PLATE_X - 46, y = 196, w = 92, h = 34, ax = PLATE_X - 70,
      lines = {
        { D, "Бетонная плита. Подписано: «1954 г.». Трещины свежие." },
        { L, "Они там. Дима, они зовут меня." },
        { D, "Лёх, смотри на меня. Только на меня." },
      } },
  },
})
