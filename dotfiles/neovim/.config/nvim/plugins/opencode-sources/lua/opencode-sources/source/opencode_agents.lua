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
    return setmetatable({
        root = (opts and opts.root) or vim.fn.expand("~/.config/opencode/agents"),
    }, Source)
end

function Source:enabled()
    return vim.bo.filetype == "markdown"
end

function Source:get_trigger_characters()
    return { "@" }
end

function Source:get_completions(ctx, callback)
    local match = catalog.match_trigger(ctx.line, ctx.cursor[2], "@")
    if not match then
        callback(EMPTY)
        return
    end

    callback({
        items = catalog.make_items(catalog.list_file_basenames(self.root), ctx, match, kinds.Text),
        is_incomplete_backward = false,
        is_incomplete_forward = false,
    })
end

function Source:resolve(item, callback)
    catalog.resolve(item, self.root, "file", callback)
end

return Source
