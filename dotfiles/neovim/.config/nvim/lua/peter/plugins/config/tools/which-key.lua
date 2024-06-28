return {
    "folke/which-key.nvim",
    config = function()
        require("which-key").setup({
            layout = {
                align = "center",
            },
            operators = {
                cx = "Exchange",
                gb = "Block Comments",
                gc = "Comments",
                ["<Leader>s"] = "Substitute",
            },
        })

        -- Space keymaps
        local leader_keymaps = {
            [" "] = { ":w<CR>", "write" },
            ["-"] = { "<C-w>s", "split-below" },
            ["."] = { "<CMD>BWipeout other<CR>", "only-buffer" },
            [","] = { "<CMD>BWipeout hidden<CR>", "hidden-buffers" },
            ["/"] = "comment",
            ["\\"] = { "<C-w>v", "split-right" },
            d = { "<CMD>Bwipeout<CR>", "delete-buffer" },
            e = { "<CMD>NvimTreeFindFileToggle<CR>", "explorer" },
            f = "format",
            F = "format-slow",
            j = { "<CMD>ToggleGitStatus<CR>", "git-status" },
            J = "reverse-J",
            k = { "<CMD>lua vim.lsp.buf.code_action()<CR>", "code-actions" },
            n = { ":nohl<CR>", "no-highlight" },
            o = "organize-imports",
            q = { "<CMD>CodeActionMenu<CR>", "quickfix" },
            s = "substitute",
            S = "substitute-eol",
            u = { "<CMD>MundoToggle<CR>", "undotree" },
            x = { "<CMD>BWipeout all<CR>", "delete-all-buffers" },
            z = { "<CMD>ZenMode<CR>", "zenmode" },
        }

        local leader_visual_keymaps = {
            ["/"] = "comment",
            f = "format",
            F = "format-slow",
            k = { "<CMD>lua vim.lsp.buf.range_code_action()<CR>", "code-actions" },
            q = { "<CMD>CodeActionMenu<CR>", "quickfix" },
            s = "substitute",
            x = { "<Plug>(vsnip-select-text)", "snippet-select" },
            X = { "<Plug>(vsnip-cut-text)", "snippet-cut" },
        }

        leader_keymaps["1"] = "which_key_ignore"
        leader_keymaps["2"] = "which_key_ignore"
        leader_keymaps["3"] = "which_key_ignore"
        leader_keymaps["4"] = "which_key_ignore"
        leader_keymaps["5"] = "which_key_ignore"
        leader_keymaps["6"] = "which_key_ignore"
        leader_keymaps["7"] = "which_key_ignore"
        leader_keymaps["8"] = "which_key_ignore"
        leader_keymaps["9"] = "which_key_ignore"
        leader_keymaps["0"] = "which_key_ignore"

        leader_keymaps["a"] = {
            name = "+actions",
            a = { "<Plug>(EasyAlign)", "align" },
            e = { ":!chmod +x %<CR>", "executable" },
            j = { "<CMD>SplitjoinJoin<CR>", "join-lines" },
            r = "rename",
            p = { 'ggVG"+p', "paste-file" },
            s = { "<CMD>ISwap<CR>", "swap" },
            x = { "<CMD>SplitjoinSplit<CR>", "split-lines" },
            y = { "<CMD>%y+<CR>", "yank-file" },
        }

        leader_visual_keymaps["a"] = {
            name = "+actions",
            a = { "<Plug>(EasyAlign)", "align" },
            s = { ":Sort i<CR>", "sort" },
        }

        leader_keymaps["g"] = {
            name = "+git",
            b = { "<CMD>lua require('telescope.builtin').git_branches()<CR>", "branches" },
            c = { "<CMD>lua require('telescope.builtin').git_commits()<CR>", "commits" },
            d = { "<CMD>DiffviewOpen<CR>", "diffview" },
            f = {
                "<CMD>lua require('gitlinker').get_buf_range_url('n', { add_current_line_on_normal_mode = false })<CR>",
                "file-link",
            },
            F = {
                "<CMD>lua require('gitlinker').get_buf_range_url('n', { add_current_line_on_normal_mode = false, action_callback = require('gitlinker.actions').open_in_browser })<CR>",
                "file-browser",
            },
            h = { "<CMD>DiffviewFileHistory %<CR>", "history-file" },
            l = { "<CMD>lua require('gitlinker').get_buf_range_url('n', {})<CR>", "line-link" },
            L = {
                "<CMD>lua require('gitlinker').get_buf_range_url('n', { action_callback = require('gitlinker.actions').open_in_browser })<CR>",
                "line-browser",
            },
            m = { "<CMD>MergetoolToggle<CR>", "merge-tool" },
            s = { "<CMD>lua require('telescope.builtin').git_stashes()<CR>", "stashes" },
            t = { "<CMD>Gitsigns toggle_current_line_blame<CR>", "toggle-blame" },
            u = { "<CMD>lua require('gitlinker').get_repo_url()<CR>", "url-link" },
            U = {
                "<CMD>lua require('gitlinker').get_repo_url({ action_callback = require('gitlinker.actions').open_in_browser })<CR>",
                "url-browser",
            },
            x = { "<CMD>GitConflictListQf<CR>", "conflict-qf" },
        }

        leader_visual_keymaps["g"] = {
            name = "+git",
            l = { "<CMD>lua require('gitlinker').get_buf_range_url('v', {})<CR>", "line-link" },
            L = {
                "<CMD>lua require('gitlinker').get_buf_range_url('v', { action_callback = require('gitlinker.actions').open_in_browser })<CR>",
                "line-browser",
            },
        }

        leader_keymaps["h"] = {
            name = "+hunks",
            b = "blame-line",
            D = "diff-file",
            d = "diff-this",
            p = "preview-hunk",
            R = "reset-buffer",
            r = "reset-hunk",
            S = "stage-buffer",
            s = "stage-hunk",
            u = "undo-stage-hunk",
        }

        leader_visual_keymaps["h"] = {
            name = "+hunks",
            r = "reset-hunk",
            s = "stage-hunk",
        }

        leader_keymaps["l"] = {
            name = "+lsp",
            c = {
                "<CMD>lua require('telescope.builtin').lsp_code_actions(require('telescope.themes').get_cursor())<CR>",
                "code-actions",
            },
            d = {
                "<CMD>lua require('telescope.builtin').lsp_definitions({ jump_type = 'never' })<CR>",
                "definitions",
            },
            e = {
                name = "+errors",
                d = { "<CMD>lua require('telescope.builtin').lsp_document_diagnostics()<CR>", "document" },
                w = { "<CMD>lua require('telescope.builtin').lsp_workspace_diagnostics()<CR>", "workspace" },
            },
            l = { "<CMD>lua vim.diagnostic.setloclist()<CR>", "loclist-diagnostics" },
            m = {
                "<CMD>lua require('telescope.builtin').lsp_implementations({ jump_type = 'never' })<CR>",
                "implementations",
            },
            q = { "<CMD>lua vim.diagnostic.setqflist()<CR>", "qflist-diagnostics" },
            r = { "<CMD>lua require('telescope.builtin').lsp_references()<CR>", "references" },
            s = {
                name = "+symbols",
                d = { "<CMD>lua require('telescope.builtin').lsp_document_symbols()<CR>", "documents" },
                w = { "<CMD>lua require('telescope.builtin').lsp_workspace_symbols()<CR>", "workspace" },
                W = {
                    "<CMD>lua require('telescope.builtin').lsp_dynamic_workspace_symbols()<CR>",
                    "dynamic-workspace",
                },
            },
            y = {
                "<CMD>lua require('telescope.builtin').lsp_type_definitions({ jump_type = 'never' })<CR>",
                "type-definitions",
            },
        }

        leader_visual_keymaps["l"] = {
            name = "+lsp",
            c = {
                "<CMD>lua require('telescope.builtin').lsp_range_code_actions(require('telescope.themes').get_cursor())",
                "code-actions",
            },
        }

        leader_keymaps["m"] = {
            name = "+marks",
            a = { "<CMD>MarksListAll<CR>", "all-list" },
            b = { "<CMD>BookmarksListAll<CR>", "bookmarks-list" },
            g = { "<CMD>MarksListGlobal<CR>", "global-list" },
            l = { "<CMD>MarksListBuf<CR>", "local-list" },
            t = { "<CMD>MarksToggleSigns<CR>", "toggle-signs" },
        }

        local register = require("which-key").register
        register(leader_keymaps, {
            prefix = "<Leader>",
            mode = "n",
            silent = true,
            noremap = true,
        })

        register(leader_visual_keymaps, {
            prefix = "<Leader>",
            mode = "x",
            silent = true,
            noremap = true,
        })

        -- Semicolon keymaps
        local semicolon_keymaps = {
            [":"] = { "<CMD>Telescope dir find_files<CR>", "dir-find-files" },
            [";"] = { "<CMD>Telescope find_files hidden=true<CR>", "find-files" },
            b = { "<CMD>Telescope scope buffers<CR>", "buffers" },
            f = { "<CMD>Telescope find_files find_command=fd,-HIL<CR>", "find-files-all" },
            F = { "<CMD>Telescope dir find_files<CR>", "dir-find-files" },
            h = { "<CMD>TSBufToggle highlight<CR>", "highlight-toggle" },
            l = { "<CMD>LLToggle<CR>", "loc-list-toggle" },
            m = { "<Plug>MarkdownPreviewToggle", "markdown-preview" },
            q = { "<CMD>QFToggle<CR>", "qf-list-toggle" },
            s = { "<CMD>Telescope live_grep<CR>", "search-text" },
            S = { "<CMD>Telescope dir live_grep<CR>", "dir-search-text" },
            y = { "<CMD>Telescope yaml_schema<CR>", "yaml-schema" },
        }

        register(semicolon_keymaps, {
            prefix = ";",
            mode = "n",
            silent = true,
            noremap = true,
        })
    end,
}
