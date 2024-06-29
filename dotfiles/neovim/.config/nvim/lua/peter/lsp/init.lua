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

    local function buf_set_option(...)
        vim.api.nvim_buf_set_option(bufnr, ...)
    end

    buf_set_option("omnifunc", "v:lua.vim.lsp.omnifunc")

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
    buf_set_keymap("n", "[d", "<CMD>lua vim.diagnostic.goto_prev()<CR>", { desc = "diagnostic-next" })
    buf_set_keymap("n", "]d", "<CMD>lua vim.diagnostic.goto_next()<CR>", { desc = "diagnostic-prev" })
    buf_set_keymap("n", "<leader>lq", "<CMD>lua vim.diagnostic.setqflist()<CR>", { desc = "qflist-diagnostics" })

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

        buf_set_keymap("n", "<leader>k", "<CMD>lua vim.lsp.buf.code_action()<CR>", { desc = "code-actions" })
        buf_set_keymap("v", "<leader>k", "<CMD>lua vim.lsp.buf.range_code_action()<CR>", { desc = "code-actions" })
    end

    if client.server_capabilities.definitionProvider then
        buf_set_keymap("n", "gd", "<CMD>lua vim.lsp.buf.definition()<CR>", { desc = "Go to definition" })
    end

    if client.server_capabilities.declarationProvider then
        buf_set_keymap("n", "gl", "<CMD>lua vim.lsp.buf.declaration()<CR>", { desc = "Go to declaration" })
    end

    if client.server_capabilities.documentSymbolProvider then
        require("nvim-navic").attach(client, bufnr)
    end

    if client.server_capabilities.hoverProvider then
        buf_set_keymap("n", "K", "<CMD>lua vim.lsp.buf.hover()<CR>", { desc = "hover" })
    end

    if client.server_capabilities.implementationProvider then
        buf_set_keymap("n", "gm", "<CMD>lua vim.lsp.buf.implementation()<CR>", { desc = "Go to implementation" })
    end

    if client.server_capabilities.renameProvider then
        buf_set_keymap("n", "<leader>ar", "<CMD>lua vim.lsp.buf.rename()<CR>", { desc = "rename" })
    end

    if client.server_capabilities.referencesProvider then
        buf_set_keymap("n", "gr", "<CMD>lua vim.lsp.buf.references()<CR>", { desc = "references" })
    end

    if client.server_capabilities.signatureHelpProvider then
        buf_set_keymap("n", "gs", "<CMD>lua vim.lsp.buf.signature_help()<CR>", { desc = "signature" })
    end

    if client.server_capabilities.typeDefinitionProvider then
        buf_set_keymap("n", "gy", "<CMD>lua vim.lsp.buf.type_definition()<CR>", { desc = "type-definition" })
    end
end

local function make_base_config()
    local capabilities = vim.lsp.protocol.make_client_capabilities()
    local completionItem = capabilities.textDocument.completion.completionItem
    completionItem.snippetSupport = true
    completionItem.preselectSupport = true
    completionItem.insertReplaceSupport = true
    completionItem.labelDetailsSupport = true
    completionItem.deprecatedSupport = true
    completionItem.commitCharactersSupport = true
    completionItem.tagSupport = { valueSet = { 1 } }
    completionItem.resolveSupport = {
        properties = {
            "documentation",
            "detail",
            "additionalTextEdits",
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
