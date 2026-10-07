local Json = {}

local function escapeString(value)
    return value:gsub('[%z\1-\31\\"]', function(ch)
        local map = { ['"']='\\"', ['\\']='\\\\', ['\b']='\\b', ['\f']='\\f', ['\n']='\\n', ['\r']='\\r', ['\t']='\\t' }
        return map[ch] or string.format("\\u%04x", string.byte(ch))
    end)
end

local function isArray(value)
    if type(value) ~= "table" then return false, 0 end
    local count, max = 0, 0
    for key, _ in pairs(value) do
        if type(key) ~= "number" or key < 1 or key % 1 ~= 0 then return false, 0 end
        if key > max then max = key end
        count = count + 1
    end
    return count == max, max
end

function Json.encode(value)
    local kind = type(value)
    if kind == "nil" then return "null" end
    if kind == "boolean" then return value and "true" or "false" end
    if kind == "number" then
        if value ~= value or value == math.huge or value == -math.huge then return "null" end
        return tostring(value)
    end
    if kind == "string" then return '"' .. escapeString(value) .. '"' end
    if kind ~= "table" then return Json.encode(tostring(value)) end

    local array, length = isArray(value)
    local parts = {}
    if array then
        for i = 1, length do parts[#parts + 1] = Json.encode(value[i]) end
        return "[" .. table.concat(parts, ",") .. "]"
    end

    for key, child in pairs(value) do
        parts[#parts + 1] = Json.encode(tostring(key)) .. ":" .. Json.encode(child)
    end
    table.sort(parts)
    return "{" .. table.concat(parts, ",") .. "}"
end

local function utf8(code)
    if code < 0x80 then return string.char(code) end
    if code < 0x800 then return string.char(0xC0 + math.floor(code / 0x40), 0x80 + code % 0x40) end
    return string.char(0xE0 + math.floor(code / 0x1000), 0x80 + math.floor(code / 0x40) % 0x40, 0x80 + code % 0x40)
end

function Json.decode(text)
    local pos, length = 1, #text
    local function skip()
        while pos <= length and text:sub(pos,pos):match("%s") do pos = pos + 1 end
    end
    local parseValue

    local function parseString()
        pos = pos + 1
        local out = {}
        while pos <= length do
            local ch = text:sub(pos,pos)
            if ch == '"' then pos = pos + 1; return table.concat(out) end
            if ch == "\\" then
                pos = pos + 1
                local esc = text:sub(pos,pos)
                local map = { ['"']='"', ['\\']='\\', ['/']='/', ['b']='\b', ['f']='\f', ['n']='\n', ['r']='\r', ['t']='\t' }
                if esc == "u" then
                    local hex = text:sub(pos + 1, pos + 4)
                    if not hex:match("^%x%x%x%x$") then error("invalid_unicode_escape") end
                    out[#out + 1] = utf8(tonumber(hex, 16))
                    pos = pos + 5
                else
                    if not map[esc] then error("invalid_escape") end
                    out[#out + 1] = map[esc]
                    pos = pos + 1
                end
            else
                out[#out + 1] = ch
                pos = pos + 1
            end
        end
        error("unterminated_string")
    end

    local function parseNumber()
        local start = pos
        while pos <= length and text:sub(pos,pos):match("[0-9eE+%.%-]") do pos = pos + 1 end
        local value = tonumber(text:sub(start, pos - 1))
        if value == nil then error("invalid_number") end
        return value
    end

    local function parseArray()
        pos = pos + 1
        local result = {}
        skip()
        if text:sub(pos,pos) == "]" then pos = pos + 1; return result end
        while true do
            result[#result + 1] = parseValue()
            skip()
            local ch = text:sub(pos,pos)
            if ch == "]" then pos = pos + 1; return result end
            if ch ~= "," then error("expected_array_separator") end
            pos = pos + 1
        end
    end

    local function parseObject()
        pos = pos + 1
        local result = {}
        skip()
        if text:sub(pos,pos) == "}" then pos = pos + 1; return result end
        while true do
            skip()
            if text:sub(pos,pos) ~= '"' then error("expected_object_key") end
            local key = parseString()
            skip()
            if text:sub(pos,pos) ~= ":" then error("expected_colon") end
            pos = pos + 1
            result[key] = parseValue()
            skip()
            local ch = text:sub(pos,pos)
            if ch == "}" then pos = pos + 1; return result end
            if ch ~= "," then error("expected_object_separator") end
            pos = pos + 1
        end
    end

    parseValue = function()
        skip()
        local ch = text:sub(pos,pos)
        if ch == '"' then return parseString() end
        if ch == "{" then return parseObject() end
        if ch == "[" then return parseArray() end
        if ch == "-" or ch:match("%d") then return parseNumber() end
        if text:sub(pos,pos + 3) == "true" then pos = pos + 4; return true end
        if text:sub(pos,pos + 4) == "false" then pos = pos + 5; return false end
        if text:sub(pos,pos + 3) == "null" then pos = pos + 4; return nil end
        error("invalid_json_value_at_" .. tostring(pos))
    end

    local value = parseValue()
    skip()
    if pos <= length then error("trailing_json") end
    return value
end

return Json
