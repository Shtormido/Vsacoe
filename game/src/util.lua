-- Мелкие вспомогательные функции
utf8 = require("utf8")

local U = {}

function U.clamp(v, a, b) if v < a then return a elseif v > b then return b end return v end
function U.lerp(a, b, t) return a + (b - a) * t end
function U.approach(v, target, step)
  if v < target then return math.min(v + step, target) end
  return math.max(v - step, target)
end
function U.sign(v) if v < 0 then return -1 end return 1 end

function U.ulen(s) return utf8.len(s) or #s end

-- Подстрока по символам (UTF-8), индексы с 1
function U.usub(s, i, j)
  local len = U.ulen(s)
  j = j or len
  if j > len then j = len end
  if i < 1 then i = 1 end
  if j < i then return "" end
  local bi = utf8.offset(s, i)
  local bj = utf8.offset(s, j + 1)
  return s:sub(bi, (bj or (#s + 1)) - 1)
end

function U.shuffle(t)
  for i = #t, 2, -1 do
    local j = love.math.random(i)
    t[i], t[j] = t[j], t[i]
  end
  return t
end

function U.copy(t)
  if type(t) ~= "table" then return t end
  local r = {}
  for k, v in pairs(t) do r[k] = U.copy(v) end
  return r
end

-- Сериализация таблицы в Lua-текст (для сохранений)
local function ser(v, ind)
  local tv = type(v)
  if tv == "number" or tv == "boolean" then return tostring(v) end
  if tv == "string" then return string.format("%q", v) end
  if tv ~= "table" then return "nil" end
  ind = ind or ""
  local parts = {}
  local ni = ind .. " "
  for k, val in pairs(v) do
    local key
    if type(k) == "number" then key = "[" .. k .. "]"
    else key = "[" .. string.format("%q", k) .. "]" end
    parts[#parts + 1] = ni .. key .. "=" .. ser(val, ni)
  end
  return "{\n" .. table.concat(parts, ",\n") .. "\n" .. ind .. "}"
end
U.ser = ser

function U.deser(s)
  local f = loadstring("return " .. s)
  if not f then return nil end
  setfenv(f, {})
  local ok, r = pcall(f)
  if ok then return r end
  return nil
end

return U
