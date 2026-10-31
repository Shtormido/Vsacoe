-- Титульный экран: ночной пустырь над веткой, туман, свет из вентшахты
local Ti = {}
local lg = love.graphics
local floor = math.floor

local ITEMS = { "Новая игра", "Продолжить", "Настройки", "Выход" }

local skyCanvas
local function buildSky()
  skyCanvas = lg.newCanvas(W, H)
  lg.push("all")
  lg.setCanvas(skyCanvas)
  lg.origin()
  lg.clear(0, 0, 0, 1)
  for y = 0, 190 do
    local k = y / 190
    local r = 0.03 + k * 0.10
    local g = 0.035 + k * 0.12
    local b = 0.07 + k * 0.20
    lg.setColor(r, g, b)
    lg.rectangle("fill", 0, y, W, 1)
  end
  -- ореол луны: концентрические кольца
  for r = 44, 13, -3 do
    lg.setColor(0.45, 0.52, 0.66, 0.035 + (1 - r / 44) * 0.05)
    lg.circle("fill", 392, 52, r)
  end
  lg.setColor(P.cream)
  lg.circle("fill", 392, 52, 11)
  lg.setColor(P.cream2)
  lg.circle("fill", 388, 49, 3)
  lg.circle("fill", 396, 57, 2)
  -- город вдали
  for i = 0, 40 do
    local x = i * 12 + floor(Gx.hash(i, 1) * 6)
    local h = 10 + floor(Gx.hash(i, 2) * 30)
    if x < 230 or x > 420 then Gx.r(P.dk1, x, 172 - h, 12, h) end
  end
  lg.pop()
end

-- Арт из референса (assets/art/title.png) с живыми слоями поверх: дождь, туман, фонарь, лужи
local art
local function drawArt(t)
  lg.setColor(1, 1, 1, 1)
  lg.draw(art, 0, 0)
  lg.setBlendMode("add")
  -- фонарь на столбе мигает
  local fl = (Gx.hash(floor(t * 9), 5) > 0.9) and 0.25 or (0.85 + 0.15 * math.sin(t * 3))
  for r = 30, 4, -3 do
    lg.setColor(0.35, 0.3, 0.18, 0.05 * fl)
    lg.circle("fill", 132, 62, r)
  end
  for y = 66, 214, 2 do
    local k = (y - 66) / 148
    local half = 3 + k * 22
    lg.setColor(0.32, 0.28, 0.16, 0.035 * fl * (1 - k * 0.7))
    lg.rectangle("fill", 132 - half, y, half * 2, 1)
  end
  -- лампа в переходе метро
  local tube = (Gx.hash(floor(t * 6), 9) > 0.8) and 0.2 or 1
  lg.setColor(0.25, 0.3, 0.35, 0.18 * tube)
  lg.rectangle("fill", 330, 149, 30, 2)
  for r = 20, 4, -4 do
    lg.setColor(0.18, 0.22, 0.28, 0.04 * tube)
    lg.circle("fill", 345, 152, r)
  end
  -- лунный ореол
  for r = 22, 8, -3 do
    lg.setColor(0.2, 0.24, 0.32, 0.035)
    lg.circle("fill", 376, 42, r)
  end
  lg.setBlendMode("alpha")
  -- туман у земли
  for layer = 1, 3 do
    for x = 0, W, 4 do
      local n = love.math.noise(x * 0.012 + t * 0.025 * (layer + 1), layer * 4.7)
      local h = floor(5 + n * 16)
      Gx.r(P.gray3, x, 196 + layer * 10 - h, 4, h, 0.035 + layer * 0.015)
    end
  end
  -- круги на лужах
  for i = 1, 6 do
    local ph = (t * 0.8 + i * 0.37) % 1
    local x = 140 + Gx.hash(i, floor(t * 0.8 + i * 0.37)) * 300
    local y = 222 + Gx.hash(i, 2) * 20
    lg.setColor(0.55, 0.62, 0.72, 0.3 * (1 - ph))
    lg.ellipse("line", x, y, 2 + ph * 8, 1 + ph * 2)
  end
  -- косой дождь
  for i = 1, 160 do
    local sp = 260 + Gx.hash(i, 3) * 120
    local x = (Gx.hash(i, 1) * (W + 60) + t * 40) % (W + 60) - 30
    local y = (Gx.hash(i, 2) * H + t * sp) % (H + 20) - 10
    Gx.line(P.blue3, x, y, x - 2, y + 6, 0.16 + Gx.hash(i, 4) * 0.12)
  end
  -- затемнение под меню
  for i = 0, 90 do
    Gx.r(P.black, 0, 180 + i, W, 1, math.min(0.75, i / 90 * 0.8))
  end
  for i = 0, 40 do Gx.r(P.black, 0, i, W, 1, 0.5 * (1 - i / 40)) end
end

function Ti.draw(t)
  if art == nil then
    art = love.filesystem.getInfo("assets/art/title.png") and lg.newImage("assets/art/title.png") or false
    if art then art:setFilter("nearest", "nearest") end
  end
  if art then
    drawArt(t)
    Ti.overlay(t)
    return
  end
  if not skyCanvas then buildSky() end
  lg.setColor(1, 1, 1, 1)
  lg.draw(skyCanvas, 0, 0)
  -- звёзды мерцают
  for i = 1, 70 do
    local x, y = floor(Gx.hash(i, 11) * W), floor(Gx.hash(i, 12) * 120)
    local a = 0.3 + 0.7 * (0.5 + 0.5 * math.sin(t * (1 + Gx.hash(i, 13) * 3) + i))
    Gx.px(P.gray4, x, y, a * 0.8)
  end
  -- облака
  for i = 1, 5 do
    local x = (Gx.hash(i, 21) * 600 + t * (3 + i)) % 640 - 120
    local y = 30 + i * 18
    Gx.r(P.blue1, x, y, 90 + i * 10, 5, 0.55)
    Gx.r(P.blue1, x + 14, y - 3, 50, 4, 0.5)
  end
  -- окна города
  for i = 0, 40 do
    local x = i * 12 + floor(Gx.hash(i, 1) * 6)
    local h = 10 + floor(Gx.hash(i, 2) * 30)
    if x < 230 or x > 420 then
      for wy = 172 - h + 3, 168, 5 do
        local on = Gx.hash(i * 7 + wy, floor(t * 0.3 + i)) > 0.86
        if on then Gx.px(P.yellow, x + 3 + (wy % 3) * 3, wy, 0.8) end
      end
    end
  end
  -- горизонт и пустырь
  Gx.r(P.night, 0, 172, W, 98)
  for y = 172, 270, 3 do Gx.r(P.dk1, 0, y, W, 1, 0.35) end
  -- забор и сухое дерево
  for x = 20, 210, 14 do
    Gx.r(P.black, x, 160 + (x % 3), 2, 16)
  end
  Gx.r(P.black, 20, 164, 192, 1)
  Gx.r(P.black, 20, 170, 192, 1)
  Gx.r(P.black, 440, 110, 3, 66)
  Gx.line(P.black, 441, 130, 425, 112)
  Gx.line(P.black, 442, 124, 462, 104)
  Gx.line(P.black, 441, 145, 458, 136)
  Gx.line(P.black, 430, 118, 424, 104)
  -- вентшахта: тёплый свет пробивается из решётки
  local sx = 318
  Gx.r(P.black, sx - 24, 132, 48, 46)
  Gx.r(P.dk1, sx - 30, 124, 60, 9)
  Gx.r(P.rust, sx - 22, 134, 6, 40, 0.5)
  local pulse = 0.55 + 0.25 * math.sin(t * 1.7) + (Gx.hash(floor(t * 8), 3) > 0.92 and -0.3 or 0)
  for gx = sx - 22, sx + 20, 4 do Gx.r(P.orange2, gx, 125, 2, 3, pulse) end
  for r = 1, 22 do
    local a = (1 - r / 22) * 0.35 * pulse
    for k = 0, 18 do
      local x = sx - 24 + k * 2.6 + (r % 2)
      local y = 124 - r
      if Gx.hash(floor(x), floor(y) + floor(t * 6)) < a * 0.5 then Gx.px(P.orange1, x, y, 0.8) end
    end
  end
  -- туман
  for layer = 1, 3 do
    local sp = 4 + layer * 3
    for x = 0, W, 4 do
      local n = love.math.noise(x * 0.012 + t * 0.02 * sp, layer * 3.1)
      local h = floor(6 + n * 18)
      Gx.r(P.gray2, x, 186 + layer * 12 - h, 4, h, 0.05 + layer * 0.025)
    end
  end
  -- трава на переднем плане
  for i = 0, 160 do
    local x = (i * 37) % (W + 20) - 10
    local h = 10 + Gx.hash(i, 3) * 26
    local sway = math.sin(t * 1.3 + i * 0.7) * 2.2
    Gx.line(P.black, x, 270, x + sway, 270 - h)
    if i % 3 == 0 then Gx.line(P.black, x + 2, 270, x + 2 + sway * 1.2, 262 - h) end
  end
  -- опавшие листья
  for i = 1, 8 do
    local lx = (Gx.hash(i, 31) * W + t * (8 + i * 2)) % (W + 20) - 10
    local ly = (Gx.hash(i, 32) * 200 + t * (10 + i)) % 280 - 10
    Gx.r(P.rust, lx + math.sin(t * 2 + i) * 4, ly, 2, 1, 0.8)
  end

  Ti.overlay(t)
end

function Ti.overlay(t)
  -- заголовок с редким сбоем
  local a = math.min(1, t / 2.5)
  local glitch = Gx.hash(floor(t * 10), 7) > 0.96
  if glitch then
    Gx.textOc("ПОД ФУНДАМЕНТОМ", W / 2 - 2, 48, P.red2, a * 0.6, Fonts.big)
    Gx.textOc("ПОД ФУНДАМЕНТОМ", W / 2 + 2, 48, P.blue3, a * 0.6, Fonts.big)
  end
  Gx.textOc("ПОД ФУНДАМЕНТОМ", W / 2, 48, P.white, a, Fonts.big)
  Gx.r(P.gray2, W / 2 - 70, 74, 140, 1, a * 0.6)
  Gx.textOc("ночь на 27 октября", W / 2, 78, P.gray3, math.min(1, t / 3.5))

  if UI.modal == "settings" then
    Settings.draw()
    return
  end
  -- меню
  App.titleRects = {}
  local ma = math.min(1, math.max(0, t - 1) / 1.5)
  for i, it in ipairs(ITEMS) do
    local dis = (i == 2 and not State.hasSave())
    local y = 196 + (i - 1) * 14
    local w = 120
    App.titleRects[i] = { W / 2 - w / 2, y - 1, w, 12 }
    local hov = UI.modal == nil and UI.mx >= W / 2 - w / 2 and UI.mx <= W / 2 + w / 2 and UI.my >= y - 1 and UI.my <= y + 11
    if hov then App.titleSel = i end
    local sel = App.titleSel == i and not dis
    if sel then
      Gx.r(P.black, W / 2 - w / 2, y - 1, w, 12, 0.55 * ma)
      Gx.r(P.orange2, W / 2 - w / 2 + 6, y + 4, 2, 2, ma)
      Gx.r(P.orange2, W / 2 + w / 2 - 8, y + 4, 2, 2, ma)
    end
    Gx.textOc(it, W / 2, y, dis and P.gray1 or (sel and P.white or P.gray3), ma)
  end
  Gx.textOc("Играть в наушниках. Боёв нет. Смерти нет.", W / 2, 258, P.gray2, ma)
end

return Ti
