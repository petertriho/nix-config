return {
    "antosha417/nvim-lsp-file-operations",
    dependencies = {
        "nvim-lua/plenary.nvim",
    },
    lazy = true,
    init = function()
        vim.api.nvim_create_autocmd("User", {
            pattern = "NvimTreeSetup",
            callback = function()
                require("lsp-file-operations").setup({})
            end,
        })
    end,
}
