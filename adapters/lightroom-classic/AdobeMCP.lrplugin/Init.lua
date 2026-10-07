local LrApplication = import "LrApplication"
local LrExportSession = import "LrExportSession"
local LrHttp = import "LrHttp"
local LrTasks = import "LrTasks"

local Json = dofile(_PLUGIN.path .. "/Json.lua")
local BASE = "http://127.0.0.1:38470/adapter/lightroom-classic"
local HEADERS = { { field = "Content-Type", value = "application/json" } }
local CAPABILITIES = { "lightroom-classic.catalog.manage" }

_G.__adobe_mcp_lightroom_running = true

local function post(path, value)
    return LrHttp.post(BASE .. path, Json.encode(value), HEADERS, "POST", 3)
end

local function get(path)
    return LrHttp.get(BASE .. path, nil, 3)
end

local function safeRaw(photo, key)
    local ok, value = pcall(function() return photo:getRawMetadata(key) end)
    if ok then return value end
    return nil
end

local function safeFormatted(photo, key)
    local ok, value = pcall(function() return photo:getFormattedMetadata(key) end)
    if ok then return value end
    return nil
end

local function photoSummary(photo)
    return {
        localIdentifier = photo.localIdentifier,
        path = safeRaw(photo, "path"),
        fileName = safeRaw(photo, "fileName"),
        fileFormat = safeRaw(photo, "fileFormat"),
        rating = safeRaw(photo, "rating"),
        label = safeRaw(photo, "label"),
        title = safeRaw(photo, "title"),
        caption = safeRaw(photo, "caption"),
        captureTime = safeRaw(photo, "captureTime"),
        dimensions = safeFormatted(photo, "dimensions"),
        cameraModel = safeFormatted(photo, "cameraModel"),
        lens = safeFormatted(photo, "lens"),
    }
end

local function resolvePhotos(catalog, params)
    local result = {}
    if type(params.paths) == "table" and #params.paths > 0 then
        for _, path in ipairs(params.paths) do
            local photo = catalog:findPhotoByPath(path)
            if photo then result[#result + 1] = photo end
        end
        return result
    end
    local target = catalog:getTargetPhotos()
    for _, photo in ipairs(target or {}) do result[#result + 1] = photo end
    return result
end

local function inspect()
    local catalog = LrApplication.activeCatalog()
    local selected = resolvePhotos(catalog, {})
    local photos = {}
    for i = 1, math.min(#selected, 100) do photos[#photos + 1] = photoSummary(selected[i]) end
    local target = catalog:getTargetPhoto()
    return {
        catalogPath = catalog:getPath(),
        selectedCount = #selected,
        targetPhoto = target and photoSummary(target) or nil,
        selectedPhotos = photos,
        truncated = #selected > 100,
    }
end

local writableMetadata = {
    rating=true, label=true, title=true, caption=true, copyName=true, creator=true,
    creatorJobTitle=true, creatorAddress=true, creatorCity=true, creatorStateProvince=true,
    creatorPostalCode=true, creatorCountry=true, creatorPhone=true, creatorEmail=true,
    creatorUrl=true, headline=true, descriptionWriter=true, dateCreated=true, location=true,
    city=true, stateProvince=true, country=true, isoCountryCode=true, intellectualGenre=true,
}

local function metadataGet(catalog, params)
    local photos = resolvePhotos(catalog, params)
    local keys = type(params.keys) == "table" and params.keys or { "rating", "label", "title", "caption" }
    local out = {}
    for _, photo in ipairs(photos) do
        local values = {}
        for _, key in ipairs(keys) do values[key] = safeRaw(photo, key) end
        out[#out + 1] = { photo = photoSummary(photo), metadata = values }
    end
    return { photos = out }
end

local function metadataSet(catalog, params)
    if type(params.values) ~= "table" then error("values_required") end
    local photos = resolvePhotos(catalog, params)
    if #photos == 0 then error("no_target_photos") end
    local changed = {}
    catalog:withWriteAccessDo("Adobe MCP metadata", function()
        for _, photo in ipairs(photos) do
            local writes = {}
            for key, value in pairs(params.values) do
                if not writableMetadata[key] then error("unsupported_metadata_key:" .. tostring(key)) end
                photo:setRawMetadata(key, value)
                writes[key] = value
            end
            changed[#changed + 1] = { path = safeRaw(photo, "path"), values = writes }
        end
    end)
    return { changed = changed }
end

local function applyDevelop(catalog, params)
    if type(params.settings) ~= "table" then error("settings_required") end
    local photos = resolvePhotos(catalog, params)
    if #photos == 0 then error("no_target_photos") end
    local presetName = tostring(params.name or ("Adobe MCP " .. os.time()))
    local preset = LrApplication.addDevelopPresetForPlugin(_PLUGIN, presetName, params.settings)
    catalog:withWriteAccessDo("Adobe MCP develop preset", function()
        for _, photo in ipairs(photos) do photo:applyDevelopPreset(preset, _PLUGIN) end
    end)
    return { applied = #photos, presetName = presetName }
end

local function rotate(catalog, params)
    local photos = resolvePhotos(catalog, params)
    if #photos == 0 then error("no_target_photos") end
    local direction = params.direction == "left" and "left" or "right"
    catalog:withWriteAccessDo("Adobe MCP rotate", function()
        for _, photo in ipairs(photos) do
            if direction == "left" then photo:rotateLeft() else photo:rotateRight() end
        end
    end)
    return { rotated = #photos, direction = direction }
end

local function importPhotos(catalog, params)
    if type(params.paths) ~= "table" or #params.paths == 0 then error("paths_required") end
    local imported = {}
    catalog:withWriteAccessDo("Adobe MCP import", function()
        for _, path in ipairs(params.paths) do
            local photo = catalog:findPhotoByPath(path)
            if not photo then photo = catalog:addPhoto(path) end
            imported[#imported + 1] = photo and photoSummary(photo) or { path = path, pending = true }
        end
    end)
    return { imported = imported }
end

local function virtualCopies(catalog, params)
    local created
    catalog:withWriteAccessDo("Adobe MCP virtual copies", function()
        created = catalog:createVirtualCopies(params.copyName and tostring(params.copyName) or nil)
    end)
    local out = {}
    for _, photo in ipairs(created or {}) do out[#out + 1] = photoSummary(photo) end
    return { copies = out }
end

local function collectionCreate(catalog, params)
    if type(params.name) ~= "string" or params.name == "" then error("name_required") end
    local collection
    catalog:withWriteAccessDo("Adobe MCP collection", function()
        collection = catalog:createCollection(params.name, nil, true)
        if params.addSelected ~= false then
            local photos = resolvePhotos(catalog, params)
            if #photos > 0 then collection:addPhotos(photos) end
        end
    end)
    return { name = collection:getName(), localIdentifier = collection.localIdentifier }
end

local function exportPhotos(catalog, params)
    local photos = resolvePhotos(catalog, params)
    if #photos == 0 then error("no_target_photos") end
    if type(params.outputDir) ~= "string" or params.outputDir == "" then error("outputDir_required") end

    local settings = {
        LR_export_destinationType = "specificFolder",
        LR_export_destinationPathPrefix = params.outputDir,
        LR_export_useSubfolder = false,
        LR_collisionHandling = params.collisionHandling or "overwrite",
        LR_format = params.format or "JPEG",
        LR_export_colorSpace = params.colorSpace or "sRGB",
        LR_jpeg_quality = tonumber(params.jpegQuality) or 0.9,
        LR_size_doConstrain = params.maxWidth ~= nil or params.maxHeight ~= nil,
        LR_size_resizeType = "wh",
        LR_size_maxWidth = tonumber(params.maxWidth) or 100000,
        LR_size_maxHeight = tonumber(params.maxHeight) or 100000,
    }
    if type(params.exportSettings) == "table" then
        for key, value in pairs(params.exportSettings) do settings[key] = value end
    end

    local session = LrExportSession { photosToExport = photos, exportSettings = settings }
    local outputs = {}
    for _, rendition in session:renditions() do
        local ok, pathOrMessage = rendition:waitForRender()
        outputs[#outputs + 1] = {
            ok = ok == true,
            path = ok and pathOrMessage or nil,
            error = ok and nil or tostring(pathOrMessage),
        }
    end
    return { exported = outputs, count = #outputs }
end

local function dispatch(op, params)
    local catalog = LrApplication.activeCatalog()
    params = params or {}
    if op ~= "lightroom-classic.catalog.manage" then error("unsupported_operation:" .. tostring(op)) end
    local operation = tostring(params.operation or "inspect")
    if operation == "inspect" then return inspect() end
    if operation == "metadata.get" then return metadataGet(catalog, params) end
    if operation == "metadata.set" then return metadataSet(catalog, params) end
    if operation == "develop.apply" then return applyDevelop(catalog, params) end
    if operation == "rotate" then return rotate(catalog, params) end
    if operation == "import" then return importPhotos(catalog, params) end
    if operation == "virtualCopies" then return virtualCopies(catalog, params) end
    if operation == "collection.create" then return collectionCreate(catalog, params) end
    if operation == "export" then return exportPhotos(catalog, params) end
    error("unsupported_lightroom_operation:" .. operation)
end

local function hello()
    local version = LrApplication.versionTable()
    post("/hello", {
        appVersion = tostring(version.major or ""),
        adapterVersion = "0.1.0",
        capabilities = CAPABILITIES,
    })
end

local function sendContext()
    pcall(function()
        post("/event", { type = "event", event = "context", data = inspect() })
    end)
end

LrTasks.startAsyncTaskWithoutErrorHandler(function()
    local lastHello = 0
    local lastContext = 0
    while _G.__adobe_mcp_lightroom_running do
        local now = os.time()
        if now - lastHello >= 5 then pcall(hello); lastHello = now end
        if now - lastContext >= 5 then sendContext(); lastContext = now end

        local ok, body, info = pcall(get, "/poll")
        if ok and body and info and info.status == 200 then
            local parsedOk, message = pcall(Json.decode, body)
            if parsedOk and type(message) == "table" and message.type == "command" and message.id then
                local commandOk, data = pcall(dispatch, message.op, message.params or {})
                post("/result", {
                    type = "result",
                    id = message.id,
                    ok = commandOk,
                    data = commandOk and data or nil,
                    error = commandOk and nil or tostring(data),
                })
                if commandOk then sendContext() end
            end
        end
        LrTasks.sleep(0.35)
    end
end, "Adobe MCP bridge")
