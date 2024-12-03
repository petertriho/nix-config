local sidebars = {
    "DiffViewFiles",
    "NeogitStatus",
    "NvimTree",
    "fugitive",
    "undotree",
}

return {
    excludes = {
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
        "TelescopePrompt",
        "TelescopeResults",
        unpack(sidebars),
    },
    sidebars = sidebars,
}
