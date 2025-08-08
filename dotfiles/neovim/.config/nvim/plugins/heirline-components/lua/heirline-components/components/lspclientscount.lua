local conditions = require("heirline.conditions")

return {
    condition = conditions.lsp_attached,
    provider = function()
        local bufnr = vim.api.nvim_get_current_buf()
        local client_count = #vim.lsp.get_clients({ bufnr = bufnr })
        return "󰒓 " .. client_count
    end,
    update = { "LspAttach", "LspDetach" },
}
