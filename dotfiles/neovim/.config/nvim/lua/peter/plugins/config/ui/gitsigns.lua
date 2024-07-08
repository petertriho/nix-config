return {
    "lewis6991/gitsigns.nvim",
    event = "User LazyLoadFile",
    keys = {
        { "<leader>gt", "<CMD>Gitsigns toggle_current_line_blame<CR>", "toggle-blame" },
    },
    config = function()
        require("gitsigns").setup({
            signs = {
                add = {
                    text = "│",
                },
                change = {
                    text = "│",
                },
                delete = {
                    text = "│",
                },
                topdelete = {
                    text = "│",
                },
                changedelete = {
                    text = "│",
                },
                untracked = {
                    text = "│",
                },
            },
            current_line_blame_opts = {
                delay = 150,
            },
            on_attach = function(bufnr)
                local gs = package.loaded.gitsigns

                local function keymap(mode, l, r, opts)
                    opts = opts or {}
                    opts.buffer = bufnr
                    vim.keymap.set(mode, l, r, opts)
                end

                -- Navigation
                keymap("n", "]c", function()
                    if vim.wo.diff then
                        return "]c"
                    end
                    vim.schedule(function()
                        gs.next_hunk()
                    end)
                    return "<Ignore>"
                end, { expr = true, desc = "Next change" })

                keymap("n", "[c", function()
                    if vim.wo.diff then
                        return "[c"
                    end
                    vim.schedule(function()
                        gs.prev_hunk()
                    end)
                    return "<Ignore>"
                end, { expr = true, desc = "Previous change" })

                -- Actions
                keymap("n", "<leader>hb", function()
                    gs.blame_line({ full = true })
                end, { desc = "blame-line" })
                keymap("n", "<leader>hD", function()
                    gs.diffthis("~")
                end, { desc = "diff-file" })
                keymap("n", "<leader>hd", gs.diffthis, { desc = "diff-this" })
                keymap("n", "<leader>hp", gs.preview_hunk, { desc = "preview-hunk" })
                keymap("n", "<leader>hR", gs.reset_buffer, { desc = "reset-buffer" })
                keymap({ "n", "v" }, "<leader>hr", ":Gitsigns reset_hunk<CR>", { desc = "reset-hunk" })
                keymap("n", "<leader>hS", gs.stage_buffer, { desc = "stage-buffer" })
                keymap({ "n", "v" }, "<leader>hs", ":Gitsigns stage_hunk<CR>", { desc = "stage-hunk" })
                keymap("n", "<leader>hu", gs.undo_stage_hunk, { desc = "undo-stage-hunk" })

                -- Text object
                keymap({ "o", "x" }, "ih", ":<C-U>Gitsigns select_hunk<CR>", { desc = "Inner hunk" })
            end,
        })

        require("scrollbar.handlers.gitsigns").setup()
    end,
}
