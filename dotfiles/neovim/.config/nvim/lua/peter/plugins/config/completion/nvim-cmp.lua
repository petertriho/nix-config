return {
    "hrsh7th/nvim-cmp",
    event = { "CmdlineEnter", "InsertEnter" },
    dependencies = {
        "andersevenrud/cmp-tmux",
        "dmitmel/cmp-cmdline-history",
        "hrsh7th/cmp-buffer",
        "hrsh7th/cmp-cmdline",
        "hrsh7th/cmp-nvim-lsp",
        "hrsh7th/cmp-nvim-lsp-signature-help",
        "hrsh7th/cmp-path",
        { "petertriho/cmp-git", config = true },
        "saadparwaiz1/cmp_luasnip",
        { "tzachar/cmp-fuzzy-buffer", dependencies = "tzachar/fuzzy.nvim" },
        { "tzachar/cmp-fuzzy-path", dependencies = "tzachar/fuzzy.nvim" },
    },
    keys = {
        { "<leader>lc", "<CMD>ToggleNvimCmp<CR>", desc = "Completion Toggle" },
    },
    init = function()
        vim.g.completion_enabled = true

        local function toggle_completion()
            local cmp = require("cmp")
            if vim.g.completion_enabled then
                pcall(cmp.setup, { completion = { autocomplete = false } })
            else
                pcall(cmp.setup, { completion = { autocomplete = { cmp.TriggerEvent.TextChanged } } })
            end
            vim.g.completion_enabled = not vim.g.completion_enabled
        end

        vim.api.nvim_create_user_command("ToggleNvimCmp", toggle_completion, {})
    end,
    config = function()
        local cmp = require("cmp")
        local luasnip = require("luasnip")

        local prev_snippet_fallback = function(fallback)
            if luasnip.locally_jumpable(-1) then
                luasnip.jump(-1)
            else
                fallback()
            end
        end

        local next_snippet_fallback = function(fallback)
            if luasnip.locally_jumpable(1) then
                luasnip.jump(1)
            else
                fallback()
            end
        end

        local select_prev_snippet = cmp.mapping({
            c = function()
                if cmp.visible() then
                    cmp.select_prev_item()
                else
                    cmp.complete()
                end
            end,
            i = prev_snippet_fallback,
            s = prev_snippet_fallback,
        })

        local select_next_snippet = cmp.mapping({
            c = function()
                if cmp.visible() then
                    cmp.select_next_item()
                else
                    cmp.complete()
                end
            end,
            i = next_snippet_fallback,
            s = next_snippet_fallback,
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
                elseif luasnip.locally_jumpable(-1) then
                    luasnip.jump(-1)
                else
                    fallback()
                end
            end,
            s = prev_snippet_fallback,
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
                elseif luasnip.expand_or_jumpable() then
                    luasnip.expand_or_jump()
                else
                    fallback()
                end
            end,
            s = function(fallback)
                if luasnip.expand_or_jumpable() then
                    luasnip.expand_or_jump()
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
            preselect = cmp.PreselectMode.None,
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
                format = require("lspkind").cmp_format({
                    mode = "symbol_text",
                    maxwidth = 80,
                    menu = {
                        buffer = "[BUFFER]",
                        cmdline = "[CMD]",
                        cmdline_history = "[CMD_HISTORY]",
                        fuzzy_buffer = "[FZ-BUFFER]",
                        fuzzy_path = "[FZ-PATH]",
                        git = "[GIT]",
                        luasnip = "[SNIPPET]",
                        nvim_lsp = "[LSP]",
                        path = "[PATH]",
                        tmux = "[TMUX]",
                    },
                }),
            },
            mapping = {
                ["<Tab>"] = select_next_snippet,
                ["<S-Tab>"] = select_prev_snippet,
                ["<C-n>"] = select_next_item,
                ["<C-p>"] = select_prev_item,
                ["<C-d>"] = cmp.mapping(cmp.mapping.scroll_docs(4), { "c", "i" }),
                ["<C-u>"] = cmp.mapping(cmp.mapping.scroll_docs(-4), { "c", "i" }),
                ["<C-Space>"] = cmp.mapping(cmp.mapping.complete(), { "c", "i" }),
                ["<C-c>"] = cmp.mapping(cmp.mapping.close(), { "c", "i" }),
                ["<C-y>"] = cmp.mapping.confirm({
                    behavior = cmp.ConfirmBehavior.Replace,
                    select = false,
                }),
            },
            snippet = {
                expand = function(args)
                    luasnip.lsp_expand(args.body)
                end,
            },
            sources = {
                {
                    name = "lazydev",
                    group_index = 0, -- set group index to 0 to skip loading LuaLS completions
                },
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
                                bufnr = vim.api.nvim_win_get_buf(win)
                                if not require("peter.core.utils").file_is_big(bufnr) then
                                    table.insert(bufs, bufnr)
                                end
                            end
                            return bufs
                        end,
                    },
                },
                {
                    name = "tmux",
                    option = {
                        all_panes = true,
                        trigger_characters = {},
                    },
                },
                { name = "luasnip" },
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
