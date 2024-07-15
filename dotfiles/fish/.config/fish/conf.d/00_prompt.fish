if type --query starship
    # function starship_transient_prompt_func
    #     starship module character
    # end
    # function starship_transient_rprompt_func
    #     printf 'in %s %s' (starship module directory) (starship module time)
    # end
    starship init fish | source
    # enable_transience
end
