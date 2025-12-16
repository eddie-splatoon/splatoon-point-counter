#!/bin/bash

#ffmpeg -ss 5 -t 10 -i input.mov -vf "fps=12,scale=800:-1" -pix_fmt rgba -f apng -plays 0 demo.png
#ffmpeg -ss 0 -t 10 -i input.mov -vf "setpts=0.5*PTS,fps=12,scale=800:-1" -pix_fmt rgba -f apng -plays 0 demo.png

ffmpeg -i input.mov \
-vf "setpts=0.33*PTS,fps=12,scale=800:-1" \
-pix_fmt rgba \
-f apng \
-plays 0 \
demo.png
