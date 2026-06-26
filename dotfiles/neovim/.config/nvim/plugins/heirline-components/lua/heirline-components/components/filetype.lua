local schema_companion_supported_filetypes = {
    JSON = true,
    TOML = true,
    YAML = true,
}

local devicons = require("nvim-web-devicons")

return {
    init = function(self)
        self.bufnr = vim.api.nvim_get_current_buf()
        self.filename = vim.fn.fnamemodify(vim.api.nvim_buf_get_name(self.bufnr), ":t")
        self.extension = vim.fn.fnamemodify(self.filename, ":e")
        self.filetype = vim.bo[self.bufnr].filetype:upper()

        local schema_companion = package.loaded["schema-companion"]
        if schema_companion_supported_filetypes[self.filetype] and schema_companion then
            local ok, schema = pcall(schema_companion.get_current_schemas)
            if ok and schema and schema ~= "none" then
                self.filetype = string.format("%s (%s)", self.filetype, schema)
            end
        end

        self.icon_str, self.icon_color =
            devicons.get_icon_color(self.filename, self.extension, { default = true })
    end,
    {
        provider = function(self)
            return self.icon_str
        end,
        hl = function(self)
            return { fg = self.icon_color }
        end,
    },
    {
        provider = function(self)
            return " " .. self.filetype
        end,
    },
}
