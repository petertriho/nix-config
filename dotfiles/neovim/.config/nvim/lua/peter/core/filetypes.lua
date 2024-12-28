local sidebars = {
    "DiffViewFiles",
    "NeogitStatus",
    "NvimTree",
    "fugitive",
    "undotree",
}

return {
    excludes = {
        "TelescopePrompt",
        "TelescopeResults",
        "bigfile",
        "blink-cmp-documentation",
        "blink-cmp-menu",
        "blink-cmp-signature",
        "cmp_docs",
        "cmp_menu",
        "fugitiveblame",
        "gitcommit",
        "help",
        "lspinfo",
        "notify",
        "oil",
        "oil_preview",
        "prompt",
        "qf",
        unpack(sidebars),
    },
    sidebars = sidebars,
}
