#include <opencv2/opencv.hpp>
#include <iostream>

int main() {
    cv::Mat img = cv::Mat::zeros(200, 200, CV_8UC3);
    cv::circle(img, cv::Point(100, 100), 50, cv::Scalar(0, 0, 255), -1);
    cv::imshow("Test", img);
    cv::waitKey(0);
    return 0;
}