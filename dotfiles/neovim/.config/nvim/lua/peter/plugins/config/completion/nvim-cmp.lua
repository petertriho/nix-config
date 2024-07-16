return {
    "hrsh7th/nvim-cmp",
    event = { "CmdlineEnter", "InsertEnter" },
    dependencies = {
        -- "andersevenrud/cmp-tmux",
        "dmitmel/cmp-cmdline-history",
        "hrsh7th/cmp-buffer",
        "hrsh7th/cmp-cmdline",
        "hrsh7th/cmp-nvim-lsp",
        "hrsh7th/cmp-nvim-lsp-signature-help",
        "hrsh7th/cmp-path",
        "hrsh7th/cmp-vsnip",
        "onsails/lspkind.nvim",
        { "petertriho/cmp-git", config = true },
        "rafamadriz/friendly-snippets",
        { "tzachar/cmp-fuzzy-buffer", dependencies = "tzachar/fuzzy.nvim" },
        { "tzachar/cmp-fuzzy-path", dependencies = "tzachar/fuzzy.nvim" },
        {
            "hrsh7th/vim-vsnip",
            keys = {
                { "<leader>x", "<Plug>(vsnip-select-text)", mode = "x", desc = "snippet-select" },
                { "<leader>X", "<Plug>(vsnip-cut-text)", mode = "x", desc = "snippet-cut" },
            },
            init = function()
                vim.g.vsnip_filetypes = {
                    javascriptreact = { "javascript" },
                    typescript = { "javascript" },
                    typescriptreact = { "javascript" },
                }
            end,
        },
    },
    keys = {
        { "<leader>lc", "<CMD>ToggleNvimCmp<CR>", desc = "completion-toggle" },
    },
    init = function()
        vim.g.completion_enabled = true

        local function toggle_completion()
            local cmp = require("cmp")
            if vim.g.completion_enabled then
                cmp.setup({ completion = { autocomplete = false } })
            else
                cmp.setup({ completion = { autocomplete = { cmp.TriggerEvent.TextChanged } } })
            end
            vim.g.completion_enabled = not vim.g.completion_enabled
        end

        vim.api.nvim_create_user_command("ToggleNvimCmp", toggle_completion, {})
    end,
    config = function()
        -- local has_words_before = function()
        --     if vim.api.nvim_buf_get_option(0, "buftype") == "prompt" then
        --         return false
        --     end
        --     local line, col = unpack(vim.api.nvim_win_get_cursor(0))
        --     return col ~= 0 and vim.api.nvim_buf_get_lines(0, line - 1, line, true)[1]:sub(col, col):match("%s") == nil
        -- end

        local function feedkeys(key)
            vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes(key, true, true, true), "m", true)
        end

        local cmp = require("cmp")

        local select_prev_snippet = cmp.mapping({
            c = function()
                if cmp.visible() then
                    cmp.select_prev_item()
                else
                    cmp.complete()
                end
            end,
            i = function(fallback)
                if vim.fn["vsnip#jumpable"](-1) == 1 then
                    feedkeys("<Plug>(vsnip-jump-prev)")
                --[[ elseif has_words_before() then
                    cmp.complete() ]]
                else
                    fallback()
                end
            end,
            s = function(fallback)
                if vim.fn["vsnip#jumpable"](-1) == 1 then
                    feedkeys("<Plug>(vsnip-jump-prev)")
                else
                    fallback()
                end
            end,
        })

        local select_next_snippet = cmp.mapping({
            c = function()
                if cmp.visible() then
                    cmp.select_next_item()
                else
                    cmp.complete()
                end
            end,
            i = function(fallback)
                if vim.fn["vsnip#available"](1) == 1 then
                    feedkeys("<Plug>(vsnip-expand-or-jump)")
                -- elseif has_words_before() then
                --     cmp.complete()
                else
                    fallback()
                end
            end,
            s = function(fallback)
                if vim.fn["vsnip#available"](1) == 1 then
                    feedkeys("<Plug>(vsnip-expand-or-jump)")
                else
                    fallback()
                end
            end,
        })

        local select_prev_item = cmp.mapping({
            c = function()
                if cmp.visible() then
                    cmp.select_prev_item()
                else
                    cmp.complete()
                end
            end,
            i = function(fallback)
                if cmp.visible() then
                    cmp.select_prev_item()
                elseif vim.fn["vsnip#jumpable"](-1) == 1 then
                    feedkeys("<Plug>(vsnip-jump-prev)")
                -- elseif has_words_before() then
                --     cmp.complete()
                else
                    fallback()
                end
            end,
            s = function(fallback)
                if vim.fn["vsnip#jumpable"](-1) == 1 then
                    feedkeys("<Plug>(vsnip-jump-prev)")
                else
                    fallback()
                end
            end,
        })

        local select_next_item = cmp.mapping({
            c = function()
                if cmp.visible() then
                    cmp.select_next_item()
                else
                    cmp.complete()
                end
            end,
            i = function(fallback)
                if cmp.visible() then
                    cmp.select_next_item()
                elseif vim.fn["vsnip#available"](1) == 1 then
                    feedkeys("<Plug>(vsnip-expand-or-jump)")
                -- elseif has_words_before() then
                --     cmp.complete()
                else
                    fallback()
                end
            end,
            s = function(fallback)
                if vim.fn["vsnip#available"](1) == 1 then
                    feedkeys("<Plug>(vsnip-expand-or-jump)")
                else
                    fallback()
                end
            end,
        })

        local types = require("cmp.types")

        local function deprioritize_snippet(entry1, entry2)
            if entry1:get_kind() == types.lsp.CompletionItemKind.Snippet then
                return false
            end
            if entry2:get_kind() == types.lsp.CompletionItemKind.Snippet then
                return true
            end
        end

        local default_comparators = require("cmp.config.default")().sorting.comparators

        cmp.setup({
            sorting = {
                priority_weight = 2,
                comparators = {
                    deprioritize_snippet,
                    unpack(default_comparators),
                },
            },
            window = {
                documentation = {
                    border = { "╭", "─", "╮", "│", "╯", "─", "╰", "│" },
                    winhighlight = "NormalFloat:NormalFloat,FloatBorder:FloatBorder",
                },
            },
            formatting = {
                format = function(entry, vim_item)
                    local cmp_format = require("lspkind").cmp_format({
                        mode = "symbol_text",
                        maxwidth = 80,
                        menu = {
                            buffer = "[BUFFER]",
                            cmdline = "[CMD]",
                            cmdline_history = "[CMD_HISTORY]",
                            git = "[GIT]",
                            fuzzy_path = "[FZ-PATH]",
                            fuzzy_buffer = "[FZ-BUFFER]",
                            nvim_lsp = "[LSP]",
                            path = "[PATH]",
                            tmux = "[TMUX]",
                            vsnip = "[SNIPPET]",
                        },
                    })

                    return cmp_format(entry, vim_item)
                    -- end
                end,
            },
            mapping = {
                ["<C-j>"] = select_next_item,
                ["<C-k>"] = select_prev_item,
                ["<Tab>"] = select_next_item,
                ["<S-Tab>"] = select_prev_item,
                ["<C-n>"] = select_next_snippet,
                ["<C-p>"] = select_prev_snippet,
                ["<C-d>"] = cmp.mapping(cmp.mapping.scroll_docs(4), { "c", "i" }),
                ["<C-u>"] = cmp.mapping(cmp.mapping.scroll_docs(-4), { "c", "i" }),
                ["<C-Space>"] = cmp.mapping(cmp.mapping.complete(), { "c", "i" }),
                ["<C-c>"] = cmp.mapping(cmp.mapping.close(), { "c", "i" }),
                ["<CR>"] = cmp.mapping.confirm({
                    behavior = cmp.ConfirmBehavior.Replace,
                    select = false,
                }),
            },
            snippet = {
                expand = function(args)
                    vim.fn["vsnip#anonymous"](args.body)
                end,
            },
            sources = {
                { name = "nvim_lsp_signature_help" },
                { name = "nvim_lsp" },
                { name = "git" },
                { name = "path" },
                {
                    name = "buffer",
                    option = {
                        get_bufnrs = function()
                            -- visible buffers
                            local bufs = {}
                            for _, win in ipairs(vim.api.nvim_list_wins()) do
                                bufs[vim.api.nvim_win_get_buf(win)] = true
                            end
                            return vim.tbl_keys(bufs)
                        end,
                    },
                },
                -- {
                --     name = "tmux",
                --     option = {
                --         all_panes = true,
                --         trigger_characters = {},
                --     },
                -- },
                { name = "vsnip" },
            },
        })

        cmp.setup.cmdline("/", {
            sources = {
                { name = "fuzzy_buffer" },
                { name = "buffer" },
            },
        })

        cmp.setup.cmdline(":", {
            sources = {
                { name = "cmdline" },
                { name = "cmdline_history" },
                {
                    name = "fuzzy_path",
                    options = {
                        fd_cmd = {
                            "fd",
                            "--max-depth",
                            "20",
                            "--full-path",
                            "--hidden",
                            "--ignore-case",
                            "--exclude",
                            ".git",
                        },
                    },
                },
                { name = "path" },
                { name = "fuzzy_buffer" },
                { name = "buffer" },
            },
        })
    end,
}
