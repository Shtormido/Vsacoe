-- Интерфейс: HUD, выборы, дневник, карта, «Слушать», мини-игры, курсор
local UI = {
  modal = nil, choiceResult = nil, toasts = {}, hintText = nil, hintT = 0,
  listening = false, listen = { hold = 0, src = nil, str = 0, sndT = 0, recorded = {} },
  mx = 0, my = 0, tab = 1, scroll = 0, mini = nil, miniResult = nil,
}
local lg = love.graphics

-------------------------------------------------------------- мышь
function UI.setMouse(x, y) UI.mx, UI.my = x, y end

function UI.mouseWorldX()
  if not World.sc then return nil end
  return UI.mx + World.camx
end

function UI.mouseWorldY() return UI.my end

-------------------------------------------------------------- тосты и подсказки
function UI.toast(text, dur)
  table.insert(UI.toasts, { text = text, t = dur or 3 })
  if #UI.toasts > 4 then table.remove(UI.toasts, 1) end
end

function UI.hint(text, dur)
  if G and G.settings and not G.settings.hints and not text:find("ПРОБЕЛ") and not text:find("очнулся") then
    -- подсказки управления можно отключить; сюжетные остаются
    if text:find("ЛКМ") or text:find("^F") or text:find("^Q") or text:find("^C") or text:find("^M") or text:find("Tab") then return end
  end
  UI.hintText = text
  UI.hintT = dur or 4
end

-------------------------------------------------------------- выбор реплики
function UI.openChoice(options, prompt)
  UI.modal = "choice"
  UI.choice = { options = options, prompt = prompt, hover = nil }
  UI.choiceResult = nil
end

local function choiceRects()
  local c = UI.choice
  local rects = {}
  local font = Fonts.small
  local y = H - 16 - #c.options * 15
  for i, o in ipairs(c.options) do
    local text = type(o) == "table" and o.text or o
    local w = font:getWidth(i .. ". " .. text) + 12
    rects[i] = { x = math.floor(W / 2 - w / 2), y = y + (i - 1) * 15, w = w, h = 14, text = i .. ". " .. text, dis = type(o) == "table" and o.disabled }
  end
  return rects
end

local function pickChoice(i)
  local o = UI.choice.options[i]
  if not o then return end
  if type(o) == "table" and o.disabled then
    Audio.play("click", 0.4, 0.6)
    if o.onDisabled then o.onDisabled() end
    return
  end
  UI.modal = nil
  UI.choiceResult = i
  Audio.play("click", 0.5)
end

-------------------------------------------------------------- записки
function UI.openDoc(id)
  UI.modal = "doc"
  UI.docId = id
  Audio.play("paper", 0.7)
end

-------------------------------------------------------------- дневник и карта
function UI.openJournal()
  UI.modal = "journal"
  UI.scroll = 0
  Audio.play("paper", 0.6)
end

function UI.openMap()
  UI.modal = "map"
  Audio.play("paper", 0.6)
  if G.flags.kalkaGot and not G.flags.kalkaDone then
    UI.kalka = UI.kalka or { x = 300, y = 80, drag = false }
  end
end

function UI.openPause()
  UI.modal = "pause"
  UI.pauseSel = 1
end

-------------------------------------------------------------- мини-игры
-- Свеча: удерживай ЛКМ/Пробел, отпусти, когда идёт сквозняк
function UI.candleGame()
  UI.modal = "candle"
  UI.mini = { p = 0, t = 0, draftIn = 1.6 + love.math.random() * 1.2, draft = 0, warn = 0, outT = 0 }
  UI.miniResult = nil
  waitUntil(function() return UI.modal == nil end)
  return UI.miniResult
end

-- Кирпичи: Лаптев стучит, игрок бьёт туда же
function UI.bricksGame()
  UI.modal = "bricks"
  UI.mini = { round = 1, out = {}, target = nil, phase = "knock", t = 0, clicks = 0, knocks = 0 }
  UI.miniResult = nil
  waitUntil(function() return UI.modal == nil end)
  return UI.miniResult
end

-- Имена: выбор верного из трёх по полустёртой карточке
function UI.namesGame(list, from, to)
  UI.modal = "names"
  UI.mini = { list = list, i = from, to = to, errors = 0, flash = 0, flashOk = true }
  UI.miniResult = nil
  waitUntil(function() return UI.modal == nil end)
  return UI.miniResult, UI.mini.i
end

-------------------------------------------------------------- «Слушать»
function UI.updateListen(dt)
  local sc = World.sc
  local want = love.keyboard.isDown("q") and G.flags.dictaphone and not UI.modal and sc and not sc.def.custom
    and not Script.blocking() and not World.player.frozen
  if want and not UI.listening then
    UI.listen.hold = 0
    UI.listen.sndT = 0.3
    World.player.tx = nil
    World.player.pending = nil
  end
  UI.listening = want
  if not want then return end
  local best, bd
  for _, s in ipairs(sc.def.listen or {}) do
    if not s.cond or s.cond(sc) then
      local d = math.abs(s.x - World.player.x)
      if not best or d < bd then best, bd = s, d end
    end
  end
  local L = UI.listen
  L.src = best
  if best then
    L.str = U.clamp(1 - bd / 320, 0, 1)
    L.dir = best.x > World.player.x and 1 or -1
    L.sndT = L.sndT - dt
    if L.sndT <= 0 then
      L.sndT = best.every or 3.2
      local snd = best.sound or "whisper"
      Audio.play(snd, 0.15 + 0.75 * L.str, best.pitch or 1)
    end
    local key = World.sceneId .. ":" .. best.id
    if L.str > 0.55 then
      L.hold = L.hold + dt
      if L.hold >= 1.8 and not UI.listen.recorded[key] then
        UI.listen.recorded[key] = true
        State.voice(best.id, best.text)
        if best.onRecord then
          Script.run(function() best.onRecord(sc) end, true, "rec")
        end
      end
    else
      L.hold = math.max(0, L.hold - dt)
    end
  else
    L.str = 0
  end
end

-------------------------------------------------------------- обновление
function UI.update(dt)
  for i = #UI.toasts, 1, -1 do
    local t = UI.toasts[i]
    t.t = t.t - dt
    if t.t <= 0 then table.remove(UI.toasts, i) end
  end
  if UI.hintT > 0 then UI.hintT = UI.hintT - dt if UI.hintT <= 0 then UI.hintText = nil end end
  UI.updateListen(dt)

  local m = UI.mini
  if UI.modal == "candle" then
    local holding = love.mouse.isDown(1) or love.keyboard.isDown("space")
    m.t = m.t + dt
    if m.outT > 0 then
      m.outT = m.outT - dt
    else
      m.draftIn = m.draftIn - dt
      if m.draftIn <= 0.6 and m.draftIn > 0 then m.warn = 1 end
      if m.draftIn <= 0 then
        m.draft = 0.9
        m.warn = 0
        m.draftIn = 1.8 + love.math.random() * 1.6
        Audio.play("whoosh", 0.6)
      end
      if m.draft > 0 then
        m.draft = m.draft - dt
        if holding and m.p > 0.05 then
          m.p = math.max(0, m.p - 0.45)
          m.outT = 0.8
          m.draft = 0
          Audio.play("gasp", 0.3, 1.4)
        end
      elseif holding then
        m.p = m.p + dt / 3.2
      else
        m.p = math.max(0, m.p - dt * 0.05)
      end
    end
    if m.p >= 1 then
      UI.modal = nil
      UI.miniResult = true
      Audio.play("whoosh", 0.4, 1.5)
    end
  elseif UI.modal == "bricks" then
    m.t = m.t + dt
    if m.phase == "knock" then
      if not m.target then
        repeat m.target = love.math.random(1, 15) until not m.out[m.target]
        m.knocks = 0
        m.t = -0.6
      end
      if m.t >= 0 and m.knocks < 3 and m.t >= m.knocks * 0.45 then
        m.knocks = m.knocks + 1
        m.glow = 0.3
        Audio.play("knock1", 0.9)
      end
      if m.knocks >= 3 and m.t > 1.5 then
        m.phase = "player"
        m.clicks = 0
        m.t = 0
      end
    elseif m.phase == "player" then
      if m.t > 6 then
        m.phase = "knock"
        m.t = 0
        m.knocks = 0
        m.target = nil
      end
    elseif m.phase == "done" then
      if m.t > 1.4 then
        UI.modal = nil
        UI.miniResult = true
      end
    end
    if m.glow then m.glow = m.glow - dt if m.glow <= 0 then m.glow = nil end end
  elseif UI.modal == "names" then
    if m.flash > 0 then m.flash = m.flash - dt end
  end
end

-------------------------------------------------------------- ввод
function UI.mousepressed(x, y, b)
  if UI.modal == "settings" then return Settings.mousepressed(x, y, b) end
  if UI.modal == "choice" then
    for i, r in ipairs(choiceRects()) do
      if x >= r.x and x <= r.x + r.w and y >= r.y and y <= r.y + r.h then pickChoice(i) return true end
    end
    return true
  elseif UI.modal == "doc" then
    UI.modal = nil
    return true
  elseif UI.modal == "journal" then
    for i, r in ipairs(UI.tabRects or {}) do
      if x >= r[1] and x <= r[1] + r[3] and y >= r[2] and y <= r[2] + r[4] then UI.tab = i UI.scroll = 0 return true end
    end
    if b == 2 then UI.modal = nil end
    return true
  elseif UI.modal == "map" then
    local k = UI.kalka
    if k and G.flags.kalkaGot and not G.flags.kalkaDone and x >= k.x and x <= k.x + 180 and y >= k.y and y <= k.y + 120 then
      k.drag = true
      k.ox, k.oy = x - k.x, y - k.y
    elseif b == 2 then
      UI.modal = nil
    end
    return true
  elseif UI.modal == "pause" then
    for i, r in ipairs(UI.pauseRects or {}) do
      if x >= r[1] and x <= r[1] + r[3] and y >= r[2] and y <= r[2] + r[4] then UI.pauseAction(i) return true end
    end
    return true
  elseif UI.modal == "bricks" then
    local m = UI.mini
    if m.phase ~= "player" then return true end
    for i, r in ipairs(UI.brickRects or {}) do
      if not m.out[i] and x >= r[1] and x <= r[1] + r[3] and y >= r[2] and y <= r[2] + r[4] then
        Audio.play("knock1", 0.8, 1.1)
        if i == m.target then
          m.clicks = m.clicks + 1
          m.glow = 0.15
          if m.clicks >= 3 then
            m.out[i] = true
            Audio.play("crack", 0.9)
            m.round = m.round + 1
            m.target = nil
            if m.round > 3 then
              m.phase = "done"
              m.t = 0
              Audio.play("collapse", 1)
            else
              m.phase = "knock"
              m.t = 0
            end
          end
        else
          m.clicks = 0
          m.phase = "knock"
          m.t = 0
          m.knocks = 0
        end
        return true
      end
    end
    return true
  elseif UI.modal == "names" then
    for i, r in ipairs(UI.nameRects or {}) do
      if x >= r[1] and x <= r[1] + r[3] and y >= r[2] and y <= r[2] + r[4] then UI.pickName(i) return true end
    end
    return true
  elseif UI.modal == "candle" then
    return true
  end
  return false
end

function UI.mousereleased(x, y, b)
  if UI.modal == "settings" then Settings.mousereleased() return end
  if UI.kalka then UI.kalka.drag = false end
  if UI.modal == "map" and UI.kalka and G.flags.kalkaGot and not G.flags.kalkaDone then
    local k = UI.kalka
    local mx, my = UI.mapOrigin()
    if math.abs(k.x - mx) < 10 and math.abs(k.y - my) < 10 then
      k.x, k.y = mx, my
      G.flags.kalkaDone = true
      Audio.play("paper", 0.8, 0.8)
      UI.modal = nil
    end
  end
end

function UI.mousemoved(x, y)
  if UI.modal == "settings" then Settings.mousemoved(x, y) return end
  if UI.modal == "map" and UI.kalka and UI.kalka.drag then
    UI.kalka.x = x - UI.kalka.ox
    UI.kalka.y = y - UI.kalka.oy
  end
end

function UI.wheelmoved(dy)
  if UI.modal == "journal" then
    UI.scroll = math.max(0, UI.scroll - dy * 12)
    return true
  end
  return false
end

function UI.pickName(i)
  local m = UI.mini
  local e = m.list[m.i]
  if e.options[i] == e.answer then
    m.flash = 0.5
    m.flashOk = true
    Audio.play("blip_SPIRIT", 0.6, 1.2)
    m.i = m.i + 1
    if m.i > m.to then
      UI.modal = nil
      UI.miniResult = "ok"
    end
  else
    m.errors = m.errors + 1
    m.flash = 0.6
    m.flashOk = false
    Audio.play("blip_ENEMY", 0.8)
    if m.errors >= 3 then
      UI.modal = nil
      UI.miniResult = "fail"
    end
  end
end

function UI.keypressed(k)
  if UI.modal == "settings" then return Settings.keypressed(k) end
  if UI.modal == "choice" then
    local n = tonumber(k)
    if n then pickChoice(n) end
    return true
  elseif UI.modal == "doc" then
    if k == "escape" or k == "return" or k == "space" or k == "e" or k == "tab" then UI.modal = nil end
    return true
  elseif UI.modal == "journal" then
    if k == "tab" or k == "escape" then UI.modal = nil
    elseif k == "left" or k == "a" then UI.tab = (UI.tab - 2) % 7 + 1 UI.scroll = 0
    elseif k == "right" or k == "d" then UI.tab = UI.tab % 7 + 1 UI.scroll = 0
    elseif k == "down" or k == "s" then UI.scroll = UI.scroll + 12
    elseif k == "up" or k == "w" then UI.scroll = math.max(0, UI.scroll - 12) end
    return true
  elseif UI.modal == "map" then
    if k == "m" or k == "escape" then UI.modal = nil end
    return true
  elseif UI.modal == "pause" then
    if k == "escape" then UI.modal = nil
    elseif k == "up" or k == "w" then UI.pauseSel = (UI.pauseSel - 2) % 3 + 1
    elseif k == "down" or k == "s" then UI.pauseSel = UI.pauseSel % 3 + 1
    elseif k == "return" or k == "space" then UI.pauseAction(UI.pauseSel) end
    return true
  elseif UI.modal == "names" then
    local n = tonumber(k)
    if n and n >= 1 and n <= 3 then UI.pickName(n) end
    return true
  elseif UI.modal then
    return true
  end
  return false
end

function UI.pauseAction(i)
  if i == 1 then UI.modal = nil
  elseif i == 2 then Settings.open("pause")
  elseif i == 3 then UI.modal = nil App.toTitle() end
end

-------------------------------------------------------------- отрисовка
local function box(x, y, w, h, a, border)
  lg.setColor(P.black[1], P.black[2], P.black[3], a or 0.9)
  lg.rectangle("fill", x, y, w, h)
  local b = border or P.gray2
  lg.setColor(b[1], b[2], b[3], 1)
  lg.rectangle("fill", x, y, w, 1)
  lg.rectangle("fill", x, y + h - 1, w, 1)
  lg.rectangle("fill", x, y, 1, h)
  lg.rectangle("fill", x + w - 1, y, 1, h)
end
UI.box = box

local function arrow(x, y, d, col)
  Gx.line(col, x - 4 * d, y, x + 4 * d, y)
  Gx.line(col, x + 4 * d, y, x + 1 * d, y - 3)
  Gx.line(col, x + 4 * d, y, x + 1 * d, y + 3)
end
UI.arrow = arrow

function UI.watchText()
  if G.flags.watchStopped then return "03:17" end
  local m = 2 * 60 + 52 + math.floor(G.time / 60)
  m = math.min(m, 3 * 60 + 16)
  return string.format("%02d:%02d", math.floor(m / 60), m % 60)
end

-- Компас: обычный, «вниз» (после Акта 3), дрожит у неупокоенных точек (после Акта 4)
function UI.drawCompass(cx, cy, r)
  lg.setColor(P.dk1)
  lg.circle("fill", cx, cy, r + 1)
  lg.setColor(P.gray1)
  lg.circle("fill", cx, cy, r)
  lg.setColor(P.dk2)
  lg.circle("fill", cx, cy, r - 2)
  Gx.px(P.gray4, cx, cy - r + 1)
  local t = love.timer.getTime()
  if G.flags.compassDown and not G.flags.kalkaDone then
    -- стрелка «проваливается» за край
    local k = (t * 0.8) % 1
    Gx.r(P.red2, cx - 1, cy - 1 + k * (r + 3), 2, math.max(0, 4 - k * 4))
    Gx.px(P.gray4, cx, cy)
    return
  end
  local amp = 0.08
  if G.flags.kalkaDone and World.sc and World.sc.def.unrest then
    local u = World.sc.def.unrest(World.sc)
    if u then
      local d = math.abs(u - World.player.x)
      amp = 0.15 + U.clamp(1 - d / 500, 0, 1) * 1.2
    end
  end
  local ang = -math.pi / 2 + math.sin(t * 17) * amp + math.sin(t * 7.3) * amp * 0.5
  Gx.line(P.red2, cx, cy, cx + math.cos(ang) * (r - 2), cy + math.sin(ang) * (r - 2))
  Gx.line(P.gray4, cx, cy, cx - math.cos(ang) * (r - 3), cy - math.sin(ang) * (r - 3))
end

function UI.drawHUD()
  if not World.sc or World.sc.def.custom or World.sc.def.noHud then return end
  -- батарейка
  if G.flags.lightTut then
    local x, y = 6, H - 14
    Gx.r(P.gray2, x, y, 22, 9)
    Gx.r(P.gray2, x + 22, y + 3, 2, 3)
    Gx.r(P.black, x + 1, y + 1, 20, 7)
    local w = math.floor(20 * G.battery)
    local col = G.battery > 0.3 and P.green3 or (G.battery > 0.12 and P.orange1 or P.red2)
    Gx.r(col, x + 1, y + 1, w, 7)
    Gx.text("x" .. G.spares, x + 27, y - 1, P.gray3)
    if G.light then Gx.text(G.dim and "тускло" or "", x + 42, y - 1, P.gray2) end
  end
  -- часы и компас
  Gx.textO(UI.watchText(), W - 34, 4, P.gray3)
  if G.flags.compassShown then UI.drawCompass(W - 46, 9, 5) end
  -- метка «Замри» и дыхание
  local b = World.breath
  if World.player.frozen then
    local x, y, w = W / 2 - 60, H - 30, 120
    if b.active then
      box(x - 4, y - 14, w + 8, 26, 0.75)
      Gx.textOc("Замри. Дыши в зелёном окне", W / 2, y - 12, P.gray4)
      Gx.r(P.dk2, x, y, w, 6)
      local a0, a1 = 2.15 / 3, 2.9 / 3
      Gx.r(P.green2, x + w * a0, y, w * (a1 - a0), 6)
      local ph = (b.t % 3.0) / 3.0
      Gx.r(b.ok and P.green3 or P.white, x + w * ph - 1, y - 2, 2, 10)
      if b.flash > 0 then
        Gx.textOc(b.last == "good" and "тихий вдох" or "шум!", W / 2, y + 8, b.last == "good" and P.green3 or P.red2)
      end
    else
      Gx.textOc("замер", W / 2, H - 16, P.gray3)
    end
  end
end

function UI.drawListen()
  if not UI.listening then return end
  local L = UI.listen
  lg.setColor(0, 0, 0, 0.65)
  lg.rectangle("fill", 0, 0, W, H)
  local green = L.str > 0.55
  local col = green and P.green3 or P.blue2
  local n = 32
  local bx = W / 2 - n * 4
  local t = love.timer.getTime()
  for i = 1, n do
    local hgt = 3 + (love.math.noise(i * 0.3, t * 3) * 30 + love.math.random() * 6) * (0.15 + L.str)
    if L.src and L.src.sound == "knock3" then
      hgt = hgt + ((t % 1.4) < 0.2 and 20 or 0) * L.str
    end
    Gx.r(col, bx + (i - 1) * 8, 150 - hgt, 6, hgt)
    Gx.r(col, bx + (i - 1) * 8, 152, 6, hgt * 0.3, 0.4)
  end
  Gx.textOc("СЛУШАТЬ", W / 2, 60, P.gray4)
  if L.src then
    if L.str > 0.08 then arrow(W / 2 + L.dir * 40, 74, L.dir, P.gray3) end
    if green then
      local n2 = math.floor(U.ulen(L.src.text) * math.min(1, L.hold / 1.8))
      local s = U.usub(L.src.text, 1, n2)
      local font = Fonts.small
      local _, lines = font:getWrap(s, 300)
      for i, ln in ipairs(lines) do Gx.textOc(ln, W / 2, 168 + (i - 1) * 12, L.src.kind == "bad" and P.red2 or P.violet2) end
      local key = World.sceneId .. ":" .. L.src.id
      if UI.listen.recorded[key] then Gx.textOc("* ЗАПИСАНО", W / 2, 200, P.green3) else
        Gx.r(P.dk2, W / 2 - 30, 200, 60, 3)
        Gx.r(P.green3, W / 2 - 30, 200, 60 * math.min(1, L.hold / 1.8), 3)
      end
    end
  else
    Gx.textOc("шорох воздуха", W / 2, 168, P.gray2)
  end
end

local tabs = { "Заметки", "Записки", "Голоса", "Цели", "Могилы", "Лёха", "Рюкзак" }

local function wrapLines(text, w)
  local _, ls = Fonts.small:getWrap(text, w)
  return ls
end

function UI.journalContent(tab)
  local out = {}
  local function add(text, col) for _, l in ipairs(wrapLines(text, 400)) do out[#out + 1] = { l, col or P.gray4 } end end
  if tab == 1 then
    add("Странности: " .. G.strange, P.orange2)
    out[#out + 1] = { "", P.gray4 }
    for _, n in ipairs(G.notes) do add("— " .. n) end
    if #G.notes == 0 then add("Пока пусто. Кликай по предметам.", P.gray2) end
  elseif tab == 2 then
    for _, id in ipairs(G.docs) do
      local d = DOCS[id]
      if d then
        add(d.title, P.yellow)
        add(d.text)
        out[#out + 1] = { "", P.gray4 }
      end
    end
    if #G.docs == 0 then add("Записок нет.", P.gray2) end
  elseif tab == 3 then
    for _, v in ipairs(G.voices) do add("— " .. v.text, P.violet2) end
    if #G.voices == 0 then add("Записей нет. Удерживай Q рядом со стенами.", P.gray2) end
  elseif tab == 4 then
    for i = #G.objectives, 1, -1 do
      local o = G.objectives[i]
      add((o.done and "[x] " or "[ ] ") .. o.text, o.done and P.gray2 or P.white)
    end
  elseif tab == 5 then
    local graves = {
      { "evd", "Евдокия, инокиня. 1887", "Монастырская" },
      { "laptev", "П. С. Лаптев. 1954", "Склад прораба" },
      { "alesha", "Алексей Миронов, 7 лет. 1931", "Липовая" },
      { "pit", "Общая яма 1892 г., 43 души", "Покровская, участок №7" },
    }
    if not G.flags.kalkaDone then add("Карта могил откроется, когда калька ляжет на карту.", P.gray2) end
    for _, g in ipairs(graves) do
      if G.flags["grave_" .. g[1]] or G.flags.kalkaDone then
        local st = G.flags["rest_" .. g[1]] and "упокоен" or "не упокоен"
        add(g[2] .. " — " .. g[3] .. ": " .. st, G.flags["rest_" .. g[1]] and P.violet2 or P.gray4)
      end
    end
  elseif tab == 6 then
    add("Лёха: " .. State.lehaStatus(), P.orange2)
  elseif tab == 7 then
    for k, name in pairs(ITEMS) do
      if G.inv[k] then add("• " .. name) end
    end
    if G.flags.tileTaken and not G.flags.rest_evd then add("• Обломок плитки (у Лёхи)", P.orange2) end
    if G.flags.dictaphone then add("• Диктофон (у Лёхи)", P.orange2) end
    add("• Батарейки про запас: " .. G.spares)
  end
  return out
end

function UI.drawJournal()
  lg.setColor(0, 0, 0, 0.7)
  lg.rectangle("fill", 0, 0, W, H)
  box(14, 10, W - 28, H - 20, 0.95, P.gray2)
  Gx.textO("ДНЕВНИК", 22, 14, P.white)
  UI.tabRects = {}
  local x = 22
  for i, t in ipairs(tabs) do
    local w = Fonts.small:getWidth(t) + 8
    UI.tabRects[i] = { x, 28, w, 12 }
    Gx.r(i == UI.tab and P.gray1 or P.dk1, x, 28, w, 12)
    Gx.text(t, x + 4, 29, i == UI.tab and P.white or P.gray3)
    x = x + w + 3
  end
  local content = UI.journalContent(UI.tab)
  local maxScroll = math.max(0, #content * 12 - 200)
  UI.scroll = math.min(UI.scroll, maxScroll)
  local y0 = 46 - UI.scroll
  for i, l in ipairs(content) do
    local y = y0 + (i - 1) * 12
    if y > 42 and y < H - 22 then Gx.text(l[1], 24, y, l[2]) end
  end
  Gx.text("Tab — закрыть, A/D — разделы, колесо — прокрутка", 22, H - 21, P.gray2)
end

function UI.drawDoc()
  local d = DOCS[UI.docId]
  lg.setColor(0, 0, 0, 0.75)
  lg.rectangle("fill", 0, 0, W, H)
  local x, y, w = 70, 30, W - 140
  local ls = wrapLines(d.text, w - 20)
  local h = 40 + #ls * 12
  Gx.r(P.cream, x, y, w, h)
  Gx.r(P.cream2, x + 2, y + 2, w - 4, 1)
  Gx.text(d.title, x + 10, y + 8, P.brown1)
  for i, l in ipairs(ls) do Gx.text(l, x + 10, y + 24 + (i - 1) * 12, P.black) end
  Gx.textOc("клик — закрыть", W / 2, y + h + 6, P.gray3)
end

-------------------------------------------------------------- карта
local MAP = { x = 60, y = 36, w = 360, h = 200 }
function UI.mapOrigin() return MAP.x + 90, MAP.y + 40 end

local nodes = {
  { id = "sev", name = "Северная", x = 40, y = 40 },
  { id = "lip", name = "Липовая", x = 110, y = 70 },
  { id = "cen", name = "Центральная", x = 200, y = 80 },
  { id = "mon", name = "Монастырская", x = 150, y = 135 },
  { id = "pok", name = "Покровская", x = 250, y = 150 },
  { id = "dep", name = "Депо", x = 300, y = 50 },
  { id = "skl", name = "Склад", x = 230, y = 185 },
}
local nodeById = {}
for _, n in ipairs(nodes) do nodeById[n.id] = n end

local SCENE_NODE = {
  surface = "sev", corridor = "sev", severnaya = "sev", tunnel_sl = "lip", lipovaya = "lip",
  tunnel_drip = "lip", side_passage = "lip", booth = "lip", niche_dict = "cen", cable_tunnel = "cen",
  clock_platform = "cen", hands_passage = "mon", monastyrskaya = "mon", tunnel3 = "mon", mirror = "cen",
  admin_corridor = "cen", office = "cen", krots = "cen", depot = "dep", flooded = "skl", laptev_store = "skl",
  glow_tunnel = "lip", tunnel_pokr = "pok", pokrovskaya = "pok",
}

function UI.drawMap()
  lg.setColor(0, 0, 0, 0.75)
  lg.rectangle("fill", 0, 0, W, H)
  local mx, my, mw, mh = MAP.x, MAP.y, MAP.w, MAP.h
  Gx.r(P.cream2, mx - 4, my - 4, mw + 8, mh + 8)
  Gx.r(P.cream, mx, my, mw, mh)
  Gx.textO("КАРТА", mx, my - 16, P.white)
  if not G.mapFrag[1] then
    Gx.textOc("Карты пока нет. Найди схему.", mx + mw / 2, my + mh / 2, P.brown1)
    Gx.textOc("M — закрыть", W / 2, H - 14, P.gray3)
    return
  end
  local lies = G.flags.mapLies
  local t = love.timer.getTime()
  local function pos(n)
    local x, y = n.x, n.y
    if lies then
      local s = math.floor(t * 0.5)
      x = x + (Gx.hash(n.x + s, 1) - 0.5) * 30
      y = y + (Gx.hash(n.y + s, 2) - 0.5) * 20
    end
    return mx + x, my + y
  end
  local function link(a, b, dashed)
    local ax, ay = pos(nodeById[a])
    local bx, by = pos(nodeById[b])
    if dashed then
      local steps = 20
      for i = 0, steps - 1, 2 do
        local t0, t1 = i / steps, (i + 1) / steps
        Gx.line(P.gray2, ax + (bx - ax) * t0, ay + (by - ay) * t0, ax + (bx - ax) * t1, ay + (by - ay) * t1)
      end
    else
      Gx.line(P.dk2, ax, ay, bx, by)
      Gx.line(P.dk2, ax, ay + 1, bx, by + 1)
    end
  end
  link("sev", "lip") link("lip", "cen") link("cen", "mon") link("mon", "pok") link("cen", "dep")
  if G.mapFrag[2] then link("mon", "skl", true) link("cen", "mon", true) end
  if G.mapFrag[3] then link("dep", "mon", true) end
  if G.mapFrag[4] then link("skl", "pok", true) link("pok", "lip", true) end
  for _, n in ipairs(nodes) do
    if n.id ~= "skl" or G.mapFrag[2] then
      local x, y = pos(n)
      Gx.r(P.dk1, x - 3, y - 3, 7, 7)
      Gx.r(P.cream, x - 1, y - 1, 3, 3)
      local name = n.name
      if lies and Gx.hash(n.x, math.floor(t)) > 0.6 then
        name = nodes[(math.floor(t) + n.x) % #nodes + 1].name
      end
      Gx.text(name, x + 6, y - 5, P.black)
    end
  end
  -- чужие пометки
  local cx, cy = pos(nodeById.cen)
  local dx, dy = pos(nodeById.dep)
  Gx.text("НЕ ХОДИТЬ", (cx + dx) / 2 - 10, (cy + dy) / 2 - 12, P.red2)
  local ox, oy = pos(nodeById.mon)
  Gx.text("ТУТ СЛЫШНО", ox - 30, oy + 6, P.blue2)
  if G.mapFrag[2] then
    local sx, sy = pos(nodeById.skl)
    Gx.text("ВОДА", (ox + sx) / 2 - 12, (oy + sy) / 2 - 4, P.gray1)
  else
    Gx.text("ВОДА", ox + 40, oy + 30, P.gray1)
  end
  Gx.text("ВЫХОД", cx + 4, cy + 8, P.gray1)
  UI.arrow(cx + 40, cy + 13, 1, P.gray1)
  -- игрок
  local nid = SCENE_NODE[World.sceneId]
  if nid then
    local x, y = pos(nodeById[nid])
    if lies and not G.flags.kalkaDone then
      Gx.text("?", x - 2, y - 16, P.red1)
    else
      Gx.r(P.blue2, x - 2, y - 12, 5, 5)
    end
  end
  -- неупокоенные точки
  if G.flags.kalkaDone then
    local marks = { { "evd", "mon" }, { "laptev", "skl" }, { "alesha", "lip" }, { "pit", "pok" } }
    for _, mk in ipairs(marks) do
      local x, y = pos(nodeById[mk[2]])
      if G.flags["rest_" .. mk[1]] then
        Gx.candle(x + 10, y + 10, t, true)
      else
        Gx.line(P.violet1, x + 6, y + 4, x + 12, y + 10)
        Gx.line(P.violet1, x + 12, y + 4, x + 6, y + 10)
      end
    end
  end
  -- калька
  if G.flags.kalkaGot then
    local k = UI.kalka or { x = UI.mapOrigin() }
    local kx, ky
    if G.flags.kalkaDone then kx, ky = UI.mapOrigin() else kx, ky = k.x, k.y end
    UI.drawKalka(kx, ky, G.flags.kalkaDone and 0.45 or 0.75)
    if not G.flags.kalkaDone then
      Gx.textOc("Перетащи кальку на карту (ЛКМ)", W / 2, H - 24, P.yellow)
    end
  end
  -- компас
  if G.flags.compassShown then UI.drawCompass(mx + mw - 18, my + 18, 12) end
  Gx.textOc("M — закрыть", W / 2, H - 13, P.gray3)
end

-- Калька: план кладбища. Её левый верхний угол совпадает с mapOrigin.
function UI.drawKalka(x, y, a)
  lg.setColor(0.9, 0.92, 0.95, a * 0.6)
  lg.rectangle("fill", x, y, 180, 120)
  local col = P.blue1
  -- аллеи: участок 7 лежит под «Покровской» (250-90=160, 150-40=110)
  Gx.line(col, x + 4, y + 30, x + 176, y + 50, a)
  Gx.text("Липовая аллея", x + 6, y + 18, col, a)
  Gx.line(col, x + 60, y + 4, x + 120, y + 116, a)
  Gx.text("Главная аллея", x + 96, y + 70, col, a)
  Gx.text("Сев. ворота", x + 4, y + 2, col, a)
  for i, pl in ipairs({ { 10, 40 }, { 40, 60 }, { 100, 20 }, { 130, 40 }, { 20, 90 }, { 70, 80 }, { 150, 100 } }) do
    Gx.r(col, x + pl[1], y + pl[2], 14, 10, a * 0.3)
    Gx.text(tostring(i), x + pl[1] + 4, y + pl[2], col, a)
    if i == 7 then
      for c = 0, 2 do
        Gx.line(col, x + pl[1] + 2 + c * 4, y + pl[2] - 6, x + pl[1] + 2 + c * 4, y + pl[2] - 2, a)
        Gx.line(col, x + pl[1] + 1 + c * 4, y + pl[2] - 5, x + pl[1] + 3 + c * 4, y + pl[2] - 5, a)
      end
    end
  end
end

-------------------------------------------------------------- мини-игры: отрисовка
function UI.drawCandle()
  local m = UI.mini
  lg.setColor(0, 0, 0, 0.8)
  lg.rectangle("fill", 0, 0, W, H)
  local cx, cy = W / 2, 190
  Gx.r(P.cream, cx - 6, cy - 50, 12, 50)
  Gx.r(P.cream2, cx - 6, cy - 50, 3, 50)
  Gx.r(P.dk1, cx, cy - 56, 1, 6)
  local t = love.timer.getTime()
  local s = m.p
  if s > 0.02 then
    local fh = 6 + s * 18
    local sway = m.draft > 0 and 6 or math.sin(t * 9) * 1.5
    for i = 0, fh do
      local w = math.max(1, math.floor((1 - i / fh) * (3 + s * 5)))
      local col = i < fh * 0.3 and P.yellow or P.orange2
      Gx.r(col, cx - w / 2 + sway * i / fh, cy - 57 - i, w, 1)
    end
  end
  if m.warn > 0 or m.draft > 0 then
    for i = 1, 5 do
      local y = 80 + i * 14
      local x = (t * 200 + i * 60) % (W + 80) - 40
      Gx.r(P.gray3, x, y, 24, 1, 0.6)
    end
    Gx.textOc(m.draft > 0 and "Сквозняк! Отпусти!" or "Тянет сквозняком...", W / 2, 60, P.gray4)
  end
  Gx.r(P.dk2, W / 2 - 60, 220, 120, 4)
  Gx.r(P.orange2, W / 2 - 60, 220, 120 * m.p, 4)
  Gx.textOc("Удерживай ЛКМ или ПРОБЕЛ, чтобы зажечь свечу", W / 2, 232, P.gray4)
  if m.outT > 0 then Gx.textOc("Пламя сбило", W / 2, 76, P.red2) end
end

function UI.drawBricks()
  local m = UI.mini
  lg.setColor(0, 0, 0, 0.8)
  lg.rectangle("fill", 0, 0, W, H)
  UI.brickRects = {}
  local bw, bh = 44, 20
  local x0, y0 = W / 2 - 5 * bw / 2 - 11, 60
  local i = 0
  for r = 0, 2 do
    for c = 0, 4 do
      i = i + 1
      local x = x0 + c * bw + (r % 2) * 22
      local y = y0 + r * bh
      UI.brickRects[i] = { x, y, bw - 2, bh - 2 }
      if m.out[i] then
        Gx.r(P.black, x, y, bw - 2, bh - 2)
      else
        local col = (Gx.hash(i, 1) > 0.5) and P.rust or P.brown2
        Gx.r(col, x, y, bw - 2, bh - 2)
        Gx.r(P.water, x, y + bh - 5, bw - 2, 3, 0.5)
        if i == m.target and (m.glow or m.phase == "player") then
          Gx.r(P.white, x, y, bw - 2, bh - 2, m.glow and 0.55 or 0.12)
        end
      end
    end
  end
  local msg = "Лаптев стучит. Слушай, куда."
  if m.phase == "player" then msg = "Бей туда же: три удара (ЛКМ). Кирпич " .. m.round .. " из 3" end
  if m.phase == "done" then msg = "Стена поддаётся..." end
  Gx.textOc(msg, W / 2, 140, P.violet2)
  for k = 1, 3 do Gx.r(k <= (m.phase == "player" and m.clicks or 0) and P.white or P.dk2, W / 2 - 14 + (k - 1) * 10, 156, 6, 6) end
end

function UI.drawNames()
  local m = UI.mini
  local e = m.list[m.i]
  lg.setColor(0, 0, 0, 0.6)
  lg.rectangle("fill", 0, 0, W, H)
  Gx.textOc("Имя " .. m.i .. " из 43", W / 2, 24, P.gray3)
  -- карточка из монастырской книги
  Gx.r(P.cream, W / 2 - 80, 40, 160, 46)
  Gx.r(P.cream2, W / 2 - 78, 42, 156, 1)
  Gx.textOc("Монастырская книга, 1892", W / 2, 46, P.brown2)
  Gx.textOc(e.card, W / 2, 62, P.black, 1, Fonts.big)
  UI.nameRects = {}
  for i, o in ipairs(e.options) do
    local w = 130
    local x = W / 2 - w / 2
    local y = 100 + (i - 1) * 18
    UI.nameRects[i] = { x, y, w, 15 }
    local hov = UI.mx >= x and UI.mx <= x + w and UI.my >= y and UI.my <= y + 15
    box(x, y, w, 15, 0.85, hov and P.violet2 or P.gray1)
    Gx.textOc(i .. ". " .. o, W / 2, y + 3, hov and P.white or P.gray4)
  end
  for k = 1, 3 do Gx.r(k <= m.errors and P.red2 or P.dk2, W / 2 - 14 + (k - 1) * 10, 160, 6, 6) end
  if m.flash > 0 then
    Gx.textOc(m.flashOk and "Фигура шагнула в свет" or "Проповедник ближе...", W / 2, 172, m.flashOk and P.violet2 or P.red2)
  end
  -- края темнеют от ошибок
  if m.errors > 0 then
    local a = m.errors * 0.25
    for i = 0, 30 do
      lg.setColor(0, 0, 0, a * (1 - i / 30))
      lg.rectangle("fill", i, 0, 1, H)
      lg.rectangle("fill", W - 1 - i, 0, 1, H)
    end
  end
end

function UI.drawChoice()
  local c = UI.choice
  local rects = choiceRects()
  if c.prompt then Gx.textOc(c.prompt, W / 2, rects[1].y - 14, P.gray4) end
  for i, r in ipairs(rects) do
    local hov = UI.mx >= r.x and UI.mx <= r.x + r.w and UI.my >= r.y and UI.my <= r.y + r.h
    box(r.x, r.y, r.w, r.h, 0.88, hov and P.blue3 or P.gray1)
    Gx.text(r.text, r.x + 6, r.y + 1, r.dis and P.gray2 or (hov and P.white or P.gray4))
  end
end

local pauseItems = { "Продолжить", "Настройки", "Выйти в меню" }
function UI.drawPause()
  lg.setColor(0, 0, 0, 0.7)
  lg.rectangle("fill", 0, 0, W, H)
  Gx.textOc("ПАУЗА", W / 2, 60, P.white, 1, Fonts.big)
  UI.pauseRects = {}
  for i, it in ipairs(pauseItems) do
    local label = it
    local y = 100 + (i - 1) * 16
    local w = 150
    UI.pauseRects[i] = { W / 2 - w / 2, y, w, 13 }
    local hov = UI.mx >= W / 2 - w / 2 and UI.mx <= W / 2 + w / 2 and UI.my >= y and UI.my <= y + 13
    if hov then UI.pauseSel = i end
    box(W / 2 - w / 2, y, w, 13, 0.85, UI.pauseSel == i and P.blue3 or P.gray1)
    Gx.textOc(label, W / 2, y + 2, UI.pauseSel == i and P.white or P.gray4)
  end
  local help = {
    "ЛКМ — идти / осмотреть   ПКМ — отмена   A/D — шаг",
    "F — фонарь   колесо — тусклый режим   R — батарейка",
    "Q (держать) — Слушать   ПРОБЕЛ (держать) — Замри",
    "Tab — дневник   M — карта   C — метка мелом (Shift+C — крест)",
  }
  for i, h in ipairs(help) do Gx.textOc(h, W / 2, 190 + (i - 1) * 11, P.gray3) end
end

function UI.drawOverlay()
  -- мерцание предметов рядом с курсором
  local sc = World.sc
  if sc and not sc.def.custom and not UI.modal and G.settings.hints then
    local wx = UI.mouseWorldX()
    local t = love.timer.getTime()
    for _, o in ipairs(World.objects()) do
      if not o.noShimmer then
        local x, y, w, h = o.x, o.y or (FLOOR - (o.h or 20)), o.w or 20, o.h or 20
        local cx = x + w / 2
        if math.abs(cx - wx) < w / 2 + 40 and math.abs((y + h / 2) - UI.my) < h / 2 + 40 then
          for k = 1, 4 do
            local hx = Gx.hash(k + math.floor(t * 3), o.x)
            local hy = Gx.hash(o.x, k + math.floor(t * 3))
            Gx.px(o.exit and P.blue3 or P.yellow, x + hx * w - World.camx, y + hy * h, 0.55)
          end
        end
      end
    end
  end
  -- подпись под курсором
  local hov = nil
  if sc and not sc.def.custom and not UI.modal and not Script.blocking() then
    hov = World.objectAt(UI.mouseWorldX(), UI.my)
  end
  UI.hoverObj = hov
  if hov and hov.name then
    local s = hov.name
    local w = Fonts.small:getWidth(s)
    local x = U.clamp(UI.mx - w / 2, 2, W - w - 2)
    Gx.textO(s, x, UI.my + 9, hov.exit and P.blue3 or P.white)
  end
end

function UI.drawCursor()
  local x, y = math.floor(UI.mx), math.floor(UI.my)
  local hov = UI.hoverObj
  if UI.modal and UI.modal ~= "map" then hov = nil end
  if hov and hov.exit then
    Gx.r(P.black, x - 4, y - 4, 9, 9, 0.5)
    UI.arrow(x, y, (hov.x + (hov.w or 20) / 2 > World.player.x) and 1 or -1, P.blue3)
  elseif hov then
    -- «глаз»
    Gx.r(P.black, x - 5, y - 3, 11, 7, 0.5)
    Gx.r(P.white, x - 4, y - 1, 9, 3)
    Gx.r(P.white, x - 2, y - 2, 5, 5)
    Gx.r(P.black, x - 1, y - 1, 3, 3)
  else
    Gx.r(P.black, x - 1, y - 4, 3, 9, 0.6)
    Gx.r(P.black, x - 4, y - 1, 9, 3, 0.6)
    Gx.r(P.white, x, y - 3, 1, 7)
    Gx.r(P.white, x - 3, y, 7, 1)
  end
end

function UI.draw()
  if UI.modal ~= "journal" and UI.modal ~= "map" and UI.modal ~= "doc" then UI.drawHUD() end
  UI.drawListen()
  -- тосты
  for i, t in ipairs(UI.toasts) do
    local a = math.min(1, t.t)
    Gx.textO(t.text, 6, 4 + (i - 1) * 11, P.gray4, a)
  end
  if UI.hintText then
    local a = math.min(1, UI.hintT)
    local w = Fonts.small:getWidth(UI.hintText) + 12
    box(W / 2 - w / 2, 28, w, 14, 0.7 * a, P.dk2)
    Gx.textOc(UI.hintText, W / 2, 30, P.yellow, a)
  end
  if UI.modal == "choice" then UI.drawChoice()
  elseif UI.modal == "doc" then UI.drawDoc()
  elseif UI.modal == "journal" then UI.drawJournal()
  elseif UI.modal == "map" then UI.drawMap()
  elseif UI.modal == "pause" then UI.drawPause()
  elseif UI.modal == "settings" then
    if Settings.back == "pause" then UI.drawPause() end
    Settings.draw()
  elseif UI.modal == "candle" then UI.drawCandle()
  elseif UI.modal == "bricks" then UI.drawBricks()
  elseif UI.modal == "names" then UI.drawNames()
  end
end

return UI
