local M = {}

local function on_attach(client, bufnr)
    require("peter.lsp.format").on_attach(client, bufnr)

    local function buf_set_keymap(mode, lhs, rhs, opts)
        opts = opts or {}
        opts.buffer = bufnr
        noremap = true
        silent = true
        vim.keymap.set(mode, lhs, rhs, opts)
    end

    if client.name == "basedpyright" then
        buf_set_keymap("n", "<leader>o", "<CMD>PyrightOrganizeImports<CR>", { desc = "organize-imports" })
    elseif client.name == "ruff" then
        buf_set_keymap("n", "<leader>o", "<CMD>RuffOrganizeImports<CR>", { desc = "organize-imports" })
    elseif client.name == "tsserver" then
        buf_set_keymap("n", "<leader>o", "<CMD>TSServerOrganizeImports<CR>", { desc = "organize-imports" })
    end

    buf_set_keymap(
        "n",
        "gh",
        "<CMD>lua vim.diagnostic.open_float(0, { scope = 'line', source = 'always', border = 'rounded' })<CR>",
        { desc = "diagnostic" }
    )
    buf_set_keymap("n", "<leader>tq", "<CMD>lua vim.diagnostic.setqflist()<CR>", { desc = "qflist-diagnostics" })

    if client.server_capabilities.codeActionProvider then
        vim.api.nvim_create_augroup("lsp_code_action", {})
        vim.api.nvim_create_autocmd({ "CursorHold", "CursorHoldI" }, {
            group = "lsp_code_action",
            callback = function()
                require("nvim-lightbulb").update_lightbulb()
            end,
            buffer = bufnr,
            desc = "LSP code action lightbulb",
        })
    end

    if client.server_capabilities.declarationProvider then
        buf_set_keymap("n", "grd", "<CMD>lua vim.lsp.buf.declaration()<CR>", { desc = "Declaration" })
    end

    if client.server_capabilities.documentSymbolProvider then
        require("nvim-navic").attach(client, bufnr)
    end

    if client.server_capabilities.implementationProvider then
        buf_set_keymap("n", "gri", "<CMD>lua vim.lsp.buf.implementation()<CR>", { desc = "Go to implementation" })
    end

    if client.server_capabilities.signatureHelpProvider then
        buf_set_keymap("n", "grs", "<CMD>lua vim.lsp.buf.signature_help()<CR>", { desc = "Signature help" })
    end

    if client.server_capabilities.typeDefinitionProvider then
        buf_set_keymap("n", "gy", "<CMD>lua vim.lsp.buf.type_definition()<CR>", { desc = "type-definition" })
    end
end

local function make_base_config()
    local capabilities = vim.lsp.protocol.make_client_capabilities()

    local completion = capabilities.textDocument.completion

    local completionItem = completion.completionItem
    completionItem.snippetSupport = true
    completionItem.commitCharactersSupport = true
    completionItem.deprecatedSupport = true
    completionItem.preselectSupport = true
    completionItem.tagSupport = {
        valueSet = {
            1, -- Deprecated
        },
    }
    completionItem.insertReplaceSupport = true
    completionItem.resolveSupport = {
        properties = {
            "documentation",
            "detail",
            "additionalTextEdits",
            "sortText",
            "filterText",
            "insertText",
            "textEdit",
            "insertTextFormat",
            "insertTextMode",
        },
    }
    completionItem.insertTextModeSupport = {
        valueSet = {
            1, -- asIs
            2, -- adjustIndentation
        },
    }
    completionItem.labelDetailsSupport = true

    completion.dynamicRegistration = false
    completion.contextSupport = true
    completion.insertTextMode = 1
    completion.completionList = {
        itemDefaults = {
            "commitCharacters",
            "editRange",
            "insertTextFormat",
            "insertTextMode",
            "data",
        },
    }

    capabilities.textDocument.colorProvider = { dynamicRegistration = false }
    return {
        capabilities = capabilities,
        on_attach = on_attach,
        flags = { allow_incremental_sync = true, debounce_text_changes = 300 },
    }
end

M.setup = function()
    vim.diagnostic.config({
        severity_sort = true,
    })

    vim.lsp.handlers["textDocument/hover"] = vim.lsp.with(vim.lsp.handlers.hover, { border = "rounded" })
    vim.lsp.handlers["textDocument/signatureHelp"] =
        vim.lsp.with(vim.lsp.handlers.signature_help, { border = "rounded" })

    vim.api.nvim_create_autocmd("LspAttach", {
        callback = function(args)
            vim.bo[args.buf].formatexpr = nil
        end,
    })

    local lspconfig = require("lspconfig")
    local overrides = require("peter.lsp.config")

    local base_config = make_base_config()

    for server, override in pairs(overrides) do
        local config = vim.tbl_extend("force", base_config, override or {})

        if server == "yamlls" then
            config = require("yaml-companion").setup({ lspconfig = config })
        end

        lspconfig[server].setup(config)
    end

    require("peter.lsp.none-ls").setup(base_config)
end

return M
