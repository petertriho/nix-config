return {
    "tenxsoydev/tabs-vs-spaces.nvim",
    cmd = {
        "TabsVsSpacesConvert",
        "TabsVsSpacesStandardize",
        "TabsVsSpacesToggle",
    },
    keys = {
        {
            "<leader>ms",
            "<CMD>TabsVsSpacesStandardize<CR>",
            desc = "Standardize Tabs",
            mode = { "n", "v" },
        },
        {
            "<leader>mt",
            "<CMD>TabsVsSpacesToggle<CR>",
            desc = "Toggle Tabs",
        },
        {
            "<leader>mS",
            "<CMD>TabsVsSpacesConvert tabs_to_spaces<CR>",
            desc = "Tabs 󰜴 Spaces",
        },
        {
            "<leader>mT",
            "<CMD>TabsVsSpacesConvert spaces_to_tabs<CR>",
            desc = "Spaces 󰜴 Tabs",
        },
    },
    config = true,
}
