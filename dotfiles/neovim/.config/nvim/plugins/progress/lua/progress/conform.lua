---@class progress.conform.Run
---@field token integer
---@field names string[]
---@field done table<string, boolean>
---@field current string?
---@field failed string?
---@field error string?
---@field lsp_only boolean
---@field auto_started boolean?

local core = require("progress")

local M = {}

local SOURCE = "progress.conform"
local TITLE = "Format"
-- A direct conform.format() has no callback of ours, so it needs a timeout.
local AUTO_START_IDLE_MS = 60000

---@type table<integer, progress.conform.Run>
local runs = {}
local last_token = 0

---@param bufnr integer
---@return string
local function row_id(bufnr)
    return "conform." .. bufnr
end

--- ui2 treats "\r" as a carriage return, and formatters can write ANSI colors to
--- stderr.
---@param err any
---@return string
local function format_error(err)
    local text = type(err) == "string" and err or vim.inspect(err)
    text = text:gsub("\27%[[%d;]*%a", ""):gsub("\r\n?", "\n")
    return vim.trim(text)
end

---@param run progress.conform.Run
---@param bufnr integer
local function report(run, bufnr)
    local fields = { source = SOURCE, title = TITLE }

    if run.lsp_only then
        -- LSP formatting fires no conform events, so the position is unknown.
        fields.text = "lsp"
    else
        local done = 0
        local next_name
        for _, name in ipairs(run.names) do
            if run.done[name] then
                done = done + 1
            elseif not next_name then
                next_name = name
            end
        end

        local total = #run.names
        local name = run.current or next_name or run.names[total]
        fields.text = ("%s %d/%d"):format(name, math.min(done + 1, total), total)
        fields.percent = done / total * 100
    end

    if run.auto_started then
        fields.idle_timeout_ms = AUTO_START_IDLE_MS
        fields.on_stale = function()
            if runs[bufnr] == run then
                runs[bufnr] = nil
            end
        end
    end

    core.report(row_id(bufnr), fields)
end

--- Add a formatter that conform reports but M.start() did not list.
---@param run progress.conform.Run
---@param name string
local function ensure_formatter(run, name)
    if run.lsp_only then
        run.lsp_only = false
        run.names = {}
    end
    if not vim.tbl_contains(run.names, name) then
        run.names[#run.names + 1] = name
    end
end

---@param bufnr integer
---@param opts? conform.FormatOpts
---@return conform.FormatterInfo[] formatters
---@return boolean will_use_lsp
local function list_formatters(bufnr, opts)
    local conform = require("conform")
    -- list_formatters_to_run ignores a per-call list, so a run would not know its
    -- own formatters and could not match them after a buffer switch.
    if opts and vim.islist(opts.formatters) then
        local formatters = conform.resolve_formatters(opts.formatters, bufnr, false, opts.stop_after_first)
        if #formatters > 0 then
            return formatters, false
        end
    end
    return conform.list_formatters_to_run(bufnr)
end

---@param bufnr integer?
---@param opts? conform.FormatOpts
---@return integer? token
function M.start(bufnr, opts)
    bufnr = bufnr or vim.api.nvim_get_current_buf()
    local formatters, will_use_lsp = list_formatters(bufnr, opts)

    local names = vim.tbl_map(function(formatter)
        return formatter.name
    end, formatters)
    local lsp_only = #names == 0 and will_use_lsp
    if #names == 0 and not lsp_only then
        vim.notify("No lsp/formatters configured", vim.log.levels.WARN)
        return nil
    end

    last_token = last_token + 1
    local run = { token = last_token, names = names, done = {}, lsp_only = lsp_only }
    runs[bufnr] = run
    report(run, bufnr)
    return run.token
end

---@param bufnr integer
---@param token integer?
---@param err any
function M.finish(bufnr, token, err)
    local run = runs[bufnr]
    -- A newer run replaced this one, so its result must not change the row.
    if not token or not run or run.token ~= token then
        return
    end
    runs[bufnr] = nil

    if not err then
        core.finish(row_id(bufnr), "success", { text = "Formatted" })
        return
    end

    local name = run.failed or run.current
    core.finish(row_id(bufnr), "failed", {
        text = name and (name .. " failed") or "Failed",
        detail = err ~= "" and format_error(err) or nil,
    })
end

---@param opts? conform.FormatOpts
---@param callback? fun(err: nil|string, did_edit: nil|boolean) Called once formatting has completed
---@return boolean True if any formatters were attempted
function M.format(opts, callback)
    -- conform uses `bufnr`, but accept `buf` as well. `0` means the current buffer.
    local bufnr = (opts and (opts.bufnr or opts.buf)) or vim.api.nvim_get_current_buf()
    if bufnr == 0 then
        bufnr = vim.api.nvim_get_current_buf()
    end

    local token = M.start(bufnr, opts)
    if not token then
        return false
    end

    require("conform").format(opts, function(err, did_edit)
        -- conform can call this in a fast event, where nvim_echo is not allowed.
        -- The user callback stays inside so that it runs after M.finish().
        vim.schedule(function()
            M.finish(bufnr, token, err)
            if callback then
                callback(err, did_edit)
            end
        end)
    end)

    return true
end

--- conform fires its events with no buffer, so `args.buf` is the current buffer,
--- which can differ from the formatted one if the user switches during a chain.
---@param args table
---@param name string?
---@return integer bufnr
---@return progress.conform.Run? run
local function find_run(args, name)
    if runs[args.buf] then
        return args.buf, runs[args.buf]
    end
    for bufnr, run in pairs(runs) do
        if name and vim.tbl_contains(run.names, name) then
            return bufnr, run
        end
    end
    return args.buf, nil
end

---@param args table
local function on_format_pre(args)
    local name = args.data and args.data.formatter and args.data.formatter.name
    local bufnr, run = find_run(args, name)

    if not run then
        -- A direct conform.format() bypasses M.format() but still fires this event.
        if not M.start(bufnr) then
            return
        end
        run = runs[bufnr]
        run.auto_started = true
    end

    if not name then
        return
    end

    ensure_formatter(run, name)
    -- DiffFormat runs the same formatters once per hunk.
    run.done[name] = nil
    run.current = name
    report(run, bufnr)
end

---@param run progress.conform.Run
---@return boolean
local function all_settled(run)
    for _, name in ipairs(run.names) do
        if not run.done[name] and name ~= run.failed then
            return false
        end
    end
    return true
end

---@param args table
local function on_format_post(args)
    local name = args.data and args.data.formatter and args.data.formatter.name
    local bufnr, run = find_run(args, name)
    if not run or not name then
        return
    end

    ensure_formatter(run, name)
    local err = args.data.err
    if err then
        run.failed = name
        run.error = type(err) == "table" and err.message or err
    else
        run.done[name] = true
    end
    run.current = nil

    -- A direct conform.format() has no callback of ours to call M.finish().
    if run.auto_started and all_settled(run) then
        M.finish(bufnr, run.token, run.failed and (run.error or "") or nil)
        return
    end

    report(run, bufnr)
end

function M.setup()
    local group = vim.api.nvim_create_augroup("ProgressConform", { clear = true })

    vim.api.nvim_create_autocmd("User", {
        pattern = "ConformFormatPre",
        group = group,
        callback = on_format_pre,
    })

    vim.api.nvim_create_autocmd("User", {
        pattern = "ConformFormatPost",
        group = group,
        callback = on_format_post,
    })

    -- Buffer numbers can be reused, and a late M.finish() must find no state.
    vim.api.nvim_create_autocmd({ "BufWipeout", "BufDelete" }, {
        group = group,
        callback = function(args)
            if runs[args.buf] then
                runs[args.buf] = nil
                core.drop(row_id(args.buf))
            end
        end,
    })
end

return M
