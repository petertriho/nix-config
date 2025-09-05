local schema_companion_supported_filetypes = {
    JSON = true,
    TOML = true,
    YAML = true,
}

return {
    init = function(self)
        self.bufnr = vim.api.nvim_get_current_buf()
        self.filename = vim.fn.fnamemodify(vim.api.nvim_buf_get_name(self.bufnr), ":t")
        self.extension = vim.fn.fnamemodify(self.filename, ":e")
        self.filetype = vim.bo[self.bufnr].filetype:upper()

        if schema_companion_supported_filetypes[self.filetype] then
            local ok, schema = pcall(require("schema-companion").get_current_schemas)
            if ok and schema and schema ~= "none" then
                self.filetype = string.format("%s (%s)", self.filetype, schema)
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
