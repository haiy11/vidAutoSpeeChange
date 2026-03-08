#include <iostream>
#include <string>
#include <vector>
#include <cstdint>
#include <windows.h>
#include <fcntl.h>
#include <io.h>
#include <cmath>      // for sqrt
#include <algorithm>  // for min/max (可选)

// 第三方库
#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"
#include "json.hpp"

using json = nlohmann::json;

// ---------- base64 解码函数 ----------
static const std::string base64_chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

std::vector<unsigned char> base64_decode(const std::string& encoded_string) {
    int in_len = encoded_string.size();
    int i = 0, j = 0, in_ = 0;
    unsigned char char_array_4[4], char_array_3[3];
    std::vector<unsigned char> ret;

    while (in_len-- && (encoded_string[in_] != '=') &&
           (isalnum(encoded_string[in_]) || (encoded_string[in_] == '+') || (encoded_string[in_] == '/'))) {
        char_array_4[i++] = encoded_string[in_]; in_++;
        if (i == 4) {
            for (i = 0; i < 4; i++)
                char_array_4[i] = base64_chars.find(char_array_4[i]);
            char_array_3[0] = (char_array_4[0] << 2) + ((char_array_4[1] & 0x30) >> 4);
            char_array_3[1] = ((char_array_4[1] & 0xf) << 4) + ((char_array_4[2] & 0x3c) >> 2);
            char_array_3[2] = ((char_array_4[2] & 0x3) << 6) + char_array_4[3];
            for (i = 0; i < 3; i++)
                ret.push_back(char_array_3[i]);
            i = 0;
        }
    }
    if (i) {
        for (j = i; j < 4; j++)
            char_array_4[j] = 0;
        for (j = 0; j < 4; j++)
            char_array_4[j] = base64_chars.find(char_array_4[j]);
        char_array_3[0] = (char_array_4[0] << 2) + ((char_array_4[1] & 0x30) >> 4);
        char_array_3[1] = ((char_array_4[1] & 0xf) << 4) + ((char_array_4[2] & 0x3c) >> 2);
        char_array_3[2] = ((char_array_4[2] & 0x3) << 6) + char_array_4[3];
        for (j = 0; j < i - 1; j++) ret.push_back(char_array_3[j]);
    }
    return ret;
}

// ---------- 图像处理函数 ----------

// 计算灰度图像的 Sobel 边缘强度图
std::vector<float> detect_edges(const unsigned char* gray, int width, int height) {
    std::vector<float> edge_map(width * height, 0.0f);
    for (int y = 1; y < height - 1; ++y) {
        for (int x = 1; x < width - 1; ++x) {
            int idx = y * width + x;
            // Sobel X
            int gx = -gray[idx - width - 1] + gray[idx - width + 1]
                     -2 * gray[idx - 1] + 2 * gray[idx + 1]
                     -gray[idx + width - 1] + gray[idx + width + 1];
            // Sobel Y
            int gy = -gray[idx - width - 1] -2 * gray[idx - width] - gray[idx - width + 1]
                     + gray[idx + width - 1] +2 * gray[idx + width] + gray[idx + width + 1];
            float mag = std::sqrt(static_cast<float>(gx * gx + gy * gy));
            edge_map[idx] = mag;
        }
    }
    return edge_map;
}

// 计算两个边缘图的差异（变化百分比，0-100）
float calculate_edge_change(const std::vector<float>& edge1, const std::vector<float>& edge2,
                            int width, int height) {
    float total_diff = 0.0f;
    int total_pixels = width * height;
    for (int i = 0; i < total_pixels; ++i) {
        float diff = std::abs(edge1[i] - edge2[i]);
        total_diff += diff;
    }
    float avg_diff = total_diff / total_pixels;
    // 假设边缘强度范围 0-255（实际上可能更大，这里简单映射）
    float change = (avg_diff / 255.0f) * 100.0f;
    if (change > 100.0f) change = 100.0f;
    return change;
}

// 计算两个灰度图像的亮度变化百分比
float calculate_brightness_change(const unsigned char* gray1, const unsigned char* gray2,
                                  int width, int height) {
    int total_pixels = width * height;
    float total_diff = 0.0f;
    for (int i = 0; i < total_pixels; ++i) {
        total_diff += std::abs(static_cast<int>(gray1[i]) - static_cast<int>(gray2[i]));
    }
    float avg_diff = total_diff / total_pixels;
    float change = (avg_diff / 255.0f) * 100.0f;
    if (change > 100.0f) change = 100.0f;
    return change;
}

// ---------- 消息收发函数 ----------
std::string read_message() {
    uint32_t length = 0;
    std::cin.read(reinterpret_cast<char*>(&length), 4);
    if (std::cin.gcount() == 0) return "";
    std::vector<char> buffer(length);
    std::cin.read(buffer.data(), length);
    return std::string(buffer.data(), length);
}

void send_message(const std::string& message) {
    uint32_t length = static_cast<uint32_t>(message.size());
    std::cout.write(reinterpret_cast<char*>(&length), 4);
    std::cout.write(message.data(), length);
    std::cout.flush();
}

// ---------- 主函数 ----------
int main() {
#ifdef _WIN32
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
#endif

    // 缓存上一帧
    unsigned char* prev_frame = nullptr;
    int prev_width = 0, prev_height = 0;

    while (true) {
        std::string input = read_message();
        if (input.empty()) break;

        // 解析 JSON
        json j;
        try {
            j = json::parse(input);
        } catch (const std::exception& e) {
            std::cerr << "JSON 解析失败: " << e.what() << std::endl;
            send_message("{\"change\":0}");
            continue;
        }

        // 获取 base64 字符串
        if (!j.contains("frame")) {
            std::cerr << "缺少 frame 字段" << std::endl;
            send_message("{\"change\":0}");
            continue;
        }
        std::string base64_data = j["frame"];

        // 去除 DataURL 前缀（如果有）
        size_t pos = base64_data.find("base64,");
        if (pos != std::string::npos) {
            base64_data = base64_data.substr(pos + 7); // 跳过 "base64,"
        }

        // base64 解码
        std::vector<unsigned char> jpeg_data = base64_decode(base64_data);
        if (jpeg_data.empty()) {
            std::cerr << "base64 解码失败或结果为空" << std::endl;
            send_message("{\"change\":0}");
            continue;
        }

        // 使用 stb_image 解码 JPEG 为灰度图像
        int width, height, channels;
        unsigned char* img = stbi_load_from_memory(jpeg_data.data(), jpeg_data.size(),
                                                    &width, &height, &channels, 1); // 1 = 强制灰度
        if (!img) {
            std::cerr << "JPEG 解码失败" << std::endl;
            send_message("{\"change\":0}");
            continue;
        }

        float change = 0.0f;
        if (prev_frame && prev_width == width && prev_height == height) {
            // 有上一帧且尺寸相同，进行对比
            auto edge_curr = detect_edges(img, width, height);
            auto edge_prev = detect_edges(prev_frame, width, height);
            float edge_change = calculate_edge_change(edge_curr, edge_prev, width, height);
            float brightness_change = calculate_brightness_change(img, prev_frame, width, height);
            // 结合边缘和亮度，权重与JS一致
            change = edge_change * 0.7f + brightness_change * 0.3f;
            // 确保在 0-100 范围内
            if (change < 0) change = 0;
            if (change > 100) change = 100;
        } else {
            // 第一次或尺寸变化，返回0（无变化）
            change = 0.0f;
        }

        // 释放上一帧并更新为当前帧
        if (prev_frame) {
            stbi_image_free(prev_frame);
        }
        prev_frame = img;        // 现在由我们管理内存
        prev_width = width;
        prev_height = height;

        // 构造返回 JSON
        json reply;
        reply["change"] = change;
        send_message(reply.dump());

        // 输出调试信息（可选）
        std::cerr << "变化值: " << change << std::endl;
    }

    // 清理最后一帧
    if (prev_frame) {
        stbi_image_free(prev_frame);
    }
    return 0;
}