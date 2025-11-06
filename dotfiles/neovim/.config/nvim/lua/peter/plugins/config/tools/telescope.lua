return {
    "nvim-telescope/telescope.nvim",
    enabled = false,
    cmd = "Telescope",
    config = function()
        local telescope = require("telescope")
        local actions_layout = require("telescope.actions.layout")

        local function flash(prompt_bufnr)
            require("flash").jump({
                pattern = "^",
                label = { after = { 0, 0 } },
                search = {
                    mode = "search",
                    exclude = {
                        function(win)
                            return vim.bo[vim.api.nvim_win_get_buf(win)].filetype ~= "TelescopeResults"
                        end,
                    },
                    multi_window = true,
                },
                action = function(match)
                    local picker = require("telescope.actions.state").get_current_picker(prompt_bufnr)
                    picker:set_selection(match.pos[1] - 1)
                end,
            })
        end

        telescope.setup({
            defaults = {
                vimgrep_arguments = {
                    "rg",
                    "--color=never",
                    "--no-heading",
                    "--with-filename",
                    "--line-number",
                    "--column",
                    "--smart-case",
                    "--hidden",
                },
                prompt_prefix = "   ",
                selection_caret = "  ",
                mappings = {
                    i = {
                        ["<C-l>"] = actions_layout.toggle_preview,
                        ["<c-s>"] = flash,
                    },
                    n = {
                        ["<C-l>"] = actions_layout.toggle_preview,
                        s = flash,
                    },
                },
                history = false,
                file_ignore_patterns = vim.opt.wildignore:get(),
                sorting_strategy = "ascending",
                layout_strategy = "flex",
                layout_config = {
                    horizontal = { preview_width = 0.6, prompt_position = "top" },
                    vertical = { mirror = true },
                },
            },
            extensions = {
                fzf = {
                    fuzzy = true,
                    override_generic_sorter = false,
                    override_file_sorter = true,
                    case_mode = "smart_case",
                },
                undo = {
                    use_delta = true,
                    side_by_side = true,
                },
            },
            pickers = {
                file_browser = {
                    hidden = true,
                },
                find_files = {
                    hidden = true,
                },
            },
        })

        -- telescope.load_extension("fzf")
    end,
}
