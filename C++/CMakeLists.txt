cmake_minimum_required(VERSION 3.10)
project(vidAutoSpeeChange)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

if(MSVC)
    add_compile_options(/EHsc /utf-8)
endif()

# OpenCV 路径
set(OpenCV_ROOT "E:/items/repositorys/OpenCV/opencv")
set(OpenCV_INCLUDE_DIR "${OpenCV_ROOT}/build/include")
set(OpenCV_LIB_DIR "${OpenCV_ROOT}/build/x64/vc16/lib")
set(OpenCV_BIN_DIR "${OpenCV_ROOT}/build/x64/vc16/bin")

# 根据构建类型选择库
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    set(OpenCV_LIBS ${OpenCV_LIB_DIR}/opencv_world4100d.lib)
    set(OpenCV_DLL_PATTERN "opencv_world4100d.dll")
else()
    set(OpenCV_LIBS ${OpenCV_LIB_DIR}/opencv_world4100.lib)
    set(OpenCV_DLL_PATTERN "opencv_world4100.dll")
endif()

include_directories(${OpenCV_INCLUDE_DIR})

# 主程序
add_executable(vidAutoSpeeChange main.cpp)
target_link_libraries(vidAutoSpeeChange ${OpenCV_LIBS})
target_include_directories(vidAutoSpeeChange PRIVATE ${OpenCV_INCLUDE_DIR})

# 测试程序（如果存在 test.cpp）
if(EXISTS ${CMAKE_SOURCE_DIR}/test.cpp)
    add_executable(test test.cpp)
    target_link_libraries(test ${OpenCV_LIBS})
    target_include_directories(test PRIVATE ${OpenCV_INCLUDE_DIR})
endif()

# 自动复制 OpenCV DLL
file(GLOB OPENCV_DLLS "${OpenCV_BIN_DIR}/${OpenCV_DLL_PATTERN}")
set(TARGETS vidAutoSpeeChange)
if(TARGET test)
    list(APPEND TARGETS test)
endif()
foreach(TARGET_NAME ${TARGETS})
    foreach(DLL ${OPENCV_DLLS})
        add_custom_command(
                TARGET ${TARGET_NAME} POST_BUILD
                COMMAND ${CMAKE_COMMAND} -E copy_if_different
                "${DLL}"
                "$<TARGET_FILE_DIR:${TARGET_NAME}>"
        )
    endforeach()
endforeach()