return {
    "L3MON4D3/LuaSnip",
    lazy = true,
    dependencies = {
        "rafamadriz/friendly-snippets",
    },
    build = "make install_jsregexp",
    config = function()
        require("luasnip.loaders.from_vscode").lazy_load()
        require("peter.plugins.snippets").setup()
        vim.keymap.set("x", "<leader>x", require("luasnip").select_keys, { desc = "Snippet" })
    end,
}
