#!/bin/bash

ffmpeg -ss 5 -t 10 -i input.mov -vf "fps=12,scale=800:-1" -pix_fmt rgba -f apng -plays 0 output.png
