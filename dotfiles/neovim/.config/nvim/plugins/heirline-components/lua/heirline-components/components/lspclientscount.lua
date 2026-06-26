local conditions = require("heirline.conditions")

local cache = {}

vim.api.nvim_create_autocmd({ "LspAttach", "LspDetach" }, {
    group = vim.api.nvim_create_augroup("heirline_lsp_count", { clear = true }),
    callback = function(args)
        cache[args.buf] = #vim.lsp.get_clients({ bufnr = args.buf })
    end,
})

return {
    condition = conditions.lsp_attached,
    provider = function()
        local bufnr = vim.api.nvim_get_current_buf()
        local count = cache[bufnr]
        if count == nil then
            count = #vim.lsp.get_clients({ bufnr = bufnr })
            cache[bufnr] = count
        end
        return "󰒓 " .. count
    end,
    update = { "LspAttach", "LspDetach" },
}
