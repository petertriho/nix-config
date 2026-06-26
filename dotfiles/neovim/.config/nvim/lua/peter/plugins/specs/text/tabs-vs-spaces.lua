return {
    "tenxsoydev/tabs-vs-spaces.nvim",
    cmd = {
        "TabsVsSpacesConvert",
        "TabsVsSpacesStandardize",
        "TabsVsSpacesToggle",
    },
    keys = {
        {
            "<leader>us",
            "<CMD>TabsVsSpacesStandardize<CR>",
            desc = "Standardize Tabs",
            mode = "n",
        },
        {
            "<leader>ut",
            "<CMD>TabsVsSpacesToggle<CR>",
            desc = "Toggle Tabs",
        },
        {
            "<leader>uS",
            "<CMD>TabsVsSpacesConvert tabs_to_spaces<CR>",
            desc = "Tabs 󰜴 Spaces",
        },
        {
            "<leader>uT",
            "<CMD>TabsVsSpacesConvert spaces_to_tabs<CR>",
            desc = "Spaces 󰜴 Tabs",
        },
    },
    config = true,
}
