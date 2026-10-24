return {
    "niekdomi/conflict.nvim",
    event = "User LazyLoadFileDeferred",
    cmd = { "Conflict" },
    opts = {
        default_mappings = {
            current = "cc",
            incoming = "ci",
            both = "cb",
            base = "cB",
            none = "c0",
            next = "]x",
            prev = "[x",
        },
        show_actions = true,
        disable_diagnostics = true,
        highlights = {
            current = "DiffText",
            incoming = "DiffAdd",
            ancestor = "DiffChange",
        },
    },
}
