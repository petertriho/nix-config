local devicons = require("nvim-web-devicons")

return {
    init = function(self)
        -- devicons matches names such as `Makefile` only on the basename. With no extension
        -- argument it also tries compound extensions such as `test.ts`. A pattern, because
        -- `vim.fs.basename()` calls `fnamemodify()` on every render.
        local basename = self.filename:match("[^/]*$")
        self.icon, self.icon_color = devicons.get_icon_color(basename, nil, { default = true })
    end,
    provider = function(self)
        return self.icon and (self.icon .. " ")
    end,
    hl = function(self)
        return { fg = self.icon_color }
    end,
}
