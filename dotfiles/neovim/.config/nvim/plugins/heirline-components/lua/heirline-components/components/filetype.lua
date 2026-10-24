local escape = require("heirline-components.utils.statusline").escape

local schema_companion_supported_filetypes = {
    json = true,
    toml = true,
    yaml = true,
}

-- `get_current_schemas()` returns `name (source) (and +N)`, which would nest inside our own
-- parentheses, so build a shorter label from the matching schemas instead.
local function schema_label(bufnr, filetype)
    local schema_companion = package.loaded["schema-companion"]
    if not (schema_companion_supported_filetypes[filetype] and schema_companion) then
        return nil
    end

    local ok, schemas = pcall(schema_companion.get_matching_schemas, bufnr)
    local schema = ok and schemas and schemas[1]
    if not (schema and schema.uri) then
        return nil
    end

    local label = schema.name or schema.description or vim.fs.basename(schema.uri)
    if #schemas > 1 then
        label = label .. " +" .. (#schemas - 1)
    end
    return escape(label)
end

return {
    condition = function()
        return vim.bo.filetype ~= ""
    end,
    init = function(self)
        local bufnr = vim.api.nvim_get_current_buf()
        local filetype = vim.bo[bufnr].filetype
        local name = vim.fs.basename(vim.api.nvim_buf_get_name(bufnr))

        -- Required at the first render, not when the module loads: loading
        -- nvim-web-devicons takes about 3 ms.
        local devicons = require("nvim-web-devicons")
        if name ~= "" then
            self.icon_str, self.icon_color = devicons.get_icon_color(name, nil, { default = true })
        else
            self.icon_str, self.icon_color = devicons.get_icon_color_by_filetype(filetype, { default = true })
        end

        self.filetype = filetype:upper()
        local schema = schema_label(bufnr, filetype)
        if schema then
            self.filetype = string.format("%s (%s)", self.filetype, schema)
        end
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
