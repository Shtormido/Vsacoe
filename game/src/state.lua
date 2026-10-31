-- Состояние партии: флаги, рюкзак, дневник, скрытые параметры, сохранение
local St = {}

DOCS = require("src.data.docs")

ITEMS = {
  horse   = "Деревянная лошадка",
  rosary  = "Чётки",
  candle  = "Свечи",
  letter  = "Письмо Лаптева",
  act7    = "Акт №7 с перечнем имён",
  kalka   = "Калька с планом кладбища",
  skull   = "Череп",
  chalk   = "Мелок",
  compass = "Компас",
}

function St.new()
  G = {
    scene = "surface", x = 200, act = 1,
    flags = {}, done = {}, inv = { chalk = true, compass = true },
    notes = {}, docs = {}, voices = {}, objectives = {},
    battery = 1, spares = 0, panic = 0, trust = 0, strange = 0,
    time = 0, marks = {}, mapFrag = {}, examined = {}, seen = {},
    rest = nil, settings = Settings.fill(G and G.settings),
  }
end

-------------------------------------------------------------- дневник
function St.note(id, text)
  if G.examined[id] then return end
  G.examined[id] = true
  table.insert(G.notes, text)
  UI.toast("Дневник: заметка")
end

function St.doc(id)
  for _, d in ipairs(G.docs) do if d == id then return end end
  table.insert(G.docs, id)
  UI.toast("Дневник: записка " .. id)
end

function St.voice(id, text)
  for _, v in ipairs(G.voices) do if v.id == id then return false end end
  table.insert(G.voices, { id = id, text = text })
  UI.toast("Дневник: голос записан")
  return true
end

function St.objective(id, text)
  for _, o in ipairs(G.objectives) do if o.id == id then o.text = text return end end
  table.insert(G.objectives, { id = id, text = text })
  UI.toast("Цель: " .. text, 4)
end

function St.complete(id)
  for _, o in ipairs(G.objectives) do if o.id == id then o.done = true end end
end

function St.panic(d)
  G.panic = U.clamp(G.panic + d, 0, 100)
end

function St.trust(d)
  G.trust = U.clamp(G.trust + d, 0, 3)
end

function St.strange(n, abs)
  if abs then G.strange = math.max(G.strange, n) else G.strange = G.strange + n end
end

function St.give(item)
  G.inv[item] = true
  UI.toast("Рюкзак: " .. (ITEMS[item] or item))
end

function St.has(item) return G.inv[item] == true end
function St.take(item) G.inv[item] = nil end

function St.lehaStatus()
  if G.flags.possessed and not G.flags.freed then return "одержим" end
  if G.panic >= 70 then return "на грани" end
  if G.panic >= 35 then return "нервничает" end
  return "ничего"
end

-------------------------------------------------------------- сохранение
function St.save()
  G.scene = World.sceneId
  G.x = World.player.x
  local ok = pcall(love.filesystem.write, "save.lua", U.ser(G))
  if ok then UI.toast("Игра сохранена") end
end

function St.hasSave()
  return love.filesystem.getInfo("save.lua") ~= nil
end

function St.load()
  local s = love.filesystem.read("save.lua")
  if not s then return false end
  local t = U.deser(s)
  if not t then return false end
  local settings = G and G.settings
  G = t
  G.settings = Settings.fill(settings or G.settings)
  return true
end

function St.saveSettings()
  pcall(love.filesystem.write, "settings.lua", U.ser(G.settings))
end

function St.loadSettings()
  local s = love.filesystem.read("settings.lua")
  if s then
    local t = U.deser(s)
    if t then return Settings.fill(t) end
  end
  return Settings.fill({})
end

return St
