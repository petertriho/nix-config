return {
    "gregorias/coerce.nvim",
    dependencies = "gregorias/coop.nvim",
    keys = {
        { "cR", "<Plug>(coerce-normal)", desc = "Coerce word" },
        { "co", "<Plug>(coerce-normal-no-lsp)", desc = "Coerce word (no LSP)" },
        { "gcR", "<Plug>(coerce-motion)", desc = "Coerce motion" },
        { "gcR", "<Plug>(coerce-visual)", mode = "x", desc = "Coerce selection" },
    },
    opts = {},
}
