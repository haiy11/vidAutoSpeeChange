cmake_minimum_required(VERSION 4.1)
project(vidAutoSpeeChange)

set(CMAKE_EXE_LINKER_FLAGS "-static")

set(CMAKE_CXX_STANDARD 17)

add_executable(vidAutoSpeeChange main.cpp
        json.hpp
        stb_image.h)
