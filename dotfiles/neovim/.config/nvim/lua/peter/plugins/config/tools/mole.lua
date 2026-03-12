return {
    "zion-off/mole.nvim",
    dependencies = { "MunifTanjim/nui.nvim" },
    cmd = {
        "MoleStart",
        "MoleStop",
        "MoleResume",
        "MoleToggle",
    },
    keys = {
        {
            "<leader>ms",
            function()
                require("mole").start_session()
            end,
            desc = "Start",
        },
        {
            "<leader>mq",
            function()
                require("mole").stop_session()
            end,
            desc = "Stop",
        },
        {
            "<leader>mr",
            function()
                require("mole").resume_session()
            end,
            desc = "Resume",
        },
        {
            "<leader>mw",
            function()
                require("mole").toggle_window()
            end,
            desc = "Window",
        },
        {
            "<leader>ma",
            function()
                require("mole").annotate()
            end,
            mode = "x",
            desc = "Annotate",
        },
    },
    config = true,
}
