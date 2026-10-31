-- «ПОД ФУНДАМЕНТОМ» — 2D пиксельный хоррор-адвенчур
love.graphics.setDefaultFilter("nearest", "nearest")
love.graphics.setLineStyle("rough")

W, H = 480, 270

U = require("src.util")
P = require("src.palette")
Gx = require("src.gfx")
Audio = require("src.audio")
Script = require("src.script")
Dialog = require("src.dialog")
State = require("src.state")
World = require("src.world")
Fx = require("src.fx")
UI = require("src.ui")
Settings = require("src.settings")

App = { mode = "title", titleSel = 1, args = {} }

local worldCanvas, finalCanvas, lightShader, fadeShader
local scale, offX, offY = 3, 0, 0

-------------------------------------------------------------- шейдер света
-- Конус фонаря, точечные источники, дизеринг Байера 4×4 и виньетка
local BAYER = [[
number bayer(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  number m = 0.0;
  if (i == 0) m = 0.0; else if (i == 1) m = 8.0; else if (i == 2) m = 2.0; else if (i == 3) m = 10.0;
  else if (i == 4) m = 12.0; else if (i == 5) m = 4.0; else if (i == 6) m = 14.0; else if (i == 7) m = 6.0;
  else if (i == 8) m = 3.0; else if (i == 9) m = 11.0; else if (i == 10) m = 1.0; else if (i == 11) m = 9.0;
  else if (i == 12) m = 15.0; else if (i == 13) m = 7.0; else if (i == 14) m = 13.0; else m = 5.0;
  return m / 16.0;
}
]]

-- Свет: конус фонаря с объёмным лучом, точечные источники со свечением воздуха,
-- дизеринг Байера, холодные тени, зерно плёнки, хроматическая аберрация, виньетка паники
local shaderCode = [[
extern vec3 L_pos[14];
extern vec3 L_col[14];
extern number L_n;
extern vec4 C_a;
extern vec4 C_b;
extern vec4 Amb;
extern vec2 Size;
extern number Bright;
extern number Time;
extern number Grain;
extern number Aberr;
extern number Panic;
]] .. BAYER .. [[
number hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec4 effect(vec4 color, Image tex, vec2 tc, vec2 sc) {
  vec2 p = floor(tc * Size);
  vec3 px;
  if (Aberr > 0.01) {
    vec2 o = vec2(Aberr / Size.x, 0.0);
    px = vec3(Texel(tex, tc + o).r, Texel(tex, tc).g, Texel(tex, tc - o).b);
  } else {
    px = Texel(tex, tc).rgb;
  }
  vec3 light = (vec3(0.55) + Amb.rgb * 0.9) * Amb.a * 1.55;
  vec3 haze = vec3(0.0);
  for (int i = 0; i < 14; i++) {
    if (float(i) >= L_n) break;
    number d = distance(p, L_pos[i].xy);
    number a = clamp(1.0 - d / L_pos[i].z, 0.0, 1.0);
    light += L_col[i] * a * a;
    haze += L_col[i] * a * a * a * 0.12;
  }
  if (C_b.w > 0.0) {
    vec2 v = p - C_a.xy;
    number dist = length(v);
    if (dist > 0.5) {
      number cs = dot(v / dist, C_a.zw);
      number edge = cos(C_b.y);
      number inner = cos(C_b.y * 0.55);
      number ang = smoothstep(edge, inner, cs);
      number fall = clamp(1.0 - dist / C_b.x, 0.0, 1.0);
      // пятно фонаря с кольцами отражателя
      number ring = 0.92 + 0.08 * sin(dist * 0.35 - cs * 30.0);
      light += vec3(1.0, 0.86, 0.62) * ang * sqrt(fall) * 1.15 * C_b.w * ring;
      // объёмный луч в воздухе
      haze += vec3(1.0, 0.82, 0.55) * ang * fall * fall * 0.085 * C_b.w;
    }
    number halo = clamp(1.0 - distance(p, C_a.xy) / 34.0, 0.0, 1.0);
    light += vec3(1.0, 0.85, 0.6) * halo * 0.35 * C_b.w;
  }
  light *= Bright;
  number b = bayer(p);
  vec3 q = floor(light * 6.0 + b) / 6.0;
  q = min(q, vec3(1.3));
  vec3 hz = floor(haze * Bright * 40.0 + b) / 40.0;
  vec3 c = px * q + hz;
  // холодные тени
  number l = dot(c, vec3(0.3, 0.59, 0.11));
  c += vec3(-0.004, 0.003, 0.02) * (1.0 - smoothstep(0.0, 0.22, l));
  // паника выцветает картинку и сужает обзор
  c = mix(c, vec3(l), Panic * 0.35);
  vec2 uv = tc - 0.5;
  number vig = clamp(1.0 - dot(uv, uv) * (0.9 + Panic * 1.8), 0.0, 1.0);
  // зерно плёнки (по пикселям мира, 12 кадров в секунду)
  number g = hash(p + vec2(floor(Time * 12.0) * 17.0, floor(Time * 12.0) * 29.0)) - 0.5;
  c += g * 0.07 * Grain * (0.4 + l);
  return vec4(c * vig, 1.0);
}
]]

-- Переход «пиксельным растворением»
local fadeCode = [[
extern number Fade;
extern number Scale;
]] .. BAYER .. [[
vec4 effect(vec4 color, Image t, vec2 tc, vec2 sc) {
  number b = bayer(floor(sc / Scale));
  if (b >= Fade * 1.07 - 0.04) discard;
  return vec4(0.0, 0.0, 0.0, 1.0);
}
]]

local function sendSafe(sh, name, ...)
  pcall(sh.send, sh, name, ...)
end

-------------------------------------------------------------- загрузка
function love.load(args)
  App.args = args or {}
  if App.args[1] == "--test" then
    love.errorhandler = function(msg)
      print("[test] ОШИБКА: " .. tostring(msg))
      print(debug.traceback())
      io.stdout:flush()
      os.exit(1)
    end
  end
  love.mouse.setVisible(false)
  Fonts = {}
  worldCanvas = love.graphics.newCanvas(W, H)
  lightShader = love.graphics.newShader(shaderCode)
  fadeShader = love.graphics.newShader(fadeCode)
  G = { settings = State.loadSettings() }
  Audio.init()
  Audio.startMusicThread()
  require("src.scenes.act1")
  require("src.scenes.act2")
  require("src.scenes.act3")
  require("src.scenes.act4")
  require("src.scenes.act5")
  require("src.scenes.act6")
  require("src.scenes.endings")
  App.makeIcon()
  App.resize()
  Settings.apply(false)
  App.toTitle()
  if App.args[1] == "--test" then App.test = require("src.selftest") App.test.start(App.args) end
end

function App.makeIcon()
  local d = love.image.newImageData(32, 32)
  for y = 0, 31 do
    for x = 0, 31 do
      local c = P.night
      if y > 20 then c = P.dk1 end
      if x >= 12 and x <= 19 and y >= 12 and y <= 24 then c = P.rust end
      if x >= 10 and x <= 21 and y >= 9 and y <= 12 then c = P.gray2 end
      if (x - 24) ^ 2 + (y - 7) ^ 2 < 10 then c = P.cream end
      d:setPixel(x, y, c[1], c[2], c[3], 1)
    end
  end
  pcall(love.window.setIcon, d)
end

-- Шрифт-обёртка: растеризуется в size*k, рисуется с масштабом 1/k
local function makeFont(size, k)
  local f = love.graphics.newFont("assets/Handjet.ttf", size * k, "mono")
  f:setFilter("nearest", "nearest")
  local o = { f = f, s = 1 / k }
  function o:getWidth(t) return self.f:getWidth(t) * self.s end
  function o:getHeight() return self.f:getHeight() * self.s end
  function o:getWrap(t, w)
    local ww, lines = self.f:getWrap(t, w / self.s)
    return ww * self.s, lines
  end
  return o
end

local fontScale
function App.resize()
  local ww, wh = love.graphics.getDimensions()
  scale = math.max(1, math.floor(math.min(ww / W, wh / H)))
  offX = math.floor((ww - W * scale) / 2)
  offY = math.floor((wh - H * scale) / 2)
  if fontScale ~= scale then
    fontScale = scale
    Fonts.small = makeFont(12, scale)
    Fonts.big = makeFont(24, scale)
    Fonts.wsmall = Fonts.wsmall or makeFont(13, 1)
    Fonts.wbig = Fonts.wbig or makeFont(24, 1)
    finalCanvas = love.graphics.newCanvas(W * scale, H * scale)
  end
end

function love.resize() App.resize() end

function App.toTitle()
  Script.clear()
  Dialog.clear()
  UI.modal = nil
  Audio.stopAll()
  Audio.amb("wind", 0.25, 0.3)
  Audio.setMusic("title", 0.6)
  App.mode = "title"
  App.titleT = 0
  App.titleSel = 1
end

function App.newGame()
  State.new()
  Script.clear()
  Dialog.clear()
  Audio.stopAll()
  App.mode = "play"
  World.fade = 1
  World.enter("surface", 200, 1)
  World.fadeTo(0, 1.5)
end

function App.continueGame()
  if not State.load() then return end
  Script.clear()
  Dialog.clear()
  Audio.stopAll()
  App.mode = "play"
  World.fade = 1
  World.enter(G.scene, G.x)
  World.fadeTo(0, 1)
end

-------------------------------------------------------------- цикл
local function step(dt)
  if App.test then App.test.update(dt) end
  if App.mode == "title" then
    App.titleT = App.titleT + dt
    Audio.update(dt)
    return
  end
  if UI.modal == "settings" then
    Dialog.setPaused(true)
    Audio.update(dt)
    return
  end
  local m = UI.modal
  local paused = m == "pause" or m == "journal" or m == "map" or m == "doc"
  Dialog.setPaused(paused or m == "settings")
  if not paused then
    Script.update(dt)
    Dialog.update(dt)
    World.update(dt)
  end
  UI.update(dt)
  Audio.update(dt, UI.listening and 0.3 or 1)
end

function love.update(dt)
  dt = math.min(dt, 1 / 20)
  local mx, my = love.mouse.getPosition()
  UI.setMouse(U.clamp((mx - offX) / scale, 0, W - 1), U.clamp((my - offY) / scale, 0, H - 1))
  if App.test then
    for _ = 1, 10 do step(1 / 20) end
  else
    step(dt)
  end
end

local Title = require("src.title")

function love.draw()
  local lg = love.graphics
  if App.mode == "title" then
    lg.setCanvas(finalCanvas)
    lg.clear(0, 0, 0, 1)
    lg.push()
    lg.scale(scale)
    Title.draw(App.titleT)
    UI.drawCursor()
    lg.pop()
    lg.setCanvas()
  else
    lg.setCanvas(worldCanvas)
    Gx.world = true
    World.drawWorld()
    Gx.world = false
    lg.setCanvas(finalCanvas)
    lg.clear(0, 0, 0, 1)
    local lights, cone, amb = World.lightData()
    local pos, col = {}, {}
    for i, L in ipairs(lights) do
      pos[i] = { L[1], L[2], L[3] }
      col[i] = { L[4], L[5], L[6] }
    end
    if #pos == 0 then pos[1] = { -999, -999, 1 } col[1] = { 0, 0, 0 } end
    sendSafe(lightShader, "L_pos", unpack(pos))
    sendSafe(lightShader, "L_col", unpack(col))
    sendSafe(lightShader, "L_n", #lights)
    if cone then
      sendSafe(lightShader, "C_a", { cone[1], cone[2], cone[3], cone[4] })
      sendSafe(lightShader, "C_b", { cone[5], cone[6], 0, cone[7] })
    else
      sendSafe(lightShader, "C_a", { 0, 0, 1, 0 })
      sendSafe(lightShader, "C_b", { 1, 0.1, 0, 0 })
    end
    local ac = amb[2] or P.blue2
    sendSafe(lightShader, "Amb", { ac[1], ac[2], ac[3], amb[1] })
    sendSafe(lightShader, "Size", { W, H })
    local st = G.settings
    sendSafe(lightShader, "Bright", st.bright or 1)
    sendSafe(lightShader, "Time", love.timer.getTime() % 1000)
    sendSafe(lightShader, "Grain", st.grain and 1 or 0)
    sendSafe(lightShader, "Aberr", st.fx and World.fx.aberr or 0)
    sendSafe(lightShader, "Panic", (World.sc.def.custom and 0 or (G.panic or 0) / 100) * (st.fx and 1 or 0.4))
    lg.setShader(lightShader)
    lg.setColor(1, 1, 1, 1)
    lg.draw(worldCanvas, 0, 0, 0, scale, scale)
    lg.setShader()
    lg.push()
    lg.scale(scale)
    local sc = World.sc
    World.drawMotes()
    lg.push()
    lg.translate(-math.floor(World.camx) + World.camx, 0)
    Fx.drawShafts(World.camx)
    Fx.drawGlints(World.camx)
    lg.pop()
    if sc.def.postLight then
      lg.push()
      lg.translate(-math.floor(World.camx), 0)
      sc.def.postLight(sc)
      lg.pop()
    end
    if sc.def.overlay then sc.def.overlay(sc) end
    Dialog.draw(math.floor(World.camx) - (World.drawOffX or 0), 0, 0)
    UI.drawOverlay()
    UI.draw()
    if World.fade > 0 then
      sendSafe(fadeShader, "Fade", World.fade)
      sendSafe(fadeShader, "Scale", scale)
      lg.setShader(fadeShader)
      lg.setColor(0, 0, 0, 1)
      lg.rectangle("fill", 0, 0, W, H)
      lg.setShader()
    end
    if sc.def.overFade then sc.def.overFade(sc) end
    if World.fade < 0.95 or UI.modal then UI.drawCursor() end
    lg.pop()
    lg.setCanvas()
  end
  lg.clear(0, 0, 0, 1)
  lg.setColor(1, 1, 1, 1)
  lg.draw(finalCanvas, offX, offY)
  if App.test and App.test.afterDraw then App.test.afterDraw() end
end

-------------------------------------------------------------- ввод
local function toCanvas(x, y) return (x - offX) / scale, (y - offY) / scale end

function love.mousepressed(x, y, b)
  local cx, cy = toCanvas(x, y)
  if App.mode == "title" then
    if UI.modal == "settings" then Settings.mousepressed(cx, cy, b) return end
    for i, r in ipairs(App.titleRects or {}) do
      if cx >= r[1] and cx <= r[1] + r[3] and cy >= r[2] and cy <= r[2] + r[4] then App.titleAction(i) end
    end
    return
  end
  if UI.mousepressed(cx, cy, b) then return end
  if World.sc.def.mousepressed and World.sc.def.mousepressed(World.sc, cx, cy, b) then return end
  if Script.blocking() or World.sc.def.custom then
    if b == 1 then Dialog.skip() end
    return
  end
  if UI.listening or World.player.frozen then return end
  World.click(cx + World.camx, cy, b)
end

function love.mousereleased(x, y, b)
  local cx, cy = toCanvas(x, y)
  UI.mousereleased(cx, cy, b)
end

function love.mousemoved(x, y)
  local cx, cy = toCanvas(x, y)
  UI.mousemoved(cx, cy)
end

function love.wheelmoved(dx, dy)
  if App.mode ~= "play" then return end
  if UI.wheelmoved(dy) then return end
  if G.flags.lightTut and dy ~= 0 then
    G.dim = dy < 0
    UI.toast(G.dim and "Фонарь: тусклый режим" or "Фонарь: обычный режим", 1.5)
  end
end

function App.titleAction(i)
  if i == 1 then App.newGame()
  elseif i == 2 then if State.hasSave() then App.continueGame() end
  elseif i == 3 then Settings.open(nil)
  elseif i == 4 then love.event.quit() end
end

function App.toggleFullscreen()
  G.settings.fullscreen = not love.window.getFullscreen()
  love.window.setFullscreen(G.settings.fullscreen)
  App.resize()
  State.saveSettings()
end

function love.keypressed(k)
  if k == "f11" or (k == "return" and love.keyboard.isDown("lalt", "ralt")) then
    App.toggleFullscreen()
    return
  end
  if App.mode == "title" and UI.modal == "settings" then Settings.keypressed(k) return end
  if App.mode == "title" then
    if k == "up" or k == "w" then App.titleSel = (App.titleSel - 2) % 4 + 1
    elseif k == "down" or k == "s" then App.titleSel = App.titleSel % 4 + 1
    elseif k == "return" or k == "space" then App.titleAction(App.titleSel)
    elseif k == "escape" then love.event.quit() end
    return
  end
  if UI.keypressed(k) then return end
  if k == "escape" then UI.openPause() return end
  if k == "space" then World.spacePressed() end
  if World.sc.def.keypressed and World.sc.def.keypressed(World.sc, k) then return end
  if k == "return" or k == "e" then Dialog.skip() return end
  if Script.blocking() and not (k == "tab" or k == "m") then return end
  if World.sc.def.custom then return end
  if k == "tab" then UI.openJournal()
  elseif k == "m" then
    UI.openMap()
    if World.sc.def.onMap then World.sc.def.onMap(World.sc) end
  elseif k == "f" then World.toggleLight()
  elseif k == "r" then World.swapBattery()
  elseif k == "c" then World.placeMark()
  end
end

function love.keyreleased(k)
  if App.mode ~= "play" then return end
  if k == "space" then World.spaceReleased() end
end
