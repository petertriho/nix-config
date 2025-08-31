return {
    dir = "~/.config/nvim/plugins/incremental-selection",
    event = "User LoadedNvimTreesitter",
    opts = {
        keymaps = {
            init_selection = false,
            node_incremental = "v",
            node_decremental = "V",
            scope_incremental = false,
        },
    },
}
