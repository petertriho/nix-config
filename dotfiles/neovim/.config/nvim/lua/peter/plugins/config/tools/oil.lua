local launch_snacks_picker = function(picker_type, desc)
    return {
        function()
            local basedir = require("oil").get_current_dir()
            require("snacks").picker[picker_type]({ cwd = basedir })
        end,
        mode = "n",
        nowait = true,
        desc = desc,
    }
end

return {
    "stevearc/oil.nvim",
    enabled = false,
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
            ["<C-f>"] = launch_snacks_picker("files", "Find files in the current directory"),
            ["<C-s>"] = launch_snacks_picker("grep", "Live grep in the current directory"),
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
    config = function(_, opts)
        require("oil").setup(opts)

        vim.api.nvim_create_autocmd("User", {
            pattern = "OilActionsPost",
            callback = function(event)
                if event.data.actions.type == "move" then
                    require("snacks").rename.on_rename_file(event.data.actions.src_url, event.data.actions.dest_url)
                end
            end,
        })
    end,
}
