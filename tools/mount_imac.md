##  set up so I can access the photos and db on the imac from my laptop
the /Volumes becomes /Users

smb://m3.local/mac24

open 'smb://m3.local/mac24'
[ -e /Users/mac24 ] || [ -L /Users/mac24 ] || sudo ln -s /Volumes/mac24 /Users/mac24


The same thing written out long-hand, if you'd rather have it readable in the file:

> if [ -e /Users/mac24 ] || [ -L /Users/mac24 ]; then
>    echo "link already exists"
> else
>    sudo ln -s /Volumes/mac24 /Users/mac24
> fi


## ssh mac24@m3.local
