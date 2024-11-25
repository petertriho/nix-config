local launch_telescope = function(func_name, desc)
    return {
        function()
            local basedir = require("oil").get_current_dir()
            require("telescope.builtin")[func_name]({
                cwd = basedir,
                search_dirs = { basedir },
            })
        end,
        mode = "n",
        nowait = true,
        desc = desc,
    }
end

return {
    "stevearc/oil.nvim",
    init = function()
        vim.keymap.set("n", "-", function()
            require("oil").open()
        end, { desc = "Open Parent Directory" })
    end,
    opts = {
        keymaps = {
            ["<C-v>"] = "actions.select_vsplit",
            ["<C-x>"] = "actions.select_split",
            ["<C-t>"] = "actions.select_tab",
            ["<C-p>"] = "actions.preview",
            ["<C-c>"] = "actions.close",
            ["<C-r>"] = "actions.refresh",
            ["<C-f>"] = launch_telescope("find_files", "Find files in the current directory"),
            ["<C-s>"] = launch_telescope("live_grep", "Live grep in the current directory"),
            ["g?"] = "actions.show_help",
            ["<CR>"] = "actions.select",
            ["-"] = "actions.parent",
            ["_"] = "actions.open_cwd",
            ["`"] = "actions.cd",
            ["~"] = "actions.tcd",
            ["g."] = "actions.toggle_hidden",
        },
        use_default_keymaps = false,
        view_options = {
            show_hidden = true,
        },
    },
}
