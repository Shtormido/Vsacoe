-- Экран настроек: громкость, яркость, эффекты. Открывается из титров и из паузы.
local Se = { sel = 1, drag = nil, back = nil }
local lg = love.graphics

Se.DEFAULTS = {
  volume = 0.8, music = 0.7, sfx = 1.0, bright = 1.0, voice = true, voiceVol = 0.9,
  grain = true, fx = true, shake = true, hints = true, fullscreen = false,
}

local ITEMS = {
  { key = "volume", label = "Общая громкость", kind = "slider", min = 0, max = 1, step = 0.05 },
  { key = "music", label = "Музыка", kind = "slider", min = 0, max = 1, step = 0.05 },
  { key = "sfx", label = "Звуки", kind = "slider", min = 0, max = 1, step = 0.05 },
  { key = "voice", label = "Озвучка персонажей", kind = "toggle" },
  { key = "voiceVol", label = "Громкость озвучки", kind = "slider", min = 0, max = 1, step = 0.05 },
  { key = "bright", label = "Яркость", kind = "slider", min = 0.5, max = 1.6, step = 0.05 },
  { key = "grain", label = "Зерно плёнки", kind = "toggle" },
  { key = "fx", label = "Искажения при испуге", kind = "toggle" },
  { key = "shake", label = "Тряска экрана", kind = "toggle" },
  { key = "hints", label = "Подсказки", kind = "toggle" },
  { key = "fullscreen", label = "Полный экран", kind = "toggle" },
  { label = "Назад", kind = "back" },
}

function Se.fill(s)
  s = s or {}
  for k, v in pairs(Se.DEFAULTS) do if s[k] == nil then s[k] = v end end
  return s
end

function Se.apply(saveIt)
  local s = G.settings
  Audio.master = s.volume
  Audio.mus = s.music
  Audio.sfx = s.sfx
  if love.window.getFullscreen() ~= s.fullscreen then
    love.window.setFullscreen(s.fullscreen)
    App.resize()
  end
  if saveIt then State.saveSettings() end
end

function Se.open(back)
  Se.back = back
  Se.sel = 1
  UI.modal = "settings"
end

local function close()
  Se.apply(true)
  UI.modal = Se.back
end

local PX, PY, PW = 110, 20, 260
local ROW = 14
local BAR_X, BAR_W = PX + 140, 90

local function rowY(i) return PY + 22 + (i - 1) * ROW end

local function setSlider(it, v)
  v = U.clamp(v, it.min, it.max)
  v = math.floor(v / it.step + 0.5) * it.step
  G.settings[it.key] = v
  Se.apply(false)
end

local function adjust(it, dir)
  if it.kind == "slider" then
    setSlider(it, G.settings[it.key] + dir * it.step)
    Audio.play("click", 0.5, 1 + dir * 0.1)
  elseif it.kind == "toggle" then
    G.settings[it.key] = not G.settings[it.key]
    Se.apply(false)
    Audio.play("click", 0.5)
  elseif it.kind == "back" then
    close()
  end
end

function Se.keypressed(k)
  if k == "escape" or k == "backspace" then close()
  elseif k == "up" or k == "w" then Se.sel = (Se.sel - 2) % #ITEMS + 1
  elseif k == "down" or k == "s" then Se.sel = Se.sel % #ITEMS + 1
  elseif k == "left" or k == "a" then adjust(ITEMS[Se.sel], -1)
  elseif k == "right" or k == "d" then adjust(ITEMS[Se.sel], 1)
  elseif k == "return" or k == "space" then
    local it = ITEMS[Se.sel]
    if it.kind ~= "slider" then adjust(it, 1) end
  end
  return true
end

local function sliderAt(x, y)
  for i, it in ipairs(ITEMS) do
    local ry = rowY(i)
    if it.kind == "slider" and y >= ry - 1 and y <= ry + 11 and x >= BAR_X - 4 and x <= BAR_X + BAR_W + 4 then return it end
  end
end

function Se.mousepressed(x, y, b)
  if b == 2 then close() return true end
  local it = sliderAt(x, y)
  if it then
    Se.drag = it
    setSlider(it, it.min + (x - BAR_X) / BAR_W * (it.max - it.min))
    return true
  end
  for i, row in ipairs(ITEMS) do
    local ry = rowY(i)
    if y >= ry - 2 and y <= ry + 11 and x >= PX and x <= PX + PW then
      Se.sel = i
      if row.kind == "slider" then
        adjust(row, x < BAR_X and -1 or 1)
      else
        adjust(row, 1)
      end
      return true
    end
  end
  return true
end

function Se.mousemoved(x, y)
  if Se.drag and love.mouse.isDown(1) then
    local it = Se.drag
    setSlider(it, it.min + (x - BAR_X) / BAR_W * (it.max - it.min))
  else
    Se.drag = nil
  end
end

function Se.mousereleased()
  if Se.drag then Audio.play("click", 0.4) end
  Se.drag = nil
end

function Se.draw()
  lg.setColor(0, 0, 0, 0.9)
  lg.rectangle("fill", 0, 0, W, H)
  local h = #ITEMS * ROW + 30
  UI.box(PX, PY, PW, h, 0.92, P.gray2)
  Gx.textOc("НАСТРОЙКИ", W / 2, PY + 5, P.white)
  for i, it in ipairs(ITEMS) do
    local y = rowY(i)
    local hov = UI.mx >= PX and UI.mx <= PX + PW and UI.my >= y - 2 and UI.my <= y + 11
    if hov and not Se.drag then Se.sel = i end
    local act = Se.sel == i
    if act then Gx.r(P.blue1, PX + 3, y - 2, PW - 6, 13, 0.7) end
    local col = act and P.white or P.gray4
    if it.kind == "back" then
      Gx.textOc(it.label, W / 2, y, col)
    else
      Gx.text(it.label, PX + 10, y, col)
    end
    if it.kind == "slider" then
      local v = G.settings[it.key]
      local k = (v - it.min) / (it.max - it.min)
      Gx.r(P.dk2, BAR_X, y + 4, BAR_W, 3)
      Gx.r(act and P.blue3 or P.gray3, BAR_X, y + 4, BAR_W * k, 3)
      Gx.r(P.white, BAR_X + BAR_W * k - 1, y + 1, 3, 9)
      local label = math.floor(v * 100 + 0.5) .. "%"
      Gx.text(label, BAR_X + BAR_W + 8, y, col)
      if act then
        UI.arrow(BAR_X - 9, y + 5, -1, P.gray3)
      end
    elseif it.kind == "toggle" then
      local on = G.settings[it.key]
      Gx.r(on and P.green2 or P.dk2, BAR_X, y + 1, 26, 9)
      Gx.r(on and P.green3 or P.gray2, BAR_X + (on and 15 or 2), y + 2, 9, 7)
      Gx.text(on and "вкл" or "выкл", BAR_X + 34, y, col)
    end
  end
  -- калибровка яркости: левый квадрат должен быть едва виден
  local b = G.settings.bright
  local by = PY + h + 6
  for i, v in ipairs({ 0.03, 0.07, 0.14 }) do
    local c = v * b * 1.6
    lg.setColor(c, c, c * 1.1, 1)
    lg.rectangle("fill", PX + (i - 1) * 22, by, 18, 12)
  end
  Gx.text("Яркость: левый квадрат должен быть едва виден", PX + 72, by, P.gray3)
  Gx.textOc("Стрелки или A/D — изменить, Esc — назад", W / 2, H - 14, P.gray2)
end

return Se
