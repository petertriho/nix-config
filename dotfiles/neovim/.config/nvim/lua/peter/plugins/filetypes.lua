local sidebars = {
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
