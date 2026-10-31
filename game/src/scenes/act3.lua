-- АКТ 3. «Странности» (25:00–42:00)
local K = require("src.scenes.common")
local reg = World.register

-------------------------------------------------------------- 3.1 Часы и 3.2 Компас
local function compassEvent()
  if G.flags.compassDown or not G.flags.watchStopped then return end
  G.flags.compassDown = true
  G.flags.compassShown = true
  Script.run(function()
    talk({
      { D, "Компас дрожит." },
      { L, "Магнитная аномалия." },
      { D, "Он не просто дрожит. Он показывает вниз." },
      { L, "Вниз?" },
      { D, "Стрелка уходит за край." },
      { L, "Аномалия на метро. Конечно. Что ещё." },
    })
    strange(1)
  end, true, "compass")
end

reg("clock_platform", {
  w = 1000, spawn = 30, surface = "tile", echo = true,
  ambient = { 0.04, P.blue2 },
  amb = { hum = 0.15 },
  static = function(sc)
    K.station(sc, { wall = P.gray2, grout = P.gray1, band = P.dk2, floor = P.gray1 })
    for x = 100, sc.w - 60, 150 do K.column(x, 30, 232, P.gray2, P.gray1, P.dk2) end
    Gx.r(P.dk1, 519, 40, 2, 16)
    Gx.clock(520, 66, 3, 17, 9)
    Gx.r(P.dk1, 740, 34, 10, 6)
    Gx.r(P.black, 960, 140, 40, 92)
  end,
  draw = function(sc)
    local on = (sc.t % 2) < 0.15
    Gx.r(on and P.cream or P.gray1, 742, 40, 6, 3)
  end,
  lights = function(sc)
    if (sc.t % 2) < 0.15 then return { { 745, 44, 120, P.cream, 0.5 } } end
    return {}
  end,
  onMap = function(sc) compassEvent() end,
  timers = {
    { id = "watch", t = 4, fn = function()
      G.flags.watchStopped = true
      World.player.pose = "inspect"
      wait(0.6)
      World.player.pose = "idle"
      talk({
        { D, "Мои встали." },
        { L, "Батарейка?" },
        { D, "Три семнадцать. Смотри на свои." },
        { L, "Телефон тоже. Три семнадцать. И сети нет." },
      })
      strange(1)
      G.flags.compassShown = true
    end },
    { id = "compass", t = 30, cond = function() return G.flags.watchStopped and not G.flags.compassDown end, fn = function()
      compassEvent()
    end },
  },
  objects = {
    { id = "clock", name = "Станционные часы", x = 508, y = 54, w = 24, h = 24, ax = 520,
      lines = {
        { D, "Эти тоже. Три семнадцать." },
        { L, "Совпадение." },
        { D, "Помнишь часы на «Северной»? Одиннадцать сорок." },
        { L, "Помню." },
        { D, "Кто-то ставил." },
        { L, "Или кто-то хочет, чтобы мы так думали." },
      },
      after = function(o, sc, first)
        if first then
          State.panic(5)
          strange(6, true)
        end
      end },
    { id = "compass", name = "Компас", x = 0, y = 0, w = 0, h = 0, cond = function() return false end },
    { id = "back", name = "Назад", x = 0, y = 140, w = 16, h = 92, ax = 10,
      exit = { to = "cable_tunnel", x = 1270, facing = -1 } },
    { id = "exit", name = "В переход", x = 960, y = 140, w = 40, h = 92, ax = 980,
      cond = function() return G.flags.watchStopped end,
      exit = { to = "hands_passage", x = 30, facing = 1 } },
  },
  mousepressed = function(sc, x, y, b)
    -- клик по компасу в HUD
    if b == 1 and G.flags.compassShown and math.abs(x - (W - 46)) < 8 and math.abs(y - 9) < 8 then
      compassEvent()
      return true
    end
  end,
})

-------------------------------------------------------------- 3.3 Ладошки и 3.4 Станции не по порядку
reg("hands_passage", {
  wallTop = 130,
  w = 900, spawn = 30, surface = "concrete", echo = false,
  ambient = { 0.035, P.blue2 },
  amb = { hum = 0.12, drone = 0.25 },
  static = function(sc)
    Gx.r(P.black, 0, 0, sc.w, H)
    Gx.r(P.dk1, 0, 110, sc.w, 16)
    Gx.concrete(0, 126, sc.w, 80, P.gray1, P.dk2, 31)
    K.floor(0, 206, sc.w, P.dk2, P.dk1)
    -- влажные отпечатки детских ладоней цепочкой
    for i = 0, 30 do
      local x = 80 + i * 22 + Gx.hash(i, 1) * 6
      local y = 168 + Gx.hash(i, 2) * 8
      Gx.r(P.dk1, x, y, 3, 3, 0.9)
      for f = 0, 3 do Gx.px(P.dk1, x - 1 + f, y - 2, 0.9) end
      Gx.px(P.dk1, x + 3, y, 0.9)
    end
    for i = 1, 20 do Gx.r(P.water, Gx.hash(i, 61) * sc.w, 220 + Gx.hash(i, 62) * 10, 2, 1) end
    Gx.r(P.black, 860, 120, 40, 112)
  end,
  draw = function(sc)
    -- мерцающая табличка
    if Gx.hash(math.floor(sc.t * 6), 1) > 0.3 then
      Gx.r(P.blue2, 800, 132, 96, 12)
      Gx.text("МОНАСТЫРСКАЯ", 804, 132, P.white)
    end
  end,
  lights = function(sc)
    if Gx.hash(math.floor(sc.t * 6), 1) > 0.3 then return { { 848, 140, 70, P.blue3, 0.35 } } end
    return {}
  end,
  zones = {
    { id = "enter", x1 = 40, x2 = 2000, fn = function()
      talk({
        { L, "Что это?" },
        { D, "Ладони. Влажные." },
        { L, "Надо быть очень низким, чтобы оставить такие отпечатки." },
        { D, "Или маленьким." },
      })
    end },
    { id = "sign", x1 = 640, x2 = 2000, fn = function()
      talk({
        { D, "Монастырская. Но по карте дальше должна быть «Центральная»." },
        { L, "Карта врёт." },
        { D, "Или тоннели." },
        { L, "Тоннели не врут. Они просто идут." },
        { D, "Тогда указатели." },
      })
      G.flags.mapLies = true
      strange(1)
      hint("C: метка мелом на стене. Пригодится, когда карта врёт", 7)
    end },
  },
  objects = {
    { id = "hand", name = "Отпечаток ладони", x = 300, y = 160, w = 30, h = 20, ax = 300,
      lines = {
        { D, "Отпечаток свежий. Но влага не стекает. Стоит на месте." },
        { L, "Дима, давай вернёмся." },
        { D, "Мы идём уже сорок минут. Назад столько же." },
        { L, "Давай хотя бы не трогать." },
        { D, "Я и не трогаю. Просто смотрю." },
      },
      after = function(o, sc, first)
        if first then
          State.panic(5)
          strange(1)
        end
      end },
    { id = "back", name = "Назад", x = 0, y = 120, w = 16, h = 112, ax = 10,
      exit = { to = "clock_platform", x = 975, facing = -1 } },
    { id = "exit", name = "На «Монастырскую»", x = 860, y = 120, w = 40, h = 112, ax = 880,
      cond = function() return G.flags.mapLies end,
      exit = { to = "monastyrskaya", x = 30, facing = 1 } },
  },
})

-------------------------------------------------------------- 3.5 / 5.1 «Монастырская»
local DOOR_X, NICHE_X = 640, 420

local function act5m() return G.flags.krotsDone end

reg("monastyrskaya", {
  wallProps = false,
  w = 1000, spawn = 30, surface = "tile", echo = true,
  ambient = { 0.04, P.blue2 },
  amb = { hum = 0.1 },
  static = function(sc)
    Gx.r(P.dk1, 0, 0, sc.w, 34)
    -- своды с остатками росписи
    for x = 0, sc.w, 100 do
      for i = 0, 20 do Gx.r(P.gray1, x + i * 2, 34 - math.floor(math.sqrt(i * 20)), 2, 4) end
    end
    for i = 1, 8 do Gx.stain(Gx.hash(i, 71) * sc.w, 22, 18, 8, P.violet1, 0.35, i + 70) end
    Gx.tiles(0, 34, sc.w, 114, 10, 6, P.green3, P.green2, 0.08)
    -- рельефные кресты, которые герои считают узором
    for x = 30, sc.w, 60 do
      Gx.r(P.green2, x, 60, 2, 12)
      Gx.r(P.green2, x - 4, 64, 10, 2)
    end
    Gx.r(P.black, 0, 148, sc.w, 46)
    Gx.r(P.rust, 0, 180, sc.w, 2)
    Gx.r(P.gray1, 0, 194, sc.w, 4)
    Gx.r(P.green2, 0, 198, sc.w, 3)
    K.floor(0, 201, sc.w, P.gray1, P.dk2)
    -- служебная дверь на другой стороне путей
    Gx.r(P.dk1, DOOR_X - 2, 96, 26, 52)
    Gx.r(P.black, DOOR_X, 98, 22, 50)
    for x = 120, sc.w - 40, 140 do K.column(x, 34, 232, P.green3, P.green2, P.green1) end
    -- ниша Евдокии: облупленная штукатурка, кирпич с именем
    Gx.r(P.gray2, NICHE_X - 4, 150, 42, 56)
    Gx.r(P.dk2, NICHE_X, 154, 34, 50)
    Gx.bricks(NICHE_X + 4, 160, 26, 30, P.rust, P.dk1, P.brown2)
    Gx.r(P.black, 960, 140, 40, 92)
    Gx.r(P.black, 0, 140, 6, 92)
  end,
  draw = function(sc)
    if sc.v.face and sc.v.face > 0 then
      Gx.r(P.bone, DOOR_X + 7, 112, 8, 10, 0.9)
      Gx.r(P.black, DOOR_X + 5, 108, 12, 5)
      Gx.r(P.black, DOOR_X + 5, 108, 2, 16)
      Gx.r(P.black, DOOR_X + 15, 108, 2, 16)
      Gx.px(P.dk1, DOOR_X + 9, 116) Gx.px(P.dk1, DOOR_X + 12, 116)
    end
    if sc.v.tileFall then
      local f = sc.v.tileFall
      Gx.r(P.green3, f.x, f.y, 8, 5)
    end
    if G.flags.rest_evd then
      Gx.candle(NICHE_X + 17, 202, sc.t, true)
    end
    if G.flags.tilePlaced then Gx.r(P.gray2, NICHE_X + 8, 194, 18, 8) end
  end,
  lights = function(sc)
    local t = {}
    if G.flags.rest_evd then t[#t + 1] = { NICHE_X + 17, 194, 110, P.orange2, 0.7 } end
    if act5m() and not G.flags.rest_evd then t[#t + 1] = { NICHE_X + 17, 190, 80, P.orange1, 0.15 } end
    return t
  end,
  unrest = function(sc) if act5m() and not G.flags.rest_evd then return NICHE_X end end,
  setup = function(sc)
    if act5m() then
      Audio.amb("sing", G.flags.rest_evd and 0 or 0.35, 0.2)
      sc.ambient = G.flags.rest_evd and { 0.1, P.cream } or { 0.06, P.orange1 }
      if G.flags.evdShown and not G.flags.rest_evd then
        sc.actors.EVD = { kind = "evd", x = DOOR_X + 11, y = 148, a = 0.9, spirit = true, glow = 0.6, glowCol = P.orange2, gy = 30, h = 50 }
      end
    end
  end,
  update = function(sc, dt)
    if sc.v.face and sc.v.face > 0 then
      sc.v.face = sc.v.face - dt
      if World.inCone(DOOR_X + 11, 116) then sc.v.face = 0 end
    end
    if sc.v.tileFall then
      local f = sc.v.tileFall
      f.vy = (f.vy or 0) + dt * 400
      f.y = f.y + f.vy * dt
      if f.y > FLOOR - 4 then sc.v.tileFall = nil end
    end
  end,
  zones = {
    -- Акт 3: «Почти храм» и первый настоящий скример
    { id = "enter", x1 = 60, x2 = 2000, cond = function() return not act5m() end, fn = function(sc)
      talk({
        { D, "Красиво. Почти храм." },
        { L, "Только без свечей." },
      })
      Audio.silenceAll(1.5)
    end },
    -- Акт 5: тепло и воск
    { id = "enter5", x1 = 60, x2 = 2000, cond = function() return act5m() end, fn = function(sc)
      talk({
        { D, "Здесь теплее, чем везде." },
        { L, "И пахнет свечами." },
        { D, "Давно такого запаха не слышал." },
      })
      State.objective("evd", "Вернуть плиту сестре (Монастырская)")
      hint("Q: послушай стены", 5)
    end },
  },
  timers = {
    { id = "scare", t = function(sc)
      local k = "monastyrskaya:z:enter"
      if G.done[k] and not act5m() then return (sc.v.enterT or sc.t) + 60 end
      return nil
    end, cond = function() return not act5m() end, fn = function(sc)
      sc.v.tileFall = { x = World.player.x - 50, y = 30 }
      sfx("crash", 1, 1, World.player.x - 50)
      shake(2, 0.4)
      wait(0.4)
      local p = World.player
      p.facing = -1
      say(L, "Чёрт возьми! Ты видел?")
      say(D, "Плитка. Просто плитка.")
      wait(2)
      sc.v.face = 0.4
      sfx("inhale", 0.6, 1.1, DOOR_X)
      sfx("sting", 0.5)
      wait(0.8)
      talk({
        { D, "Ты видел?" },
        { L, "Что?" },
        { D, "Ничего." },
      })
      State.panic(10)
      strange(9, true)
      G.flags.monScare = true
      Audio.resumeMusic(0.1)
      Audio.amb("hum", 0.12, 0.2)
      Audio.amb("drone", 0.25, 0.2)
    end },
    { id = "evdAppear", t = 28, cond = function() return act5m() and G.flags.evdHeard and not G.flags.evdShown end, fn = function(sc)
      G.flags.evdShown = true
      G.flags.grave_evd = true
      sc.actors.EVD = { kind = "evd", x = DOOR_X + 11, y = 148, a = 0, spirit = true, glow = 0.6, glowCol = P.orange2, gy = 30, h = 50 }
      for i = 1, 25 do sc.actors.EVD.a = i / 25 * 0.9 wait(0.06) end
      talk({
        { L, "Это то лицо, которое ты видел?" },
        { D, "Да. Я думал, она враг." },
        { L, "А она просто просит." },
      })
    end },
  },
  listen = {
    { id = "evd", x = NICHE_X, sound = "whisper", pitch = 1.3, every = 3.5, kind = "good",
      text = "Верни... плиту... Помяни... имя...",
      cond = function() return act5m() end,
      onRecord = function(sc)
        if G.flags.evdHeard then return end
        G.flags.evdHeard = true
        talk({
          { EV, "Верни... плиту... Помяни... имя...", { at = { NICHE_X + 17, 140 }, slow = true } },
          { L, "Дима, она говорит с нами." },
          { D, "Да. И она не злая." },
        })
        State.voice("E-2", "Тропарь без слов. Слова: «упокой», «имя», «свеча».")
        State.doc("E-2")
        if not G.flags.evdShown then sc.t = math.max(sc.t, 27.5) end
      end },
  },
  objects = {
    { id = "niche", name = "Ниша в стене", x = NICHE_X, y = 150, w = 34, h = 56, ax = NICHE_X - 8,
      cond = function() return act5m() end,
      use = function(o, sc)
        if G.flags.rest_evd then
          say(D, "Свеча горит ровно.")
          return
        end
        if not G.flags.nicheSeen then
          G.flags.nicheSeen = true
          World.player.pose = "inspect"
          wait(0.9)
          World.player.pose = "idle"
          talk({
            { D, "Ниша размером с гроб. Здесь она лежала. Лёх, плиту." },
            { L, "Держи." },
          })
          G.flags.tilePlaced = true
          State.note("n:evdniche", "Ниша на «Монастырской» размером с гроб. Плита Евдокии лежит в ней.")
        end
        Rituals.evdokia(sc)
      end },
    { id = "candleRest", name = "Свеча Евдокии: отдохнуть", x = NICHE_X + 40, y = 196, w = 30, h = 36, ax = NICHE_X + 50,
      cond = function() return G.flags.rest_evd end,
      use = function(o, sc)
        restAt(sc, NICHE_X + 50)
        wait(1.5)
        standUp()
      end },
    { id = "back", name = "Назад", x = 0, y = 140, w = 16, h = 92, ax = 10,
      cond = function() return not act5m() end,
      exit = { to = "hands_passage", x = 875, facing = -1 } },
    { id = "exit", name = "В служебный тоннель №3", x = 960, y = 140, w = 40, h = 92, ax = 980,
      cond = function() return G.flags.monScare and not act5m() end,
      exit = { to = "tunnel3", x = 30, facing = 1 } },
    { id = "depot", name = "Переход к Депо", x = 960, y = 140, w = 40, h = 92, ax = 980,
      cond = function() return act5m() and G.flags.depotHint end,
      exit = { to = "depot", x = 30, facing = 1 } },
    { id = "flood", name = "Перегон «ВОДА»", x = 0, y = 140, w = 16, h = 92, ax = 10,
      cond = function() return act5m() and (G.flags.depotEscaped or G.flags.rest_evd) end,
      exit = { to = "flooded", x = 30, facing = 1 } },
  },
})

-- момент входа для отсчёта 60 секунд тишины
local mon = World.scenes.monastyrskaya
mon.update = (function(orig)
  return function(sc, dt)
    if G.done["monastyrskaya:z:enter"] and not sc.v.enterT then sc.v.enterT = sc.t end
    orig(sc, dt)
  end
end)(mon.update)

-------------------------------------------------------------- 3.6 Служебный тоннель №3
reg("tunnel3", {
  vents = false,
  wallProps = false,
  w = 1400, spawn = 30, surface = "concrete", echo = false, drain = 3,
  ambient = { 0.025, P.blue2 },
  amb = { hum = 0.08, drone = 0.2 },
  speed = 40,
  static = function(sc)
    Gx.r(P.black, 0, 0, sc.w, H)
    Gx.r(P.dk1, 0, 140, sc.w, 10)
    Gx.concrete(0, 150, sc.w, 60, P.dk2, P.gray1, 41)
    for i = 1, 30 do Gx.r(P.water, Gx.hash(i, 81) * sc.w, 150 + Gx.hash(i, 82) * 50, 1, 6, 0.6) end
    K.floor(0, 210, sc.w, P.dk1, P.black)
    Gx.r(P.cream2, 296, 160, 34, 22)
    Gx.r(P.cream, 298, 162, 30, 18)
    Gx.line(P.dk2, 300, 166, 326, 176)
    Gx.r(P.black, 1360, 140, 40, 92)
  end,
  front = function(sc)
    -- стены давят: передний план
    love.graphics.push()
    love.graphics.translate(-World.camx * 0.25, 0)
    Gx.r(P.black, -100, 248, sc.w + 600, 30)
    for x = -100, sc.w + 500, 30 do Gx.r(P.dk1, x, 246, 22, 3) end
    Gx.r(P.black, -100, 0, sc.w + 600, 140)
    love.graphics.pop()
  end,
  setup = function(sc)
    sc.flicker = true
    sc.v.echoSteps = {}
  end,
  onStep = function(sc, e, isLeha)
    if not isLeha and G.flags.t3steps and not G.flags.t3knock then
      table.insert(sc.v.echoSteps, 0.35)
    end
  end,
  update = function(sc, dt)
    for i = #sc.v.echoSteps, 1, -1 do
      sc.v.echoSteps[i] = sc.v.echoSteps[i] - dt
      if sc.v.echoSteps[i] <= 0 then
        table.remove(sc.v.echoSteps, i)
        Audio.play("step_concrete", 0.35, 0.8, World.player.x - 120)
      end
    end
  end,
  enter = function(sc)
    if G.flags.t3enter then return end
    G.flags.t3enter = true
    talk({
      { L, "Дим... нам сюда?" },
      { D, "Карта показывает, что это единственный путь." },
      { L, "А можно по-другому?" },
      { D, "Нельзя." },
    })
  end,
  zones = {
    { id = "panic", x1 = 560, x2 = 2000, fn = function()
      say(L, "Я не могу. Стены. Они...")
      local r = choose({
        "«Смотри на мой затылок. Считай шаги.»",
        "«Не думай про стены, думай про бутерброд.»",
        "«Да всё нормально. Иди.»",
        "Промолчать",
      })
      if r == 1 then
        State.panic(-10)
        talk({ { L, "Раз. Два. Три. Мне нужно, чтобы ты не оборачивался." }, { D, "Не обернусь." } })
      elseif r == 2 then
        State.panic(-5)
        talk({ { L, "Откуда ты знаешь про бутерброд?" }, { D, "Я знаю тебя." } })
      elseif r == 3 then
        State.panic(10)
        talk({ { L, "Ты не понимаешь. Мне нехорошо." }, { D, "Просто иди." } })
      else
        State.panic(5)
      end
    end },
    { id = "steps", x1 = 880, x2 = 2000, fn = function()
      G.flags.t3steps = true
      if G.battery > 0.2 then G.battery = 0.2 end
      wait(1.5)
      talk({
        { L, "Ты слышишь?" },
        { D, "Слышу." },
        { L, "Давай не будем оглядываться." },
        { D, "Идём." },
      })
    end },
    { id = "knock", x1 = 1240, x2 = 2000, fn = function()
      sfx("knock3", 0.9, 1, World.player.x + 60)
      wait(1.6)
      G.flags.t3knock = true
      talk({
        { D, "Три удара." },
        { L, "Опять трубы?" },
        { D, "Нет. Это не трубы. Это кто-то стучит." },
      })
    end },
  },
  objects = {
    { id = "plan", name = "Схема служебных тоннелей", x = 296, y = 160, w = 34, h = 22, ax = 310,
      use = function(o, sc)
        World.player.pose = "inspect"
        wait(0.9)
        World.player.pose = "idle"
        giveFragment(2)
        State.note("n:t3plan", "Табличка-схема служебных тоннелей (фрагмент карты №2).")
      end },
    { id = "back", name = "Назад", x = 0, y = 150, w = 16, h = 82, ax = 10,
      exit = { to = "monastyrskaya", x = 975, facing = -1 } },
    { id = "exit", name = "Выход из тоннеля", x = 1360, y = 140, w = 40, h = 92, ax = 1380,
      cond = function() return G.flags.t3knock end,
      exit = { to = "mirror", x = 30, facing = 1 } },
  },
})

-------------------------------------------------------------- 3.7 Зеркальный коридор «Центральной»
local BRANCH_X, NICHE_K = 820, 1060

reg("mirror", {
  props = false, puddles = false,
  w = 1300, spawn = 30, surface = "tile", echo = true,
  ambient = { 0.04, P.blue2 },
  amb = { hum = 0.1 },
  static = function(sc)
    Gx.r(P.granite, 0, 0, sc.w, H)
    for x = 0, sc.w, 2 do Gx.r(P.dk1, x, 28, 1, 1) end
    for x = 20, sc.w, 50 do Gx.r(P.dk2, x, 26, 30, 2) end
    for x = 0, sc.w, 130 do
      Gx.r(P.black, x + 30, 80, 60, 126)
      Gx.r(P.dk1, x + 26, 76, 68, 4)
    end
    Gx.r(P.dk1, 0, 204, sc.w, 2)
    Gx.r(P.granite, 0, 206, sc.w, 64)
    for x = 0, sc.w, 40 do Gx.r(P.dk1, x, 206, 1, 64, 0.6) end
    Gx.r(P.black, BRANCH_X - 10, 100, 40, 106)
    Gx.r(P.black, NICHE_K, 150, 50, 56)
    Gx.r(P.black, 1260, 130, 40, 102)
  end,
  draw = function(sc)
    -- кладка на месте пути назад
    if G.flags.walled then
      Gx.bricks(0, 120, 30, 86, P.brown2, P.dk2, P.rust)
      Gx.line(P.white, 6, 150, 22, 166, 0.8)
      Gx.line(P.white, 22, 150, 6, 166, 0.8)
    end
  end,
  charsDraw = function(sc, drawDima, drawLeha)
    -- отражения в полированном полу
    local p, l = World.player, World.leha
    love.graphics.push()
    love.graphics.translate(0, FLOOR * 2 + 2)
    love.graphics.scale(1, -1)
    Gx.dima(p.x, FLOOR, { facing = p.facing, frame = p.frame, pose = p.pose, alpha = 0.22 })
    if l.visible then Gx.leha(l.x, FLOOR, { facing = l.facing, frame = l.frame, pose = l.pose, alpha = 0.22 }) end
    love.graphics.pop()
    -- фигура в рясе в отражении за спиной Лёхи
    if sc.v.preacher and sc.v.preacher > 0 then
      Gx.preacher(l.x - l.facing * 18, FLOOR - 8, sc.t, 0.45, l.facing)
    end
    drawLeha()
    drawDima()
  end,
  update = function(sc, dt)
    if sc.v.preacher and sc.v.preacher > 0 then sc.v.preacher = sc.v.preacher - dt end
    if G.flags.voiceDone and not G.flags.walled and World.player.x < 70 and not Script.blocking() then
      G.flags.walled = true
      Script.run(function()
        sfx("sting", 0.5)
        talk({
          { L, "Ты же шутишь." },
          { D, "Нет." },
          { L, "Мы же здесь шли. Минуту назад." },
          { D, "Значит, нас не выпускают." },
        })
        G.flags.choir = true
        Audio.amb("choir", 0.18, 0.1)
        State.objective("exit", "Найти другой выход")
        strange(1)
        G.act = 4
      end, true, "walled")
    end
  end,
  zones = {
    { id = "enter", x1 = 60, x2 = 2000, cond = function() return not G.flags.krotsDone end, fn = function()
      talk({
        { L, "Красиво. Прямо вау. Можно фоткаться." },
        { D, "Не надо фоткаться." },
        { L, "Почему?" },
        { D, "Потому что вспышка." },
      })
    end },
    { id = "reflect", x1 = 420, x2 = 2000, fn = function(sc)
      sc.v.preacher = 1.0
      sfx("sting", 0.35)
      wait(0.9)
      World.player.facing = -World.player.facing
      wait(0.4)
      talk({
        { L, "Чего ты побелел?" },
        { D, "Ничего. Иди вперёд." },
      })
      strange(1)
    end },
    { id = "voice", x1 = 700, x2 = 2000, fn = function(sc)
      say(VO, "Дима, сюда. Я нашёл выход.", { at = { BRANCH_X + 10, 150 } })
      talk({
        { D, "Лёх, ты что-то сказал?" },
        { L, "Нет." },
        { D, "Но я слышал твой голос." },
        { L, "Я тоже слышал мой голос." },
      })
      local r = choose({ "Пойти на голос", "Остаться" })
      if r == 1 then
        walkTo("DIMA", BRANCH_X + 10)
        fadeOut(0.5)
        World.player.hiddenSprite = true
        wait(1.2)
        sfx("thud", 0.5)
        UI.toast("Тупик. Голая стена.", 3)
        G.battery = math.max(0, G.battery - 0.1)
        State.panic(10)
        wait(1)
        World.player.hiddenSprite = false
        fadeIn(0.5)
      else
        say(VO, "Дима, сюда. Я нашёл выход.", { at = { BRANCH_X + 10, 150 }, quiet = true })
      end
      G.flags.voiceDone = true
      State.objective("back", "Вернуться к вентшахте")
    end },
  },
  objects = {
    { id = "branch", name = "Тёмное ответвление", x = BRANCH_X - 10, y = 100, w = 40, h = 106, ax = BRANCH_X + 10,
      cond = function() return G.flags.voiceDone end,
      lines = { { D, "Тупик. Голая стена." } } },
    { id = "wall", name = "Кирпичная кладка", x = 0, y = 120, w = 30, h = 86, ax = 40,
      cond = function() return G.flags.walled end,
      lines = { { D, "Кладка выглядит так, будто стоит здесь семьдесят лет." } } },
    { id = "back", name = "Назад, к вентшахте", x = 0, y = 130, w = 16, h = 102, ax = 10,
      cond = function() return not G.flags.voiceDone end,
      exit = { to = "tunnel3", x = 1370, facing = -1 } },
    { id = "krots", name = "Тёмная боковая ниша", x = NICHE_K, y = 150, w = 50, h = 56, ax = NICHE_K + 25,
      cond = function() return G.flags.namelessDone end,
      exit = { to = "krots", x = 40, facing = 1 } },
    { id = "exit", name = "Служебный вход", x = 1260, y = 130, w = 40, h = 102, ax = 1280,
      cond = function() return G.flags.walled end,
      exit = { to = "admin_corridor", x = 30, facing = 1 } },
  },
})
