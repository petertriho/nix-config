local M = {}

local is_setup = false

function M.setup()
    if is_setup then
        return
    end

    is_setup = true

    -- Neovim does not redraw the statusline when it enters operator-pending mode or when a macro
    -- recording starts or stops, so the mode and recording indicators would lag behind.
    local group = vim.api.nvim_create_augroup("heirline_components_statusline", { clear = true })
    vim.api.nvim_create_autocmd({ "ModeChanged", "RecordingEnter", "RecordingLeave" }, {
        group = group,
        callback = function()
            vim.schedule(function()
                vim.cmd.redrawstatus()
            end)
        end,
    })
end

return M
