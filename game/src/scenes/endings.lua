-- Часть VII. Две концовки: «Побег» и «Покой»
local K = require("src.scenes.common")
local reg = World.register
local lg = love.graphics

local function titleCard(lines, sc, a)
  for i, l in ipairs(lines) do
    Gx.textOc(l, W / 2, H / 2 - #lines * 8 + (i - 1) * 16, P.white, a)
  end
end

local function dawnSky(w)
  K.vgrad(0, 0, w, 170, P.blue2, P.cream)
  Gx.r(P.orange2, 0, 160, w, 10, 0.4)
  Gx.r(P.dk2, 0, 170, w, 100)
  K.floor(0, 178, w, P.green1, P.dk2)
  for i = 0, 80 do
    local x = Gx.hash(i, 9) * w
    Gx.line(P.green2, x, 236, x + 2, 205 + Gx.hash(i, 8) * 15)
  end
end

local function finish()
  wait(3)
  fadeOut(2)
  Dialog.clear()
  App.toTitle()
end

-------------------------------------------------------------- Концовка A: подъём по Н-4 (25 секунд)
reg("climb_n4", {
  custom = true, noHud = true, music = "endA",
  ambient = { 0.2, P.blue2 },
  amb = { choir = 0.25, wind = 0.15 },
  setup = function(sc) sc.v.y = 0 sc.v.rung = 0 sc.v.look = 0 end,
  update = function(sc, dt)
    sc.v.y = sc.v.y + dt * 18
    local r = math.floor(sc.v.y / 9)
    if r ~= sc.v.rung then sc.v.rung = r Audio.play("stepE_metal", 0.22, 0.9 + love.math.random() * 0.2) end
    if sc.v.look > 0 then sc.v.look = sc.v.look - dt end
    -- хор за спиной стихает
    if sc.t > 18 then Audio.amb("choir", 0, 0.1) end
  end,
  keypressed = function(sc, k)
    if (k == "s" or k == "down") and sc.v.look <= 0 then
      sc.v.look = 1
      Audio.play("sting", 0.6)
      Script.run(function() wait(1) say(D, "Не смотри.") end, false)
      return true
    end
  end,
  speakerPos = function(sc, sp)
    if sp == "DIMA" then return 240, 80 end
    return 240, 180
  end,
  overlay = function(sc)
    if sc.t < 5 then Gx.textOc("S или стрелка вниз — оглянуться", W / 2, H - 14, P.gray3, math.min(1, (5 - sc.t))) end
  end,
  drawCustom = function(sc)
    local y = sc.v.y
    Gx.r(P.dk1, 0, 0, W, H)
    if sc.v.look > 0 then
      -- десятки серых лиц за спиной
      for i = 1, 60 do
        local x = Gx.hash(i, 1) * W
        local yy = Gx.hash(i, 2) * H
        Gx.r(P.gray3, x, yy, 10, 12, 0.8)
        Gx.r(P.gray2, x + 2, yy + 4, 6, 2)
      end
      return
    end
    Gx.concrete(160, 0, 160, H, P.gray1, P.dk2, 17)
    for i = -1, 32 do
      local ry = (i * 9 + y) % (H + 18) - 9
      Gx.r(P.gray2, 222, ry, 36, 2)
    end
    local glow = math.min(1, sc.t / 25)
    Gx.r(P.cream, 160, 0, 160, 20, glow * 0.6)
    local fr = math.floor(y / 9) % 2
    Gx.dima(240, 150, { facing = 1, pose = "climb", frame = fr })
    Gx.leha(240, 250, { facing = 1, pose = "climb", frame = 1 - fr, eyesRed = true })
  end,
  enter = function(sc)
    wait(4)
    talk({
      { L, "Дима. Я их слышу. Они не отпускают." },
      { D, "Просто лезь. Не слушай." },
      { L, "Они говорят: «Мы запомнили»." },
      { D, "Лезь." },
    })
    waitUntil(function() return sc.t >= 25 end)
    fadeOut(1.5)
    World.enter("dawnA")
    fadeIn(2)
  end,
})

reg("dawnA", {
  custom = true, noHud = true, music = "endA",
  ambient = { 0.9, P.white },
  amb = { wind = 0.4 },
  speakerPos = function(sc, sp)
    if sp == "DIMA" then return 220, 182 end
    return 262, 182
  end,
  drawCustom = function(sc)
    dawnSky(W)
    Gx.r(P.rust, 330, 212, 30, 20)
    Gx.r(P.gray1, 326, 208, 38, 5)
    Gx.dima(220, 232, { facing = 1, pose = "sit" })
    Gx.leha(262, 232, { facing = -1, pose = "sit" })
    if sc.v.title then
      lg.setColor(0, 0, 0, sc.v.blackA or 1)
      lg.rectangle("fill", 0, 0, W, H)
    end
    if sc.v.final then
      -- окно квартиры ночью; отпечаток ладони на стекле изнутри
      Gx.r(P.black, 0, 0, W, H)
      Gx.r(P.night, 160, 50, 160, 140)
      Gx.r(P.dk2, 156, 46, 168, 4)
      Gx.r(P.dk2, 156, 190, 168, 6)
      Gx.r(P.dk2, 238, 50, 4, 140)
      Gx.r(P.dk2, 160, 118, 160, 3)
      for i = 1, 30 do Gx.px(P.gray3, 160 + Gx.hash(i, 3) * 160, 50 + Gx.hash(i, 4) * 60, 0.5) end
      Gx.px(P.yellow, 190, 160) Gx.px(P.yellow, 200, 162) Gx.px(P.yellow, 290, 158)
      Gx.r(P.gray3, 270, 140, 5, 5, 0.5)
      for f = 0, 4 do Gx.px(P.gray3, 269 + f, 137 - (f % 2), 0.5) end
      if sc.v.horse then Gx.horse(200, 190) end
      if sc.v.tile then
        Gx.r(P.brown1, 330, 220, 120, 6)
        Gx.r(P.gray2, 380, 212, 18, 8)
      end
    end
  end,
  overlay = function(sc)
    if sc.v.title and sc.v.title > 0 then
      local _, lines = Fonts.small:getWrap(sc.v.titleText, 380)
      titleCard(lines, sc, sc.v.titleA or 1)
    end
    if sc.v.final and sc.v.final > 1 then
      Gx.textOc("ПОД ФУНДАМЕНТОМ. Конец.", W / 2, 230, P.white, math.min(1, sc.v.final - 1), Fonts.big)
    end
  end,
  enter = function(sc)
    wait(1.5)
    talk({
      { D, "Мы живы." },
      { L, "Да." },
      { D, "Давай никому не говорить." },
      { L, "Давай." },
    })
    sc.v.title = 0
    for i = 1, 30 do sc.v.blackA = i / 30 wait(0.05) end
    for _, txt in ipairs({
      "«Через неделю Лёха перестал отвечать на звонки.»",
      "«Через месяц над пустырём поставили забор. На табличке: «Строительство жилого комплекса».»",
      "«Дима каждую ночь слышит три удара в стену.»",
    }) do
      sc.v.title = 1
      sc.v.titleText = txt
      for i = 1, 20 do sc.v.titleA = i / 20 wait(0.05) end
      wait(3.5)
      for i = 1, 20 do sc.v.titleA = 1 - i / 20 wait(0.04) end
    end
    sc.v.title = nil
    Audio.silenceAll(1)
    sc.v.horse = State.has("horse")
    sc.v.tile = not G.flags.rest_evd
    sc.v.final = 1
    wait(1.5)
    sfx("knock3", 0.9)
    wait(2.5)
    for i = 1, 20 do sc.v.final = 1 + i / 20 wait(0.05) end
    finish()
  end,
})

-------------------------------------------------------------- Концовка B: эскалатор, рассвет, открытки
reg("escalator", {
  custom = true, noHud = true, music = "endB",
  ambient = { 0.35, P.yellow },
  amb = { hum = 0.1 },
  drawCustom = function(sc)
    Gx.r(P.black, 0, 0, W, H)
    local k = math.min(1, sc.t / 7)
    for i = 0, 40 do
      local x = 40 + i * 10
      local y = 250 - i * 6 + k * 40
      Gx.r(P.dk2, x, y, 10, 3)
      Gx.r(P.yellow, x, y - 1, 10, 1, 0.5)
    end
    for i = 0, 12 do Gx.r(P.cream, 30 + i * 34, 230 - i * 20 + k * 40, 3, 3, 0.8) end
    local px, py = 160 + k * 160, 200 - k * 100
    Gx.dima(px, py, { facing = 1 })
    Gx.leha(px - 22, py + 14, { facing = 1 })
    Gx.r(P.brown1, 400, 10, 60, 60, 0.6)
    if sc.t > 6 then Gx.r(P.cream, 410, 14, 40, 56, math.min(1, sc.t - 6)) end
  end,
  enter = function(sc)
    sfx("thud", 0.5, 0.5)
    wait(7.5)
    sfx("collapse", 0.25, 1.6)
    fadeOut(1.5)
    World.enter("dawnB")
    fadeIn(2)
  end,
})

reg("dawnB", {
  custom = true, noHud = true, music = "endB",
  ambient = { 0.9, P.white },
  amb = { wind = 0.3, sing = 0.15 },
  speakerPos = function(sc, sp)
    if sp == "DIMA" then return 230, 182 end
    if sp == "LEHA" then return 270, 182 end
  end,
  drawCustom = function(sc)
    dawnSky(W)
    -- остатки монастырской стены
    Gx.bricks(0, 170, 70, 40, P.cream2, P.gray2, P.cream)
    Gx.bricks(40, 150, 30, 20, P.cream2, P.gray2, P.cream)
    -- тяжёлые двери выхода и ступени эскалатора
    Gx.r(P.dk1, 340, 150, 70, 82)
    Gx.r(P.black, 346, 156, 58, 76)
    for i = 0, 6 do Gx.r(P.gray2, 348, 228 - i * 11, 54, 2) end
    local a = sc.v.figA or 0
    if a > 0 then
      Gx.evdokia(360, 222, sc.t, a)
      Gx.human(378, 210, { facing = -1, alpha = a * 0.75, jacket = P.white, jacket2 = P.gray4, pants = P.gray4, hair = P.gray4, hat = P.gray4 })
      Gx.alesha(395, 200, sc.t, a, true)
      if sc.v.wave then Gx.r(P.skin, 400, 174 - (math.floor(sc.t * 6) % 2) * 2, 2, 5, a) end
    end
    Gx.dima(230, 232, { facing = -1 })
    Gx.leha(270, 232, { facing = -1 })
  end,
  enter = function(sc)
    wait(1)
    talk({
      { L, "Мы вышли." },
      { D, "Мы вышли не одни." },
    })
    for i = 1, 25 do sc.v.figA = i / 25 * 0.85 wait(0.05) end
    sc.v.wave = true
    wait(2.5)
    for i = 1, 30 do sc.v.figA = 0.85 * (1 - i / 30) wait(0.07) end
    sc.v.wave = false
    talk({
      { L, "Дим, я так и не успел сказать спасибо." },
      { D, "Они всё слышали." },
    })
    fadeOut(1.2)
    World.enter("postcards")
    fadeIn(1)
  end,
})

local CARDS = {
  -- 1: архив
  function(sc)
    Gx.r(P.brown1, 0, 0, W, H)
    for x = 0, W, 30 do Gx.r(P.brown2, x, 20, 26, 150) for y = 26, 160, 12 do Gx.r(P.cream2, x + 2, y, 22, 10) end end
    Gx.r(P.brown2, 120, 190, 240, 8)
    Gx.r(P.cream, 220, 182, 30, 8)
    Gx.dima(170, 250, { facing = 1 })
    Gx.leha(140, 250, { facing = 1, camera = true })
    Gx.human(320, 250, { facing = -1, jacket = P.gray2, jacket2 = P.gray1, pants = P.dk2, hair = P.gray3 })
    Gx.r(P.black, 300, 182, 10, 6)
  end,
  -- 2: газета
  function(sc)
    Gx.r(P.brown2, 0, 0, W, H)
    Gx.r(P.cream, 90, 40, 300, 190)
    for y = 96, 210, 8 do Gx.r(P.gray3, 104, y, 130, 2) Gx.r(P.gray3, 248, y, 130, 2) end
  end,
  -- 3: интервью
  function(sc)
    K.vgrad(0, 0, W, H, P.gray3, P.gray2)
    Gx.dima(220, 250, { facing = 1 })
    Gx.human(280, 250, { facing = -1, jacket = P.violet1, jacket2 = P.dk2, pants = P.dk2, hair = P.brown2 })
    Gx.r(P.black, 266, 214, 4, 6)
    Gx.leha(170, 250, { facing = 1 })
    Gx.r(P.gray2, 176, 214, 12, 8)
  end,
  -- 4: плиту вскрывают
  function(sc)
    dawnSky(W)
    Gx.r(P.gray1, 140, 210, 200, 14)
    for i = 0, 4 do Gx.human(120 + i * 60, 232, { facing = 1, jacket = P.orange1, jacket2 = P.rust, hat = P.yellow }) end
    Gx.human(380, 232, { facing = -1, jacket = P.dk2, jacket2 = P.black, hair = P.gray4 })
    Gx.r(P.cream, 366, 206, 6, 4)
    for i = 0, 6 do Gx.r(P.red2, 60 + i * 12, 226, 3, 3) Gx.r(P.green2, 61 + i * 12, 229, 1, 4) end
  end,
  -- 5: кладбище на рассвете
  function(sc)
    dawnSky(W)
    for i = 0, 42 do
      local x = 20 + (i % 15) * 30
      local y = 196 + math.floor(i / 15) * 12
      Gx.r(P.cream2, x, y - 10, 2, 10)
      Gx.r(P.cream2, x - 3, y - 7, 8, 2)
    end
    local crosses = { { 120, "Евдокия, инокиня. 1887" }, { 240, "Алексей Миронов, 7 лет. 1931" }, { 360, "П.С. Лаптев. 1954" } }
    for _, c in ipairs(crosses) do
      Gx.r(P.white, c[1], 140, 3, 26)
      Gx.r(P.white, c[1] - 6, 146, 15, 3)
    end
    Gx.r(P.gray2, 126, 160, 10, 5)
    Gx.candle(112, 166, sc.t, true)
  end,
}

reg("postcards", {
  custom = true, noHud = true, music = "endB",
  ambient = { 0.95, P.white },
  amb = { sing = 0.12 },
  setup = function(sc) sc.v.card = 1 end,
  speakerPos = function(sc, sp)
    if sp == "DIMA" then return 170, 196 end
    if sp == "LEHA" then return 140, 196 end
    if sp == "ARCH" then return 320, 196 end
    if sp == "WOMAN" then return 380, 178 end
  end,
  drawCustom = function(sc)
    Gx.r(P.black, 0, 0, W, H)
    lg.push()
    lg.translate(W / 2, H / 2)
    lg.scale(0.86, 0.86)
    lg.translate(-W / 2, -H / 2)
    CARDS[sc.v.card](sc)
    lg.pop()
    Gx.r(P.cream, 0, 0, W, 12)
    Gx.r(P.cream, 0, H - 12, W, 12)
    Gx.r(P.cream, 0, 0, 30, H)
    Gx.r(P.cream, W - 30, 0, 30, H)
  end,
  overlay = function(sc)
    -- подписи открыток рисуются в полном разрешении (с тем же масштабом 0.86)
    local function tp(x, y) return W / 2 + (x - W / 2) * 0.86, H / 2 + (y - H / 2) * 0.86 end
    Gx.text("Открытка " .. sc.v.card, 34, 1, P.brown2)
    local c = sc.v.card
    if c == 2 then
      local x, y = tp(W / 2, 60)
      Gx.textOc("Под метро найдено старое кладбище.", x, y, P.black)
      x, y = tp(W / 2, 74)
      Gx.textOc("Начаты работы по перезахоронению", x, y, P.black)
    elseif c == 3 then
      local x, y = tp(150, 160)
      Gx.textO("...ДОКИЯ. 1887", x, y, P.white)
    elseif c == 5 then
      for _, cr in ipairs({ { 120, "Евдокия, инокиня. 1887" }, { 240, "Алексей Миронов, 7 лет. 1931" }, { 360, "П.С. Лаптев. 1954" } }) do
        local x, y = tp(cr[1] + 1, 170)
        Gx.textOc(cr[2], x, y, P.dk1)
      end
    end
  end,
  enter = function(sc)
    wait(1.5)
    talk({
      { D, "Мы нашли акт. Участок семь не переносили." },
      { "ARCH", "Этого не может быть. Дело в архиве числится как «закрыто»." },
      { L, "Оно было закрыто. Мы открыли." },
    })
    for c = 2, 5 do
      fadeOut(0.6)
      sc.v.card = c
      fadeIn(0.6)
      if c == 4 then
        wait(1.5)
        say("WOMAN", "Мама всю жизнь говорила, что дед не мог просто уйти.", { slow = true })
      else
        wait(4)
      end
    end
    wait(1)
    say(D, "Спите спокойно.", { screen = true, screenY = 120 })
    fadeOut(2)
    World.enter("finalB")
    World.fade = 1
    World.fadeTo(1, 0.1)
  end,
})

reg("finalB", {
  custom = true, noHud = true, music = "endB",
  ambient = { 0.95, P.white },
  amb = {},
  speakerPos = function(sc, sp)
    if sp == "DIMA" then return 200, 190 end
    return 250, 190
  end,
  drawCustom = function(sc)
    Gx.r(P.black, 0, 0, W, H)
    if sc.v.titles then
      Gx.textOc("ПОД ФУНДАМЕНТОМ. Конец.", W / 2, H / 2 - 10, P.white, sc.v.titles, Fonts.big)
    end
    if sc.v.bonus then
      dawnSky(W)
      for i = 0, 8 do
        Gx.r(P.cream2, 40 + i * 50, 186, 2, 12)
        Gx.r(P.cream2, 36 + i * 50, 189, 10, 2)
      end
      Gx.bench(204, 232)
      Gx.dima(212, 232, { facing = 1, pose = "sit" })
      Gx.leha(236, 232, { facing = -1, pose = "sit" })
      Gx.r(P.cream, 228, 212, 6, 3)
    end
  end,
  enter = function(sc)
    Audio.play("bell", 0.8)
    Audio.amb("sing", 0.3, 0.3)
    wait(2)
    Audio.play("wood3", 0.7)
    World.fadeTo(0, 1)
    for i = 1, 30 do sc.v.titles = i / 30 wait(0.05) end
    wait(4)
    for i = 1, 30 do sc.v.titles = 1 - i / 30 wait(0.05) end
    sc.v.titles = nil
    Audio.amb("sing", 0, 0.3)
    sc.v.bonus = true
    wait(1)
    talk({
      { L, "Я теперь без плитки. Чем чайник подпирать?" },
      { D, "Купи подпорку." },
      { L, "Не романтично." },
    })
    finish()
  end,
})
