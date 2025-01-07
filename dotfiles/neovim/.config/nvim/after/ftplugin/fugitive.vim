" Jump to next file, hunk or revision when status screen is opened
exe "normal )"

nnoremap <buffer> <TAB> <Plug>fugitive:=

nnoremap <buffer> p <CMD>Git pull<CR>
nnoremap <buffer> P <CMD>Git push<CR>
