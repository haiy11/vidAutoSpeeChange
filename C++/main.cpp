#include <iostream>
#include <string>
#include <vector>
#include <cstdint>
#include <windows.h>
#include <fcntl.h>
#include <io.h>
#include <cmath>      // for sqrt
#include <algorithm>  // for min/max

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

// ---------- 边缘检测（Sobel）----------
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

// ---------- 直方图计算 ----------
// 将 edge_map（浮点）量化为 0~255 整数，然后分 bin
std::vector<int> compute_histogram(const std::vector<float>& edge_map,
                                   int width, int height,
                                   int block_row, int block_col,
                                   int block_rows, int block_cols,
                                   int bins = 16) {
    // 计算块边界
    int block_h = height / block_rows;
    int block_w = width / block_cols;
    int y_start = block_row * block_h;
    int y_end = (block_row == block_rows - 1) ? height : (block_row + 1) * block_h;
    int x_start = block_col * block_w;
    int x_end = (block_col == block_cols - 1) ? width : (block_col + 1) * block_w;

    std::vector<int> hist(bins, 0);
    float bin_step = 256.0f / bins;  // 边缘强度范围 0~255
    for (int y = y_start; y < y_end; ++y) {
        for (int x = x_start; x < x_end; ++x) {
            int idx = y * width + x;
            int val = static_cast<int>(edge_map[idx]);  // 取整
            int bin = static_cast<int>(val / bin_step);
            if (bin >= bins) bin = bins - 1;
            hist[bin]++;
        }
    }
    return hist;
}

// 计算两个直方图的 L1 距离（绝对差之和）
float hist_l1_distance(const std::vector<int>& h1, const std::vector<int>& h2) {
    float dist = 0.0f;
    for (size_t i = 0; i < h1.size(); ++i) {
        dist += std::abs(h1[i] - h2[i]);
    }
    return dist;
}

// ---------- 边缘直方图+块匹配 变化检测 ----------
float compute_change_histogram_block(const std::vector<float>& edge1,
                                     const std::vector<float>& edge2,
                                     int width, int height,
                                     int block_rows = 16, int block_cols = 16,  // 改为 16x16
                                     int search_range = 1) {
    int bins = 8;  // 减少 bin 数，提高敏感度

    // 预分配直方图数组（略，同原代码）
    std::vector<std::vector<std::vector<int>>> hist1(block_rows,
        std::vector<std::vector<int>>(block_cols, std::vector<int>(bins, 0)));
    std::vector<std::vector<std::vector<int>>> hist2(block_rows,
        std::vector<std::vector<int>>(block_cols, std::vector<int>(bins, 0)));

    for (int r = 0; r < block_rows; ++r) {
        for (int c = 0; c < block_cols; ++c) {
            hist1[r][c] = compute_histogram(edge1, width, height, r, c, block_rows, block_cols, bins);
            hist2[r][c] = compute_histogram(edge2, width, height, r, c, block_rows, block_cols, bins);
        }
    }

    float total_diff = 0.0f;
    for (int r = 0; r < block_rows; ++r) {
        for (int c = 0; c < block_cols; ++c) {
            float best_dist = std::numeric_limits<float>::max();
            for (int dr = -search_range; dr <= search_range; ++dr) {
                for (int dc = -search_range; dc <= search_range; ++dc) {
                    int nr = r + dr;
                    int nc = c + dc;
                    if (nr >= 0 && nr < block_rows && nc >= 0 && nc < block_cols) {
                        float dist = hist_l1_distance(hist1[r][c], hist2[nr][nc]);
                        if (dist < best_dist) best_dist = dist;
                    }
                }
            }
            total_diff += best_dist;
        }
    }

    // 归一化：每块理论最大 L1 距离设为 1.5 * 每块像素数（原为 2倍）
    int pixels_per_block = (width * height) / (block_rows * block_cols);
    float max_possible_per_block = 1.5f * pixels_per_block;   // 调低理论最大值，放大变化值
    float max_total_diff = block_rows * block_cols * max_possible_per_block;
    float change = total_diff / max_total_diff;

    // 灵敏度调整
    if (change > 0.0f) {
        //  调整参数
        constexpr float sensitivity = 10.0f;

        change = (1.0f - 1.0f / (sensitivity * (change + 1.0f / sensitivity))) * ((sensitivity + 1.0f) / sensitivity);

        if (change > 1.0f) change = 1.0f;
    }

    if (change > 1.0f) change = 1.0f;
    if (change < 0.0f) change = 0.0f;
    return change * 100.0f;
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
            // 计算边缘图
            auto edge_curr = detect_edges(img, width, height);
            auto edge_prev = detect_edges(prev_frame, width, height);

            // 使用边缘直方图+块匹配
            change = compute_change_histogram_block(edge_curr, edge_prev, width, height, 8, 8, 1);
        } else {
            // 首帧或尺寸变化
            change = 0.0f;
        }

        // 更新上一帧
        if (prev_frame) {
            stbi_image_free(prev_frame);
        }
        prev_frame = img;
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