local escape = require("heirline-components.utils.statusline").escape

return {
    provider = function()
        local tname = vim.api.nvim_buf_get_name(0):gsub(".*:", "")
        return " " .. escape(tname)
    end,
    hl = { fg = "blue", bold = true },
}
