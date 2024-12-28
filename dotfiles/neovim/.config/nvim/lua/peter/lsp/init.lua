local M = {}

local LSP_METHODS = {
    ["textDocument/codeAction"] = {
        keymaps = {
            {
                { "n", "x" },
                "gra",
                function()
                    vim.lsp.buf.code_action()
                end,
                { desc = "Code Actions" },
            },
        },
    },
    ["textDocument/declaration"] = {
        keymaps = {
            {
                "n",
                "grd",
                function()
                    vim.lsp.buf.declaration()
                end,
                { desc = "Declaration" },
            },
        },
    },
    ["textDocument/definition"] = {
        keymaps = {
            {
                "n",
                "gd",
                function()
                    vim.lsp.buf.definition()
                end,
                { desc = "Definition" },
            },
        },
    },
    ["textDocument/documentSymbol"] = {
        callback = function(client, bufnr)
            if client.name ~= "eslint" and client.name ~= "emmet_language_server" then
                require("nvim-navic").attach(client, bufnr)
            end
        end,
    },
    ["textDocument/hover"] = {
        keymaps = {
            {
                "n",
                "K",
                function()
                    vim.lsp.buf.hover({ border = "rounded" })
                end,
                { desc = "Hover" },
            },
        },
    },
    ["textDocument/implementation"] = {
        keymaps = {
            {
                "n",
                "gri",
                function()
                    vim.lsp.buf.implementation()
                end,
                { desc = "Implementation" },
            },
        },
    },
    ["textDocument/rename"] = {
        keymaps = {
            {
                "n",
                "grn",
                function()
                    vim.lsp.buf.rename()
                end,
                { desc = "Rename" },
            },
        },
    },
    ["textDocument/references"] = {
        keymaps = {
            {
                "n",
                "grr",
                function()
                    vim.lsp.buf.references()
                end,
                { desc = "References" },
            },
        },
    },
    ["textDocument/signatureHelp"] = {
        keymaps = {
            {
                "",
                "<C-s>",
                function()
                    vim.lsp.buf.signature_help({ border = "rounded" })
                end,
                { desc = "Signature Help" },
            },
        },
    },
    ["textDocument/typeDefinition"] = {
        keymaps = {
            {
                "n",
                "gy",
                function()
                    vim.lsp.buf.type_definition()
                end,
                { desc = "Type Definition" },
            },
        },
    },
}

local function create_buf_keymap(bufnr)
    local function buf_keymap(mode, lhs, rhs, opts)
        opts = opts or {}
        opts.buffer = bufnr
        vim.keymap.set(mode, lhs, rhs, opts)
    end
    return buf_keymap
end

local function lsp_setup_method(client, bufnr, method)
    local config = LSP_METHODS[method]

    if not config then
        return
    end

    if config.keymaps then
        local buf_keymap = create_buf_keymap(bufnr)
        for _, keymap in ipairs(config.keymaps) do
            buf_keymap(unpack(keymap))
        end
    end

    if config.callback then
        config.callback(client, bufnr)
    end
end

local function lsp_attach_callback(args)
    local bufnr = args.buf

    if require("peter.core.utils").file_is_big(bufnr) then
        vim.schedule(function()
            vim.lsp.buf_detach_client(bufnr, args.data.client_id)
        end)
        return
    end

    local client = vim.lsp.get_client_by_id(args.data.client_id)

    if not client then
        return
    end

    local buf_keymap = create_buf_keymap(bufnr)

    buf_keymap(
        "n",
        "gh",
        "<CMD>lua vim.diagnostic.open_float(0, { scope = 'line', source = 'always', border = 'rounded' })<CR>",
        { desc = "Diagnostic" }
    )
    buf_keymap("n", "grq", "<CMD>lua vim.diagnostic.setqflist()<CR>", { desc = "QDiagnostics" })
    buf_keymap("n", "grl", "<CMD>lua vim.diagnostic.setloclist()<CR>", { desc = "LDiagnostics" })

    if client.name == "basedpyright" then
        buf_keymap("n", "gro", "<CMD>PyrightOrganizeImports<CR>", { desc = "Organize Imports" })
    elseif client.name == "htmx" then
        client.server_capabilities.hoverProvider = false
    elseif client.name == "ruff" then
        buf_keymap("n", "gro", "<CMD>RuffOrganizeImports<CR>", { desc = "Organize Imports" })
    elseif client.name == "ts_ls" then
        buf_keymap("n", "gro", "<CMD>TSServerOrganizeImports<CR>", { desc = "Organize Imports" })
    end

    for method, _ in pairs(LSP_METHODS) do
        if client:supports_method(method, { bufnr = bufnr }) then
            lsp_setup_method(client, bufnr, method)
        end
    end
end

local function make_base_config()
    local capabilities = vim.tbl_deep_extend("force", vim.lsp.protocol.make_client_capabilities(), {
        -- https://github.com/Saghen/blink.cmp/blob/main/lua/blink/cmp/sources/lib/init.lua
        textDocument = {
            completion = {
                completionItem = {
                    snippetSupport = true,
                    commitCharactersSupport = false, -- todo:
                    documentationFormat = { "markdown", "plaintext" },
                    deprecatedSupport = true,
                    preselectSupport = false, -- todo:
                    tagSupport = { valueSet = { 1 } }, -- deprecated
                    insertReplaceSupport = true, -- todo:
                    resolveSupport = {
                        properties = {
                            "documentation",
                            "detail",
                            "additionalTextEdits",
                            -- todo: support more properties? should test if it improves latency
                        },
                    },
                    insertTextModeSupport = {
                        -- todo: support adjustIndentation
                        valueSet = { 1 }, -- asIs
                    },
                    labelDetailsSupport = true,
                },
                completionList = {
                    itemDefaults = {
                        "commitCharacters",
                        "editRange",
                        "insertTextFormat",
                        "insertTextMode",
                        "data",
                    },
                },

                contextSupport = true,
                insertTextMode = 1, -- asIs
            },
        },
    }, {
        textDocument = {
            colorProvider = {
                dynamicRegistration = false,
            },
        },
    }, {
        workspace = {
            fileOperations = {
                willRename = true,
                didRename = true,
                willCreate = true,
                didCreate = true,
                willDelete = true,
                didDelete = true,
            },
        },
    })

    return {
        capabilities = capabilities,
        flags = { allow_incremental_sync = true, debounce_text_changes = 300 },
    }
end

M.setup = function()
    vim.diagnostic.config({
        severity_sort = true,
        signs = {
            text = {
                [vim.diagnostic.severity.ERROR] = "󰅚 ",
                [vim.diagnostic.severity.WARN] = "󰀪 ",
                [vim.diagnostic.severity.HINT] = "󰌶 ",
                [vim.diagnostic.severity.INFO] = " ",
            },
        },
    })

    local register_capability_handler = vim.lsp.handlers["client/registerCapability"]
    vim.lsp.handlers["client/registerCapability"] = function(err, result, ctx)
        local client = vim.lsp.get_client_by_id(ctx.client_id)
        if client then
            for _, registration in pairs(result.registrations) do
                local method = registration.method
                if LSP_METHODS[method] then
                    for buffer in pairs(client.attached_buffers) do
                        lsp_setup_method(client, buffer, method)
                    end
                end
            end
        end
        return register_capability_handler(err, result, ctx)
    end

    vim.api.nvim_create_autocmd("LspAttach", {
        callback = lsp_attach_callback,
    })

    local lspconfig = require("lspconfig")
    local overrides = require("peter.lsp.overrides")

    local base_config = make_base_config()

    for server, override in pairs(overrides) do
        local config = vim.tbl_deep_extend("force", base_config, override or {})

        if server == "yamlls" then
            config = require("yaml-companion").setup({ lspconfig = config })
        elseif server == "vtsls" then
            -- NOTE: workaround for https://yarnpkg.com/getting-started/editor-sdks
            local yarn_sdks = vim.fs.find({ ".yarn/sdks" }, { type = "directory" })
            if #yarn_sdks > 0 then
                config.settings.vtsls.typescript = {
                    globalTsdk = "./.yarn/sdks/typescript/lib",
                }
            end
        end

        lspconfig[server].setup(config)
    end

    -- require("typescript-tools").setup({
    --     settings = {
    --         expose_as_code_action = "all",
    --     },
    -- })
end

return M
