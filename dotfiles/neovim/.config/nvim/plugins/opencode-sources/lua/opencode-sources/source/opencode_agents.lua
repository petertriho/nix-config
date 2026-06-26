local catalog = require("opencode-sources.catalog")
local kinds = require("blink.cmp.types").CompletionItemKind

local EMPTY = {
    items = {},
    is_incomplete_backward = false,
    is_incomplete_forward = false,
}

local Source = {}
Source.__index = Source

function Source.new(opts)
    opts = opts or {}

    return setmetatable({
        root = opts.root or vim.fn.expand("~/.config/opencode/agents"),
        cache_ttl_ms = opts.cache_ttl_ms,
        doc_max_bytes = opts.doc_max_bytes,
    }, Source)
end

function Source.enabled()
    return vim.bo.filetype == "markdown" or vim.bo.filetype == "text"
end

function Source.get_trigger_characters()
    return { "@" }
end

function Source:get_completions(ctx, callback)
    local match = catalog.match_trigger(ctx.line, ctx.cursor[2], "@")
    if not match then
        callback(EMPTY)
        return
    end

    return catalog.get_completions({
        root = self.root,
        strategy = "file",
        ctx = ctx,
        match = match,
        kind = kinds.Text,
        cache_ttl_ms = self.cache_ttl_ms,
    }, callback)
end

function Source:resolve(item, callback)
    return catalog.resolve(item, self.root, "file", callback, {
        doc_max_bytes = self.doc_max_bytes,
    })
end

return Source
