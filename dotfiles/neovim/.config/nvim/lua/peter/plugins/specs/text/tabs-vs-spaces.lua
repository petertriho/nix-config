return {
    "tenxsoydev/tabs-vs-spaces.nvim",
    cmd = {
        "TabsVsSpacesConvert",
        "TabsVsSpacesStandardize",
        "TabsVsSpacesToggle",
    },
    keys = {
        {
            "<leader>is",
            "<CMD>TabsVsSpacesStandardize<CR>",
            desc = "Standardize Tabs",
            mode = "n",
        },
        {
            "<leader>it",
            "<CMD>TabsVsSpacesToggle<CR>",
            desc = "Toggle Tabs",
        },
        {
            "<leader>iS",
            "<CMD>TabsVsSpacesConvert tabs_to_spaces<CR>",
            desc = "Tabs 󰜴 Spaces",
        },
        {
            "<leader>iT",
            "<CMD>TabsVsSpacesConvert spaces_to_tabs<CR>",
            desc = "Spaces 󰜴 Tabs",
        },
    },
    config = true,
}
