local ft = {
    "markdown",
    "codecompanion",
    "opencode_output",
}
return {
    "MeanderingProgrammer/render-markdown.nvim",
    enabled = false,
    ft = ft,
    opts = {
        file_types = ft,
    },
}
