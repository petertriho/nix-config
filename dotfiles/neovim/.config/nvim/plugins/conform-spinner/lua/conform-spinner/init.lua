---@alias SpinnerState {
---  notif_id: string,
---  title: string,
---  formatter_names: string[],
---  completed_formatters: table<string, boolean>,
---  current_formatter: string?,
---  failed_formatter: string?,
---  timer: uv_timer_t?,
---  auto_started: boolean?,
---}

---@type table<integer, SpinnerState>
local CONFORM_SPINNER_STATES = {}
local random_seeded = false
-- Nerd Font icons only render with a patched font; fall back to plain
-- unicode when the standard `vim.g.have_nerd_font` flag is unset/false.
local HAS_NERD_FONT = vim.g.have_nerd_font == true

local M = {}

--- Defaults live here so the module works even when M.setup() is never
--- called; M.setup(opts) deep-merges user overrides over them.
M.config = {
    title = "Formatting",
    group_size = 3,
    timeout_success = 2000,
    timeout_error = 8000,
}

--- Generate a notification ID that is unique per call. math.random is not
--- reliably seeded across Neovim instances, so the ID mixes hrtime
--- (monotonic, nanosecond resolution), the process id, and a random value,
--- and the PRNG is seeded once from those high-entropy sources.
---@return string
local generate_notif_id = function()
    if not random_seeded then
        math.randomseed((vim.uv.hrtime() % 1000000) + vim.uv.getpid())
        random_seeded = true
    end
    return string.format("%d-%d-%d", vim.uv.hrtime(), vim.uv.getpid(), math.random(0, 0xffffffff))
end

M.spinner = {
    frames = { "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏" },
    get_frame = function(self)
        return self.frames[math.floor(vim.uv.hrtime() / (1e6 * 80)) % #self.frames + 1]
    end,
}

---@param msg string|table
---@return string
local format_msg = function(msg)
    if type(msg) == "table" then
        msg = vim.inspect(msg)
    else
        msg = tostring(msg)
    end
    return msg:gsub("(" .. string.rep(".", 80) .. ")", "%1\n")
end

---@param spinner_state SpinnerState
---@return string
local generate_msg = function(spinner_state)
    local msg_lines = {}
    local current_line = {}

    for i = 1, #spinner_state.formatter_names do
        local name = spinner_state.formatter_names[i]
        local prefix

        if spinner_state.failed_formatter and name == spinner_state.failed_formatter then
            prefix = "✗ "
        elseif spinner_state.completed_formatters[name] then
            prefix = "✓ "
        elseif name == spinner_state.current_formatter then
            prefix = "→ "
        else
            prefix = "• "
        end

        table.insert(current_line, prefix .. name)

        if #current_line == M.config.group_size or i == #spinner_state.formatter_names then
            table.insert(msg_lines, table.concat(current_line, " "))
            current_line = {}
        end
    end

    return table.concat(msg_lines, "\n")
end

--- Register a formatter name reported by conform at runtime that was not in
--- the list M.start() synthesized (e.g. the real LSP formatter name instead
--- of the "lsp" placeholder), so it appears in the spinner and participates
--- in completion tracking.
---@param spinner_state SpinnerState
---@param formatter_name string
local ensure_formatter = function(spinner_state, formatter_name)
    if not vim.tbl_contains(spinner_state.formatter_names, formatter_name) then
        table.insert(spinner_state.formatter_names, formatter_name)
    end
    if spinner_state.completed_formatters[formatter_name] == nil then
        spinner_state.completed_formatters[formatter_name] = false
    end
end

---@param spinner_state SpinnerState
local stop_timer = function(spinner_state)
    local timer = spinner_state.timer
    spinner_state.timer = nil
    if not timer then
        return
    end

    pcall(function()
        if not timer:is_closing() then
            timer:stop()
            timer:close()
        end
    end)
end

---@param bufnr integer
---@param notif_id string?
local refresh = function(bufnr, notif_id)
    local spinner_state = CONFORM_SPINNER_STATES[bufnr]
    if not notif_id or not spinner_state or spinner_state.notif_id ~= notif_id then
        return
    end

    local msg = generate_msg(spinner_state)

    local notif_level = spinner_state.failed_formatter and vim.log.levels.ERROR or vim.log.levels.INFO

    vim.notify(msg, notif_level, {
        id = notif_id,
        title = spinner_state.failed_formatter and "Failed" or spinner_state.title,
        replace = true,
        opts = function(notif)
            if spinner_state.failed_formatter then
                notif.icon = HAS_NERD_FONT and "" or "✗"
            else
                notif.icon = M.spinner:get_frame()
            end
        end,
    })
end

---@param bufnr integer?
---@return string?
function M.start(bufnr)
    bufnr = bufnr or vim.api.nvim_get_current_buf()
    local conform = require("conform")
    local formatters, will_use_lsp = conform.list_formatters_to_run(bufnr)

    local formatter_names = {}
    local completed_formatters = {}
    if not vim.tbl_isempty(formatters) then
        formatter_names = vim.tbl_map(function(f)
            completed_formatters[f.name] = false
            return f.name
        end, formatters)
    elseif will_use_lsp then
        completed_formatters["lsp"] = false
        formatter_names = { "lsp" }
    else
        vim.notify(format_msg("No lsp/formatters configured"), vim.log.levels.WARN)
        return nil
    end

    local notif_id = generate_notif_id()

    local title = M.config.title

    local spinner_state = {
        notif_id = notif_id,
        title = title,
        formatter_names = formatter_names,
        completed_formatters = completed_formatters,
        current_formatter = nil,
        failed_formatter = nil,
        timer = nil,
    }

    CONFORM_SPINNER_STATES[bufnr] = spinner_state

    local timer = vim.uv.new_timer()
    if timer then
        spinner_state.timer = timer
        timer:start(80, 80, function()
            vim.schedule(function()
                local current_state = CONFORM_SPINNER_STATES[bufnr]
                if not current_state or current_state.notif_id ~= notif_id then
                    pcall(function()
                        if not timer:is_closing() then
                            timer:stop()
                            timer:close()
                        end
                    end)
                    return
                end

                refresh(bufnr, notif_id)
            end)
        end)
    end

    local msg = generate_msg(spinner_state)

    vim.notify(msg, vim.log.levels.INFO, {
        id = notif_id,
        title = title,
        replace = true,
        opts = function(notif)
            notif.icon = M.spinner:get_frame()
        end,
    })

    return notif_id
end

---@param bufnr integer
---@param notif_id string?
---@param err string?
function M.finish(bufnr, notif_id, err)
    if not notif_id then
        return
    end

    local spinner_state = CONFORM_SPINNER_STATES[bufnr]
    if not spinner_state or spinner_state.notif_id ~= notif_id then
        return
    end

    stop_timer(spinner_state)

    spinner_state.title = err and "Failed" or "Formatted"

    local notif_level = err and vim.log.levels.ERROR or vim.log.levels.INFO
    local notif_icon = err and (HAS_NERD_FONT and "" or "✗") or (HAS_NERD_FONT and "" or "✓")

    local msg = generate_msg(spinner_state)
    if err and err ~= "" then
        msg = msg .. "\n" .. format_msg(err)
    end

    vim.notify(msg, notif_level, {
        id = notif_id,
        title = spinner_state.title,
        replace = true,
        timeout = err and M.config.timeout_error or M.config.timeout_success,
        opts = function(notif)
            notif.icon = notif_icon
        end,
    })

    CONFORM_SPINNER_STATES[bufnr] = nil
end

---@param opts? conform.FormatOpts
---@param callback? fun(err: nil|string, did_edit: nil|boolean) Called once formatting has completed
---@return boolean True if any formatters were attempted
---
function M.format(opts, callback)
    -- Resolve the target buffer: conform's FormatOpts uses `bufnr`, but accept `buf`
    -- as well. Fall back to the current buffer. `0` is Neovim's alias for the
    -- current buffer, so normalize it to the real bufnr.
    local bufnr = (opts and (opts.bufnr or opts.buf)) or vim.api.nvim_get_current_buf()
    if bufnr == 0 then
        bufnr = vim.api.nvim_get_current_buf()
    end
    local notif_id = M.start(bufnr)

    if not notif_id then
        return false
    end

    require("conform").format(opts, function(err, did_edit)
        -- conform may invoke this callback in a fast-event context where
        -- vim.notify is not allowed, so defer to the main loop. The user
        -- callback stays inside the scheduled function to preserve
        -- finish-before-callback ordering.
        vim.schedule(function()
            M.finish(bufnr, notif_id, err)
            if callback then
                callback(err, did_edit)
            end
        end)
    end)

    return true
end

---@param opts? table User overrides merged over M.config defaults
---  (title, group_size, timeout_success, timeout_error).
function M.setup(opts)
    M.config = vim.tbl_deep_extend("force", M.config, opts or {})

    local augroup = vim.api.nvim_create_augroup("ConformSpinner", { clear = true })

    vim.api.nvim_create_autocmd("User", {
        pattern = "ConformFormatPre",
        group = augroup,
        callback = function(args)
            local bufnr = args.buf
            local spinner_state = CONFORM_SPINNER_STATES[bufnr]

            if not spinner_state then
                -- Formats that bypass M.format() (direct conform.format(),
                -- format_on_save) still emit ConformFormatPre, so auto-start
                -- the spinner here instead of bailing. Existing state (created
                -- by M.format()) is never overwritten.
                local notif_id = M.start(bufnr)
                if not notif_id then
                    return
                end

                spinner_state = CONFORM_SPINNER_STATES[bufnr]
                if not spinner_state then
                    return
                end
                spinner_state.auto_started = true
            end

            if not args.data or not args.data.formatter then
                return
            end

            local formatter_name = args.data.formatter.name
            ensure_formatter(spinner_state, formatter_name)

            spinner_state.current_formatter = formatter_name

            refresh(bufnr, spinner_state.notif_id)
        end,
    })

    vim.api.nvim_create_autocmd("User", {
        pattern = "ConformFormatPost",
        group = augroup,
        callback = function(args)
            local bufnr = args.buf
            local spinner_state = CONFORM_SPINNER_STATES[bufnr]

            if not spinner_state then
                return
            end

            if not args.data or not args.data.formatter then
                return
            end

            local formatter_name = args.data.formatter.name
            ensure_formatter(spinner_state, formatter_name)

            if args.data.err then
                spinner_state.failed_formatter = formatter_name
            else
                spinner_state.completed_formatters[formatter_name] = true
            end

            -- The formatter that just finished is no longer running, so
            -- clear the active marker. The next ConformFormatPre will set
            -- the next one.
            spinner_state.current_formatter = nil

            -- Auto-started runs go through conform.format() directly, so
            -- there is no callback of ours to call M.finish(): close the
            -- notification once every known formatter has completed or
            -- failed.
            if spinner_state.auto_started then
                local all_settled = true
                for i = 1, #spinner_state.formatter_names do
                    local name = spinner_state.formatter_names[i]
                    if not spinner_state.completed_formatters[name] and name ~= spinner_state.failed_formatter then
                        all_settled = false
                        break
                    end
                end

                if all_settled then
                    local err = spinner_state.failed_formatter
                        and ("Formatter failed: " .. spinner_state.failed_formatter)
                        or nil
                    M.finish(bufnr, spinner_state.notif_id, err)
                    return
                end
            end

            refresh(bufnr, spinner_state.notif_id)
        end,
    })

    -- Buffer deleted/wiped while a format run is still in flight: stop the
    -- spinner timer and drop the state so buffer-number reuse never sees
    -- stale data. The notification itself is left to its own timeout; a late
    -- M.finish() is a no-op because the state lookup fails the notif_id guard.
    vim.api.nvim_create_autocmd({ "BufWipeout", "BufDelete" }, {
        group = augroup,
        callback = function(args)
            local bufnr = args.buf
            local spinner_state = CONFORM_SPINNER_STATES[bufnr]
            if not spinner_state then
                return
            end

            stop_timer(spinner_state)
            CONFORM_SPINNER_STATES[bufnr] = nil
        end,
    })
end

return M
