---@class progress.lsp.Token
---@field title string
---@field message string?
---@field percent number?
---@field updated integer hrtime

---@class progress.lsp.Client
---@field name string
---@field tokens table<lsp.ProgressToken, progress.lsp.Token>
---@field count integer
---@field latest lsp.ProgressToken? The token with the most recent update.
---@field alive fun(): boolean
---@field on_stale fun()

local core = require("progress")

local M = {}

local SOURCE = "progress.lsp"
local IDLE_TIMEOUT_MS = 60000

---@type table<integer, progress.lsp.Client>
local clients = {}

---@param client vim.lsp.Client
---@return progress.lsp.Client
local function new_state(client)
    local client_id = client.id
    local state = { name = client.name, tokens = {}, count = 0 }
    state.alive = function()
        return vim.lsp.get_client_by_id(client_id) ~= nil
    end
    -- A stale token never ends, so drop it. Without this, the row could not
    -- finish. A later update of the token adds it again.
    state.on_stale = function()
        if clients[client_id] == state then
            clients[client_id] = nil
        end
    end
    return state
end

---@param tokens table<lsp.ProgressToken, progress.lsp.Token>
---@return lsp.ProgressToken?
local function most_recent(tokens)
    local best, best_updated
    for token, entry in pairs(tokens) do
        if not best_updated or entry.updated > best_updated then
            best, best_updated = token, entry.updated
        end
    end
    return best
end

---@param client_id integer
---@param state progress.lsp.Client
local function report(client_id, state)
    local latest = state.tokens[state.latest]
    core.report("lsp." .. client_id, {
        source = SOURCE,
        title = state.name,
        text = vim.trim(latest.title .. " " .. (latest.message or "")),
        suffix = state.count > 1 and (" +%d"):format(state.count - 1) or nil,
        percent = latest.percent,
        idle_timeout_ms = IDLE_TIMEOUT_MS,
        alive = state.alive,
        on_stale = state.on_stale,
    })
end

---@param client_id integer
---@param state progress.lsp.Client
---@param token lsp.ProgressToken
---@param value table
local function on_end(client_id, state, token, value)
    if state.tokens[token] then
        state.tokens[token] = nil
        state.count = state.count - 1
    end

    if state.count > 0 then
        if state.latest == token then
            state.latest = most_recent(state.tokens)
        end
        report(client_id, state)
        return
    end

    clients[client_id] = nil
    core.finish("lsp." .. client_id, "success", {
        source = SOURCE,
        title = state.name,
        -- Some servers, such as basedpyright, send an empty title.
        text = (value.title and value.title ~= "") and value.title or "Done",
    })
end

---@param state progress.lsp.Client
---@param token lsp.ProgressToken
---@param value table
local function on_update(state, token, value)
    local entry = state.tokens[token]
    if not entry then
        entry = { title = "" }
        state.tokens[token] = entry
        state.count = state.count + 1
    end

    -- A `report` that omits a field keeps its previous value (LSP spec).
    if value.kind == "begin" then
        entry.message, entry.percent = nil, nil
    end
    entry.title = value.title or entry.title
    entry.message = value.message or entry.message
    entry.percent = value.percentage or entry.percent
    entry.updated = vim.uv.hrtime()
    state.latest = token
end

---@param ev {data: {client_id: integer, params: lsp.ProgressParams}}
local function on_progress(ev)
    local value = ev.data.params.value
    if type(value) ~= "table" or not value.kind then
        return
    end

    local client_id = ev.data.client_id
    local token = ev.data.params.token
    local state = clients[client_id]

    if value.kind == "end" then
        -- No state: the row left the store as stale, so there is nothing to end.
        if state then
            on_end(client_id, state, token, value)
        end
        return
    end

    if not state then
        local client = vim.lsp.get_client_by_id(client_id)
        if not client then
            return
        end
        state = new_state(client)
        clients[client_id] = state
    end

    on_update(state, token, value)
    report(client_id, state)
end

function M.setup()
    vim.api.nvim_create_autocmd("LspProgress", {
        group = vim.api.nvim_create_augroup("ProgressLsp", { clear = true }),
        callback = on_progress,
    })
end

return M
