local LeftSeparator = require("heirline-components.components.leftseparator")
local Space = require("heirline-components.components.space")

local FileEncoding = {
    provider = function(self)
        local file_enc = (vim.bo[self.bufnr].fenc ~= "" and vim.bo[self.bufnr].fenc) or vim.o.enc
        return file_enc:upper()
    end,
}

local FileFormat = {
    provider = function(self)
        local file_format = vim.bo[self.bufnr].fileformat
        return file_format:upper()
    end,
}

local TabStyle = {
    provider = function(self)
        local tab_style = vim.api.nvim_get_option_value("expandtab", { buf = self.bufnr }) and "●" or "󰌒"
        local tab = vim.api.nvim_get_option_value("shiftwidth", { buf = self.bufnr })

        if tab == 0 then
            tab = vim.api.nvim_get_option_value("tabstop", { buf = self.bufnr })
        end

        return tab_style .. " " .. tab
    end,
}

local LineCount = {
    provider = function(self)
        local lines = vim.api.nvim_buf_line_count(self.bufnr)
        return " " .. lines
    end,
}

return {
    init = function(self)
        self.bufnr = vim.api.nvim_get_current_buf()
    end,
    hl = { bg = "bg_highlight" },
    flexible = true,
    {
        { Space, FileEncoding },
        { LeftSeparator, FileFormat },
        { LeftSeparator, TabStyle },
        { LeftSeparator, LineCount },
        Space,
    },
    {
        { Space, FileFormat },
        { LeftSeparator, TabStyle },
        { LeftSeparator, LineCount },
        Space,
    },
    {
        { Space, TabStyle },
        { LeftSeparator, LineCount },
        Space,
    },
    {
        Space,
        LineCount,
        Space,
    },
}
