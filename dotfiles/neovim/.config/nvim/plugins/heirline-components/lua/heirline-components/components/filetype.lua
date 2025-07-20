return {
    init = function(self)
        self.bufnr = vim.api.nvim_get_current_buf()
        self.filename = vim.fn.fnamemodify(vim.api.nvim_buf_get_name(self.bufnr), ":t")
        self.extension = vim.fn.fnamemodify(self.filename, ":e")
        self.filetype = vim.bo[self.bufnr].filetype:upper()

        if self.filetype == "YAML" then
            local schema = require("yaml-companion").get_buf_schema(0)
            if schema and schema.result[1].name ~= "none" then
                self.filetype = string.format("%s (%s)", self.filetype, schema.result[1].name)
            end
        end

        self.icon_str, self.icon_hlname =
            require("nvim-web-devicons").get_icon(self.filename, self.extension, { default = true })
    end,
    {
        provider = function(self)
            return self.icon_str
        end,
        hl = function(self)
            local icon_fg = vim.api.nvim_get_hl(0, { name = self.icon_hlname }).fg

            if icon_fg then
                return {
                    fg = string.format("#%06x", icon_fg),
                }
            end

            return {}
        end,
    },
    {
        provider = function(self)
            return " " .. self.filetype
        end,
    },
}
