return {
    flexible = true,
    init = function(self)
        self.filename = vim.api.nvim_buf_get_name(0)
    end,
    {
        provider = function(self)
            local filename = vim.fn.fnamemodify(self.filename, ":~:.")
            if filename == "" then
                return "[No Name]"
            end
            return filename
        end,
    },
    {
        provider = function(self)
            local filename = vim.fn.fnamemodify(self.filename, ":t")
            if filename == "" then
                return "[No Name]"
            end
            return filename
        end,
    },
}
