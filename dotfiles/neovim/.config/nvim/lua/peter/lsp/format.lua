local M = {}

local disabled = {
    lua_ls = true,
    tsserver = true,
}

local function filter(client)
    return not disabled[client.name]
end

local null_ls = require("null-ls")

M.on_attach = function(client, bufnr)
    -- restore default vim gq formatting
    vim.bo[bufnr].formatexpr = nil

    local format = function()
        vim.lsp.buf.format({
            bufnr = bufnr,
            filter = filter,
            async = true,
        })
    end

    local slow_format = function()
        null_ls.enable({ name = "slow_formatters" })
        format()
        null_ls.disable({ name = "slow_formatters" })
    end

    if client.supports_method("textDocument/formatting") then
        vim.keymap.set("n", "<leader>f", function()
            format()
        end, { buffer = bufnr, desc = "format" })

        vim.keymap.set("n", "<leader>F", function()
            slow_format()
        end, { buffer = bufnr, desc = "slow format" })
    end

    if client.supports_method("textDocument/rangeFormatting") then
        -- TODO: add "textDocument/rangesFormatting"
        vim.keymap.set("v", "<leader>f", function()
            format()
        end, { buffer = bufnr, desc = "LSP range format" })

        vim.keymap.set("v", "<leader>F", function()
            slow_format()
        end, { buffer = bufnr, desc = "Slow LSP range format" })
    end
end

return M
