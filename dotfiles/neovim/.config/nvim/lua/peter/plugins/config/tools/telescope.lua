return {
    "nvim-telescope/telescope.nvim",
    cmd = "Telescope",
    keys = {
        { "<leader>;", "<CMD>Telescope find_files hidden=true<CR>", desc = "find-files" },
        { "<leader>a;", "<CMD>Telescope yaml_schema<CR>", desc = "yaml-schema" },
        { "<leader>'", "<CMD>Telescope live_grep<CR>", desc = "live-grep" },
        { "<leader>gb", "<CMD>lua require('telescope.builtin').git_branches()<CR>", desc = "branches" },
        { "<leader>gc", "<CMD>lua require('telescope.builtin').git_commits()<CR>", desc = "commits" },
        { "<leader>gs", "<CMD>lua require('telescope.builtin').git_stashes()<CR>", desc = "stashes" },
        { "<leader>ta", "<CMD>Telescope find_files find_command=fd,-HIL<CR>", desc = "find-files-all" },
        { "<leader>tb", "<CMD>Telescope scope buffers<CR>", desc = "buffers" },
        { "<leader>tf", "<CMD>Telescope find_files hidden=true<CR>", desc = "find-files" },
        { "<leader>tl", "<CMD>Telescope live_grep<CR>", desc = "live-grep" },
        {
            "<leader>ld",
            "<CMD>lua require('telescope.builtin').lsp_definitions({ jump_type = 'never' })<CR>",
            desc = "definitions",
        },
        { "<leader>led", "<CMD>lua require('telescope.builtin').lsp_document_diagnostics()<CR>", desc = "document" },
        { "<leader>lew", "<CMD>lua require('telescope.builtin').lsp_workspace_diagnostics()<CR>", desc = "workspace" },
        { "<leader>ll", "<CMD>lua vim.diagnostic.setloclist()<CR>", desc = "loclist-diagnostics" },
        {
            "<leader>lm",
            "<CMD>lua require('telescope.builtin').lsp_implementations({ jump_type = 'never' })<CR>",
            desc = "implementations",
        },
        { "<leader>lr", "<CMD>lua require('telescope.builtin').lsp_references()<CR>", desc = "references" },
        { "<leader>lsd", "<CMD>lua require('telescope.builtin').lsp_document_symbols()<CR>", desc = "documents" },
        { "<leader>lsw", "<CMD>lua require('telescope.builtin').lsp_workspace_symbols()<CR>", desc = "workspace" },
        {
            "<leader>lsW",
            "<CMD>lua require('telescope.builtin').lsp_dynamic_workspace_symbols()<CR>",
            desc = "dynamic-workspace",
        },
        {
            "<leader>ly",
            "<CMD>lua require('telescope.builtin').lsp_type_definitions({ jump_type = 'never' })<CR>",
            desc = "type-definitions",
        },
    },
    config = function()
        local telescope = require("telescope")
        local actions = require("telescope.actions")
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
                        ["<C-j>"] = actions.move_selection_next,
                        ["<C-k>"] = actions.move_selection_previous,
                        ["<C-l>"] = actions_layout.toggle_preview,
                        ["<c-s>"] = flash,
                    },
                    n = {
                        ["<C-j>"] = actions.move_selection_next,
                        ["<C-k>"] = actions.move_selection_previous,
                        ["<C-l>"] = actions_layout.toggle_preview,
                        s = flash,
                    },
                },
                history = false,
                file_ignore_patterns = { "%.git/*" },
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
                    attach_mappings = function()
                        require("telescope.actions.set").select:enhance({
                            post = function()
                                vim.cmd(":normal! zx")
                            end,
                        })
                        return true
                    end,
                },
            },
        })

        telescope.load_extension("fzf")
        -- telescope.load_extension("yaml_schema")
    end,
}
