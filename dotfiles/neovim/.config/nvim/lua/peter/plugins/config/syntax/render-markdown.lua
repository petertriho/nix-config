local ft = {
    "markdown",
    "Avante",
    "codecompanion",
    "copilot-chat",
    "opencode_output",
}
return {
    "MeanderingProgrammer/render-markdown.nvim",
    ft = ft,
    opts = {
        file_types = ft,
    },
}
