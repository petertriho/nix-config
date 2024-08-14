local sidebars = {
    "NeogitStatus",
    "DiffViewFiles",
    "NvimTree",
    "undotree",
}

return {
    excludes = {
        "cmp_docs",
        "cmp_menu",
        "fugitive",
        "fugitiveblame",
        "gitcommit",
        "help",
        "lspinfo",
        "NeogitStatus",
        "notify",
        "oil",
        "prompt",
        "qf",
        "TelescopePrompt",
        "TelescopeResults",
        unpack(sidebars),
    },
    sidebars = sidebars,
}
