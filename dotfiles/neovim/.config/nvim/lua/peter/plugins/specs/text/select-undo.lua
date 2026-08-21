return {
    "SunnyTamang/select-undo.nvim",
    keys = {
        { "zu", mode = "x", desc = "Undo newest change in selection" },
        { "zU", mode = "x", desc = "Undo last change of every selected line" },
        { "zcu", mode = "x", desc = "Undo selected characters" },
    },
    opts = {
        persistent_undo = false,
        line_mapping = "zu",
        sweep_mapping = "zU",
        partial_mapping = "zcu",
    },
}
