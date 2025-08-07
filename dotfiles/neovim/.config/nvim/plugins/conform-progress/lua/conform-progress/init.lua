-- Global state for tracking format progress across buffers
local CONFORM_PROGRESS_STATE = {}

local M = {}

local format_msg = function(msg)
    if type(msg) == "table" then
        msg = vim.inspect(msg)
    end
    return msg:gsub("(" .. string.rep(".", 80) .. ")", "%1\n")
end

-- Generate formatted message for formatter progress display
local generate_formatter_message = function(progress_item)
    local msg_lines = {}
    local current_line = {}

    for i = 1, #progress_item.formatter_names do
        local name = progress_item.formatter_names[i]
        local prefix

        if progress_item.failed_formatter and name == progress_item.failed_formatter then
            -- Mark only the failed formatter with ✗
            prefix = "✗ "
        elseif progress_item.completed_formatters[name] then
            -- Show checkmark for completed formatters
            -- prefix = "[✓] "
            prefix = "✓ "
        elseif name == progress_item.current_formatter then
            -- Mark current formatter with arrow
            prefix = "→ "
        else
            -- Show dot for pending formatters
            prefix = "• "
        end

        table.insert(current_line, prefix .. name)

        -- Group into lines of 3
        if #current_line == 3 or i == #progress_item.formatter_names then
            table.insert(msg_lines, table.concat(current_line, " "))
            current_line = {}
        end
    end

    return table.concat(msg_lines, "\n")
end

local refresh = function(bufnr, token)
    local progress_item = CONFORM_PROGRESS_STATE[bufnr]
    if not token or not progress_item or progress_item.token ~= token then
        return
    end

    local msg = generate_formatter_message(progress_item)

    -- Update notification
    vim.notify(msg, vim.log.levels.INFO, {
        id = token,
        title = progress_item.title,
        replace = true,
        opts = function(notif)
            notif.icon = require("peter.core.utils").spinner:get_frame()
        end,
    })
end

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

    -- Store progress in global state
    CONFORM_PROGRESS_STATE[bufnr] = {
        token = token,
        title = title,
        formatter_names = formatter_names,
        completed_formatters = completed_formatters,
        current_formatter = nil,
        failed_formatter = nil,
        done = false,
    }

    local msg = generate_formatter_message(CONFORM_PROGRESS_STATE[bufnr])

    -- Show initial progress notification
    require("peter.core.utils").create_progress_notification({
        id = token,
        title = title,
        message = msg,
    })

    -- Start highlighting the first formatter
    if #formatter_names > 0 then
        refresh(bufnr, token)
    end

    return token
end

function M.finish(bufnr, token, err)
    if not token then
        return
    end

    local progress_item = CONFORM_PROGRESS_STATE[bufnr]
    if not progress_item or progress_item.token ~= token then
        return
    end

    progress_item.done = true
    progress_item.title = err and "Failed" or "Formatted"

    -- local notif_level = err and vim.log.levels.ERROR or vim.log.levels.INFO
    local notif_level = vim.log.levels.INFO

    local msg = generate_formatter_message(progress_item)

    require("peter.core.utils").finish_progress_notification({
        id = token,
        title = progress_item.title,
        message = msg,
        level = notif_level,
    })

    -- Clean up completed progress
    CONFORM_PROGRESS_STATE[bufnr] = nil
end

-- Set up autocmd to track formatter progress using conform's built-in events
function M.setup_formatter_progress_tracking()
    local augroup = vim.api.nvim_create_augroup("ConformProgressTracking", { clear = true })

    vim.api.nvim_create_autocmd("User", {
        pattern = "ConformFormatPre",
        group = augroup,
        callback = function(args)
            local bufnr = args.buf
            local progress_item = CONFORM_PROGRESS_STATE[bufnr]

            -- Set current formatter
            if progress_item and not progress_item.done and args.data and args.data.formatter then
                progress_item.current_formatter = args.data.formatter.name
                refresh(bufnr, progress_item.token)
            end
        end,
    })

    vim.api.nvim_create_autocmd("User", {
        pattern = "ConformFormatPost",
        group = augroup,
        callback = function(args)
            local bufnr = args.buf
            local progress_item = CONFORM_PROGRESS_STATE[bufnr]

            if progress_item and not progress_item.done and args.data and args.data.formatter then
                local formatter_name = args.data.formatter.name

                if args.data.err then
                    -- Mark formatter as failed
                    progress_item.failed_formatter = formatter_name
                else
                    -- Mark formatter as completed
                    progress_item.completed_formatters[formatter_name] = true
                end
                refresh(bufnr, progress_item.token)
            end
        end,
    })
end

return M
