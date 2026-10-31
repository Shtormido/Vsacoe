-- АКТ 2. «Мелочи» (10:00–25:00): у каждой странности есть объяснение
local K = require("src.scenes.common")
local reg = World.register

-------------------------------------------------------------- 2.1 Капля и 2.2 Термос
local DRIP_X = 520

reg("tunnel_drip", {
  w = 1300, spawn = 30, surface = "concrete", echo = true,
  ambient = { 0.035, P.blue2 },
  amb = { hum = 0.2 },
  static = function(sc)
    K.tunnel(sc, { bricks = true, brick = P.brown1 })
    for i = 1, 12 do
      local x = Gx.hash(i, 51) * sc.w
      Gx.r(P.water, x, 214 + Gx.hash(i, 52) * 16, 20 + Gx.hash(i, 53) * 20, 2)
    end
    Gx.r(P.water, DRIP_X - 12, 222, 26, 3)
    Gx.r(P.black, 1260, 130, 40, 102)
  end,
  setup = function(sc) sc.v.dripT = 0 sc.v.drops = {} sc.v.stare = 0 sc.v.red = 0 end,
  update = function(sc, dt)
    sc.v.dripT = sc.v.dripT + dt
    if sc.v.dripT >= 3 then
      sc.v.dripT = 0
      table.insert(sc.v.drops, { y = 30 })
    end
    for i = #sc.v.drops, 1, -1 do
      local d = sc.v.drops[i]
      d.y = d.y + dt * 260
      if d.y >= 222 then
        table.remove(sc.v.drops, i)
        Audio.play("drip", 0.5, 1, DRIP_X)
      end
    end
    -- долгий взгляд на каплю: пиксели на секунду краснеют
    local wx = UI.mouseWorldX()
    if wx and math.abs(wx - DRIP_X) < 20 and UI.my > 20 and UI.my < 230 then
      sc.v.stare = sc.v.stare + dt
      if sc.v.stare > 10 and not G.flags.dripRed then
        G.flags.dripRed = true
        sc.v.red = 1
      end
    else
      sc.v.stare = 0
    end
    if sc.v.red > 0 then sc.v.red = sc.v.red - dt end
  end,
  draw = function(sc)
    for _, d in ipairs(sc.v.drops) do
      Gx.r(sc.v.red > 0 and P.red2 or P.blue3, DRIP_X, d.y, 1, 3)
    end
    local k = sc.v.dripT
    if k < 0.4 then
      Gx.r(sc.v.red > 0 and P.red2 or P.blue3, DRIP_X - 3 - k * 10, 220, 2, 1, 1 - k * 2)
      Gx.r(sc.v.red > 0 and P.red2 or P.blue3, DRIP_X + 2 + k * 10, 220, 2, 1, 1 - k * 2)
    end
  end,
  zones = {
    { id = "count", x1 = 300, x2 = 2000, block = false, fn = function()
      strange(1)
      talk({
        { D, "Ты считаешь?" },
        { L, "Что?" },
        { D, "Капли. Каждые три секунды. Ровно." },
        { L, "Это конденсат. Ровный конденсат. Дисциплинированный." },
      })
    end },
    { id = "thermos", x1 = 760, x2 = 2000, cond = function() return not G.flags.thermosTrip end, fn = function()
      G.flags.thermosTrip = true
      talk({
        { L, "Чёрт. Термос." },
        { D, "Что с термосом?" },
        { L, "Оставил на столе в бытовке. Сходим? Тут триста метров." },
        { D, "Ты серьёзно?" },
        { L, "Там чай. Хороший. С чабрецом." },
      })
      local r = choose({ "Сходим", "Отказаться" })
      if r == 1 then
        World.go("lipovaya", 960, -1)
      else
        State.panic(5)
        G.flags.thermosBack = true
        UI.toast("Лёха обиделся", 2)
      end
    end },
  },
  objects = {
    { id = "drip", name = "Капля и потолок", x = DRIP_X - 12, y = 30, w = 26, h = 196, ax = DRIP_X - 20,
      lines = {
        { D, "Потолок над каплей сухой. Откуда она берётся?" },
        { L, "Из трубы наверху. Ты умеешь видеть невидимое." },
        { D, "Трубы тут нет." },
        { L, "Значит, невидимая." },
      } },
    { id = "back", name = "Назад, на «Липовую»", x = 0, y = 130, w = 16, h = 102, ax = 10,
      exit = { to = "lipovaya", x = 1050, facing = -1 } },
    { id = "exit", name = "Боковой проход", x = 1260, y = 130, w = 40, h = 102, ax = 1275,
      cond = function() return G.flags.thermosTrip end,
      exit = { to = "side_passage", x = 30, facing = 1 } },
  },
})

-------------------------------------------------------------- 2.3 Следы в пыли
reg("side_passage", {
  wallProps = false,
  w = 820, spawn = 30, surface = "concrete", echo = false,
  ambient = { 0.035, P.blue2 },
  amb = { hum = 0.15 },
  static = function(sc)
    K.corridor(sc, { paint = P.dk2 })
    K.floor(0, 206, sc.w, P.gray2, P.gray1)
    -- следы 42-го размера к стене и в стену
    for i = 0, 26 do
      local x = 110 + i * 22
      local y = 216 + (i % 2) * 8
      Gx.r(P.dk2, x, y, 6, 3)
      Gx.r(P.dk2, x + 1, y + 3, 4, 1)
    end
    -- кладка: новая по цвету, старая по форме
    Gx.bricks(730, 40, 90, 166, P.rust, P.gray2, P.brown2)
    Gx.r(P.black, 300, 120, 34, 86)
    Gx.r(P.dk1, 296, 116, 42, 4)
  end,
  zones = {
    { id = "enter", x1 = 50, x2 = 2000, fn = function()
      talk({
        { D, "Лёх, ты тут ходил?" },
        { L, "Я шёл с тобой." },
        { D, "Тогда это не мы." },
      })
    end },
  },
  objects = {
    { id = "steps", name = "Следы в пыли", x = 400, y = 212, w = 120, h = 20, ax = 380,
      lines = {
        { D, "Размер сорок два. Подошва с протектором. Современные." },
        { L, "Значит, не пятидесятые. Кто-то из наших." },
        { D, "Следы идут туда. Обратно нет." },
      },
      after = function(o, sc, first) if first then strange(1) end end },
    { id = "wall", name = "Кирпичная кладка", x = 730, y = 40, w = 90, h = 166, ax = 710,
      lines = {
        { D, "Кладка свежая, но кирпич старый. Вчерашним цементом бы так не заложили." },
        { L, "Значит, дверь тут была. Закрыли, чтобы не лезли." },
        { D, "Следы идут к стене и в стену." },
        { L, "Давай не будем про это." },
      },
      after = function(o, sc, first) if first then strange(1) end end },
    { id = "back", name = "Назад", x = 0, y = 130, w = 16, h = 102, ax = 10,
      exit = { to = "tunnel_drip", x = 1240, facing = -1 } },
    { id = "exit", name = "Проход дальше", x = 300, y = 120, w = 34, h = 86, ax = 317,
      exit = { to = "booth", x = 30, facing = 1 } },
  },
})

-------------------------------------------------------------- 2.4 Будка обходчика и фрагмент карты №1
reg("booth", {
  vents = false,
  wallProps = false,
  w = 600, spawn = 30, surface = "concrete",
  ambient = { 0.04, P.blue2 },
  amb = { hum = 0.15 },
  static = function(sc)
    K.corridor(sc, { paint = P.green1 })
    Gx.r(P.brown1, 150, 120, 300, 112)
    Gx.r(P.dk1, 154, 124, 292, 104)
    Gx.concrete(156, 126, 288, 100, P.gray1, P.dk2, 21)
    Gx.door(160, 160, 20, 66, P.brown2, true)
    -- стол и лампа «летучая мышь»
    Gx.r(P.brown2, 360, 196, 60, 4)
    Gx.r(P.brown1, 364, 200, 3, 26)
    Gx.r(P.brown1, 414, 200, 3, 26)
    Gx.r(P.rust, 372, 184, 8, 12)
    Gx.r(P.gray3, 373, 186, 6, 6, 0.6)
    -- схема путей на стене
    Gx.r(P.cream2, 240, 140, 90, 50)
    Gx.r(P.cream, 242, 142, 86, 46)
    Gx.line(P.dk2, 248, 152, 280, 160)
    Gx.line(P.dk2, 280, 160, 320, 166)
    Gx.line(P.dk2, 300, 164, 290, 182)
    Gx.line(P.dk2, 280, 160, 318, 148)
    Gx.text("НЕ ХОДИТЬ", 286, 142, P.red2)
    Gx.r(P.black, 560, 130, 40, 102)
  end,
  draw = function(sc)
    if not G.flags.battery1 then Gx.r(P.gray2, 396, 191, 6, 5) Gx.r(P.orange1, 396, 191, 6, 1) end
  end,
  objects = {
    { id = "scheme", name = "Схема путей", x = 240, y = 140, w = 90, h = 50, ax = 280,
      lines = {
        { D, "Схема обходчика. Пять станций и Депо. Смотри, пометки." },
        { L, "Красным «не ходить». Прямо как у моей мамы на холодильнике." },
        { D, "Карандашом «вода». Другая рука. И... детским почерком «тут слышно»." },
        { L, "Дети в метро? Давай не будем про это." },
        { D, "Ты уже второй раз говоришь «не будем про это»." },
        { L, "Это не значит, что я про это думаю." },
      },
      after = function(o, sc, first)
        if first then
          giveFragment(1)
          strange(1)
          hint("M: карта", 5)
        end
      end },
    { id = "names", name = "Названия на схеме", x = 242, y = 170, w = 40, h = 20, ax = 270,
      cond = function() return G.mapFrag[1] end,
      lines = {
        { D, "Монастырская. Покровская. Откуда такие названия для метро?" },
        { L, "Может, рядом церковь была." },
        { D, "Метро называют по ближайшим местам. Значит, рядом был монастырь." },
        { L, "Был и сплыл. Как всё хорошее." },
      } },
    { id = "battery", name = "Батарейка", x = 392, y = 186, w = 14, h = 12, ax = 392,
      cond = function() return not G.flags.battery1 end,
      use = function()
        G.flags.battery1 = true
        G.spares = G.spares + 1
        UI.toast("Запасная батарейка (R — заменить)", 3)
      end },
    { id = "back", name = "Назад", x = 0, y = 130, w = 16, h = 102, ax = 10,
      exit = { to = "side_passage", x = 317, facing = 1 } },
    { id = "exit", name = "Дальше", x = 560, y = 130, w = 40, h = 102, ax = 580,
      cond = function() return G.mapFrag[1] end,
      exit = { to = "niche_dict", x = 30, facing = 1 } },
  },
})

-------------------------------------------------------------- 2.5 Диктофон
local BENCH_X = 300

reg("niche_dict", {
  wallProps = false,
  w = 760, spawn = 30, surface = "concrete",
  ambient = { 0.045, P.blue2 },
  amb = { hum = 0.2 },
  static = function(sc)
    K.corridor(sc, { paint = P.dk2 })
    for x = 120, 640, 70 do
      Gx.r(P.gray2, x, 80, 40, 52)
      Gx.r(P.dk1, x + 3, 83, 34, 46)
      Gx.r(P.gray3, x + 8, 92, 6, 14)
      Gx.r(P.gray3, x + 24, 98, 6, 14)
    end
    Gx.r(P.black, 720, 130, 40, 102)
  end,
  draw = function(sc)
    -- большие тени героев на стене
    if G.light then
      local p, l = World.player, World.leha
      local k = 1.6
      Gx.r(P.black, p.x + p.facing * 30 - 10, FLOOR - 48 * k, 20, 48 * k, 0.25)
      Gx.r(P.black, p.x + p.facing * 30 - 8, FLOOR - 48 * k - 14, 16, 16, 0.25)
      if l.visible then
        Gx.r(P.black, l.x + p.facing * 40 - 10, FLOOR - 48 * k, 20, 48 * k, 0.2)
        Gx.r(P.black, l.x + p.facing * 40 - 8, FLOOR - 48 * k - 14, 16, 16, 0.2)
      end
    end
    Gx.r(P.gray2, BENCH_X, 212, 40, 2)
    Gx.r(P.gray2, BENCH_X + 2, 214, 2, 18)
    Gx.r(P.gray2, BENCH_X + 36, 214, 2, 18)
    Gx.r(P.gray1, BENCH_X, 206, 40, 2)
  end,
  listen = {
    { id = "knocks", x = 620, sound = "knock3", every = 4.0, kind = "good",
      text = "...три коротких удара... тишина... снова три...",
      onRecord = function(sc)
        if G.flags.knocksHeard then return end
        G.flags.knocksHeard = true
        talk({
          { D, "Стой. Перемотай." },
          { L, "Что?" },
          { D, "Между каплями есть ещё звук. Три коротких удара. Потом тишина. Потом снова три." },
          { L, "Это трубы." },
          { D, "Трубы тут не стучат ритмом." },
          { L, "Значит, у них хороший вкус." },
          { D, "Лёх." },
          { L, "Ладно. Странно. Но это просто звук." },
        })
        strange(1)
      end },
  },
  timers = {
    { id = "dict", t = 2, fn = function()
      talk({
        { L, "Вот, смотри. Диктофон. Решил записать для атмосферы." },
        { D, "Для какой атмосферы? Тут ничего нет." },
        { L, "Вот и запишем «ничего». Потом послушаем." },
      })
      G.flags.dictaphone = true
      hint("Q (держать): Слушать. Ищи, где спектр зелёный", 7)
    end },
  },
  objects = {
    { id = "bench", name = "Скамейка из труб: присесть", x = BENCH_X, y = 204, w = 40, h = 28, ax = BENCH_X + 12,
      use = function(o, sc)
        restAt(sc, BENCH_X + 12)
        wait(1.5)
        standUp()
      end },
    { id = "back", name = "Назад", x = 0, y = 130, w = 16, h = 102, ax = 10,
      exit = { to = "booth", x = 575, facing = -1 } },
    { id = "exit", name = "Дальше", x = 720, y = 130, w = 40, h = 102, ax = 740,
      cond = function() return G.flags.dictaphone end,
      exit = { to = "cable_tunnel", x = 30, facing = 1 } },
  },
})

-------------------------------------------------------------- 2.6 Ложная тревога
reg("cable_tunnel", {
  wallProps = false,
  w = 1300, spawn = 30, surface = "concrete", echo = true,
  ambient = { 0.035, P.blue2 },
  amb = { hum = 0.0 },
  static = function(sc)
    K.tunnel(sc, {})
    for x = 0, sc.w, 60 do
      Gx.r(P.gray2, x, 100, 54, 40)
      Gx.r(P.dk2, x + 2, 102, 50, 36)
      Gx.r(P.gray1, x + 4, 116, 46, 2)
    end
    Gx.r(P.black, 1260, 130, 40, 102)
  end,
  draw = function(sc)
    if G.flags.flask then Gx.r(P.gray3, sc.v.flaskX or 0, FLOOR - 3, 7, 3) end
  end,
  setup = function(sc)
    if not G.flags.flask then
      Audio.silenceAll(3)
    end
  end,
  timers = {
    { id = "flask", t = 40, fn = function(sc)
      G.flags.flask = true
      sc.v.flaskX = World.leha.x + 6
      sfx("flask", 1, 1, World.leha.x)
      shake(2, 0.5)
      local p = World.player
      p.facing = World.leha.x > p.x and 1 or -1
      p.pose = "fear"
      wait(0.6)
      p.pose = "idle"
      talk({
        { L, "Прости. Уронил." },
        { D, "Лёх. Я чуть не умер." },
        { L, "Давай договоримся: я больше не падаю громко." },
        { D, "Давай договоримся, что ты вообще не падаешь." },
      })
      State.panic(5)
      G.flags.drone = true
      Audio.resumeMusic(0.15)
      Audio.amb("hum", 0.2, 0.3)
      Audio.amb("drone", 0.25, 0.1)
      wait(1)
      say(D, "Пошли. До «Центральной» должно быть недалеко.")
      G.act = 3
    end },
  },
  objects = {
    { id = "back", name = "Назад", x = 0, y = 130, w = 16, h = 102, ax = 10,
      cond = function() return G.flags.flask end,
      exit = { to = "niche_dict", x = 735, facing = -1 } },
    { id = "exit", name = "Дальше", x = 1260, y = 130, w = 40, h = 102, ax = 1280,
      cond = function() return G.flags.flask end,
      exit = { to = "clock_platform", x = 30, facing = 1 } },
  },
})
