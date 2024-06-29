return {
    "samoshkin/vim-mergetool",
    cmd = {
        "MergetoolPreferLocal",
        "MergetoolPreferRemote",
        "MergetoolSetLayout",
        "MergetoolStart",
        "MergetoolStop ",
        "MergetoolToggle",
        "MergetoolToggleLayout",
    },
    keys = {
        { "<leader>gm", "<CMD>MergetoolToggle<CR>", desc = "merge-tool" },
    },
}
