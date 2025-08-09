---@alias ProgressState {
---  token: string,
---  title: string,
---  formatter_names: string[],
---  completed_formatters: table<string, boolean>,
---  current_formatter: string?,
---  failed_formatter: string?,
---  done: boolean,
---}

---@type table<integer, ProgressState>
local CONFORM_PROGRESS_STATES = vim.defaulttable()
local FORMATTER_GROUP_SIZE = 3

local M = {}

---@param msg string|table
---@return string
local format_msg = function(msg)
    if type(msg) == "table" then
        msg = vim.inspect(msg)
    end
    return msg:gsub("(" .. string.rep(".", 80) .. ")", "%1\n")
end

---@param progress_state ProgressState
---@return string
local generate_msg = function(progress_state)
    local msg_lines = {}
    local current_line = {}

    for i = 1, #progress_state.formatter_names do
        local name = progress_state.formatter_names[i]
        local prefix

        if progress_state.failed_formatter and name == progress_state.failed_formatter then
            prefix = "✗ "
        elseif progress_state.completed_formatters[name] then
            prefix = "✓ "
        elseif name == progress_state.current_formatter then
            prefix = "→ "
        else
            prefix = "• "
        end

        table.insert(current_line, prefix .. name)

        if #current_line == FORMATTER_GROUP_SIZE or i == #progress_state.formatter_names then
            table.insert(msg_lines, table.concat(current_line, " "))
            current_line = {}
        end
    end

    return table.concat(msg_lines, "\n")
end

---@param bufnr integer
---@param token string?
local refresh = function(bufnr, token)
    local progress_state = CONFORM_PROGRESS_STATES[bufnr]
    if not token or not progress_state or progress_state.token ~= token then
        return
    end

    local msg = generate_msg(progress_state)

    vim.notify(msg, vim.log.levels.INFO, {
        id = token,
        title = progress_state.title,
        replace = true,
        opts = function(notif)
            notif.icon = require("peter.core.utils").spinner:get_frame()
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

    local token = require("peter.core.utils").generate_uuid()

    local title = "Formatting"

    CONFORM_PROGRESS_STATES[bufnr] = {
        token = token,
        title = title,
        formatter_names = formatter_names,
        completed_formatters = completed_formatters,
        current_formatter = nil,
        failed_formatter = nil,
        done = false,
    }

    local msg = generate_msg(CONFORM_PROGRESS_STATES[bufnr])

    vim.notify(msg, vim.log.levels.INFO, {
        id = token,
        title = title,
        replace = true,
        opts = function(notif)
            notif.icon = require("peter.core.utils").spinner:get_frame()
        end,
    })

    refresh(bufnr, token)

    return token
end

---@param bufnr integer
---@param token string?
---@param err string?
function M.finish(bufnr, token, err)
    if not token then
        return
    end

    local progress_state = CONFORM_PROGRESS_STATES[bufnr]
    if not progress_state or progress_state.token ~= token then
        return
    end

    progress_state.done = true
    progress_state.title = err and "Failed" or "Formatted"

    local notif_level = err and vim.log.levels.ERROR or vim.log.levels.INFO
    local notif_icon = err and "" or ""

    local msg = generate_msg(progress_state)

    vim.notify(msg, notif_level, {
        id = token,
        title = progress_state.title,
        replace = true,
        opts = function(notif)
            notif.icon = notif_icon
        end,
    })

    CONFORM_PROGRESS_STATES[bufnr] = nil
end

function M.setup()
    local augroup = vim.api.nvim_create_augroup("ConformFormatProgress", { clear = true })

    vim.api.nvim_create_autocmd("User", {
        pattern = "ConformFormatPre",
        group = augroup,
        callback = function(args)
            local bufnr = args.buf
            local progress_state = CONFORM_PROGRESS_STATES[bufnr]

            if not progress_state or progress_state.done then
                return
            end

            if not args.data or not args.data.formatter then
                return
            end

            progress_state.current_formatter = args.data.formatter.name

            refresh(bufnr, progress_state.token)
        end,
    })

    vim.api.nvim_create_autocmd("User", {
        pattern = "ConformFormatPost",
        group = augroup,
        callback = function(args)
            local bufnr = args.buf
            local progress_state = CONFORM_PROGRESS_STATES[bufnr]

            if not progress_state or progress_state.done then
                return
            end

            if not args.data or not args.data.formatter then
                return
            end

            local formatter_name = args.data.formatter.name

            if args.data.err then
                progress_state.failed_formatter = formatter_name
            else
                progress_state.completed_formatters[formatter_name] = true
            end

            refresh(bufnr, progress_state.token)
        end,
    })
end

return M
