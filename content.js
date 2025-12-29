// content.js

// 全局变量
let lastFrameData = null;

// 监听来自扩展的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getVideoInfo") {
    // 查找页面中的所有视频元素
    const videos = document.querySelectorAll('video');
    const videoInfo = [];
    
    videos.forEach((video, index) => {
      videoInfo.push({
        index: index,
        src: video.src,
        currentSrc: video.currentSrc,
        width: video.videoWidth,
        height: video.videoHeight,
        displayWidth: video.offsetWidth,
        displayHeight: video.offsetHeight,
        duration: video.duration,
        currentTime: video.currentTime,
        paused: video.paused,
        playbackRate: video.playbackRate,
        readyState: video.readyState,
        networkState: video.networkState,
        // 添加更多诊断信息
        seeking: video.seeking,
        ended: video.ended,
        muted: video.muted,
        volume: video.volume
      });
    });
    
    sendResponse({videos: videoInfo});
    return true;
  }
  
  if (request.action === "captureVideoFrame") {
    const videoIndex = request.videoIndex || 0;
    const videos = document.querySelectorAll('video');
    
    if (videoIndex >= 0 && videoIndex < videos.length) {
      const video = videos[videoIndex];
      
      // 检查视频是否准备好
      if (video.readyState < 2) { // HAVE_CURRENT_DATA
        sendResponse({success: false, error: "Video not ready", reason: "not_ready", readyState: video.readyState});
        return true;
      }
      
      // 检查视频是否有有效尺寸
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        sendResponse({success: false, error: "Invalid video dimensions", reason: "invalid_dimensions", 
                     width: video.videoWidth, height: video.videoHeight});
        return true;
      }
      
      try {
        // 创建 canvas 来捕获视频帧
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        
        // 绘制当前视频帧到 canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // 将图像数据转换为 data URL
        const imageDataUrl = canvas.toDataURL('image/png');
        
        sendResponse({
          success: true, 
          method: "direct",
          imageDataUrl: imageDataUrl,
          width: canvas.width,
          height: canvas.height
        });
      } catch (error) {
        console.log("直接捕获视频帧失败:", error);
        sendResponse({success: false, error: error.message, reason: "draw_failed"});
      }
    } else {
      sendResponse({success: false, error: "Invalid video index", reason: "invalid_index"});
    }
    
    return true;
  }
  
  if (request.action === "smartCapture") {
    const videos = document.querySelectorAll('video');
    
    if (videos.length === 0) {
      sendResponse({success: false, reason: "no_videos"});
      return true;
    }
    
    console.log(`🔍 尝试智能捕获，共找到 ${videos.length} 个视频元素`);
    
    // 尝试捕获每个视频
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      
      console.log(`🔍 检查视频 ${i}:`, {
        readyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        src: video.src,
        currentSrc: video.currentSrc
      });
      
      // 检查视频是否适合捕获
      if (video.readyState < 2) {
        console.log(`⏭️ 视频 ${i} 尚未准备好 (readyState: ${video.readyState})`);
        continue;
      }
      
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        console.log(`⏭️ 视频 ${i} 尺寸无效 (${video.videoWidth}x${video.videoHeight})`);
        continue;
      }
      
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        
        // 尝试绘制
        ctx.drawImage(video, 0, 0);
        
        // 成功，返回结果
        const imageDataUrl = canvas.toDataURL('image/png');
        console.log(`✅ 成功捕获视频 ${i} 的画面`);
        
        sendResponse({
          success: true,
          method: "direct",
          videoIndex: i,
          imageDataUrl: imageDataUrl,
          width: canvas.width,
          height: canvas.height
        });
        return true;
      } catch (e) {
        console.log(`⚠️ 尝试捕获视频 ${i} 失败:`, e.message);
        // 继续尝试下一个视频
        continue;
      }
    }
    
    // 如果所有视频都无法直接捕获
    console.log("❌ 所有视频都无法直接捕获");
    sendResponse({
      success: false,
      method: "direct_failed",
      reason: "all_direct_attempts_failed",
      videoCount: videos.length
    });
    
    return true;
  }
  
  // 新增：等待视频准备好的功能
  if (request.action === "waitForVideoReady") {
    const videoIndex = request.videoIndex || 0;
    const timeout = request.timeout || 5000; // 默认5秒超时
    const videos = document.querySelectorAll('video');
    
    if (videoIndex >= 0 && videoIndex < videos.length) {
      const video = videos[videoIndex];
      
      // 如果已经准备好
      if (video.readyState >= 2) {
        sendResponse({ready: true, readyState: video.readyState});
        return true;
      }
      
      // 等待视频准备好
      const startTime = Date.now();
      
      function checkReady() {
        if (video.readyState >= 2) {
          sendResponse({ready: true, readyState: video.readyState});
          return;
        }
        
        if (Date.now() - startTime > timeout) {
          sendResponse({ready: false, reason: "timeout", readyState: video.readyState});
          return;
        }
        
        setTimeout(checkReady, 100);
      }
      
      checkReady();
    } else {
      sendResponse({ready: false, reason: "invalid_index"});
    }
    
    return true;
  }
// 添加计算帧变化幅度的辅助函数
  if (request.action === "calculateFrameChange") {
    const currentFrame = request.currentFrame;
    const lastFrame = lastFrameData;
    
    if (!lastFrame) {
      lastFrameData = currentFrame;
      sendResponse({ changeAmount: 0 });
      return true;
    }
    
    // 创建一个函数来处理图像比较
    const compareImages = (lastFrame, currentFrame) => {
      return new Promise((resolve) => {
        // 创建临时canvas用于图像处理
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // 创建图像对象
        const img1 = new Image();
        const img2 = new Image();
        
        let loadedCount = 0;
        
        const checkAndProcess = () => {
          loadedCount++;
          if (loadedCount === 2) {
            // 两张图片都已加载完成
            processImages();
          }
        };
        
        const processImages = () => {
          try {
            // 设置canvas尺寸，使用较小的尺寸以提高性能
            const width = Math.min(img1.width, img2.width, 160);  // 限制最大宽度以提高性能
            const height = Math.min(img1.height, img2.height, 120); // 限制最大高度以提高性能
            
            // 如果任一图片尺寸为0，则返回0
            if (width <= 0 || height <= 0) {
              resolve(0);
              return;
            }
            
            canvas.width = width;
            canvas.height = height;
            
            // 绘制第一张图像
            ctx.drawImage(img1, 0, 0, width, height);
            const imageData1 = ctx.getImageData(0, 0, width, height);
            
            // 绘制第二张图像
            ctx.drawImage(img2, 0, 0, width, height);
            const imageData2 = ctx.getImageData(0, 0, width, height);
            
            // 使用边缘检测来减少平移的影响
            const edgeMap1 = detectEdges(imageData1);
            const edgeMap2 = detectEdges(imageData2);
            
            // 计算边缘图的变化
            const edgeChange = calculateEdgeChange(edgeMap1, edgeMap2, width, height);
            
            // 计算亮度变化作为补充指标
            const brightnessChange = calculateBrightnessChange(imageData1, imageData2);
            
            // 结合边缘变化和亮度变化，边缘变化权重更高
            const combinedChange = (edgeChange * 0.7) + (brightnessChange * 0.3);
            
            resolve(combinedChange);
          } catch (error) {
            console.error('处理图像时出错:', error);
            resolve(0);
          }
        };
        
        // 边缘检测函数（使用Sobel算子）
        const detectEdges = (imageData) => {
          const data = imageData.data;
          const width = imageData.width;
          const height = imageData.height;
          const edgeMap = new Array(width * height).fill(0);
          
          // 转换为灰度图
          const grayData = new Array(width * height);
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const idx = (y * width + x) * 4;
              // 使用加权平均转换为灰度
              grayData[y * width + x] = 
                0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            }
          }
          
          // Sobel算子
          const sobelX = [
            [-1, 0, 1],
            [-2, 0, 2],
            [-1, 0, 1]
          ];
          
          const sobelY = [
            [-1, -2, -1],
            [ 0,  0,  0],
            [ 1,  2,  1]
          ];
          
          // 计算边缘
          for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
              let gx = 0, gy = 0;
              
              // 应用Sobel算子
              for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                  const pixel = grayData[(y + ky) * width + (x + kx)];
                  gx += pixel * sobelX[ky + 1][kx + 1];
                  gy += pixel * sobelY[ky + 1][kx + 1];
                }
              }
              
              // 计算梯度幅值
              const magnitude = Math.sqrt(gx * gx + gy * gy);
              edgeMap[y * width + x] = magnitude;
            }
          }
          
          return edgeMap;
        };
        
        // 计算边缘变化
        const calculateEdgeChange = (edgeMap1, edgeMap2, width, height) => {
          let diffCount = 0;
          let totalDiff = 0;
          const totalPixels = width * height;
          
          for (let i = 0; i < totalPixels; i++) {
            const diff = Math.abs(edgeMap1[i] - edgeMap2[i]);
            totalDiff += diff;
            
            // 如果边缘强度变化超过阈值，则认为该点发生了显著变化
            if (diff > 30) {
              diffCount++;
            }
          }
          
          // 返回变化的百分比，使用边缘变化的平均幅度
          const avgDiff = totalDiff / totalPixels;
          // 将平均差值映射到0-100的范围
          const changePercentage = Math.min(100, (avgDiff / 255) * 100);
          
          return changePercentage;
        };
        
        // 计算亮度变化
        const calculateBrightnessChange = (imageData1, imageData2) => {
          const data1 = imageData1.data;
          const data2 = imageData2.data;
          const totalPixels = data1.length / 4;
          let totalBrightnessDiff = 0;
          
          for (let i = 0; i < data1.length; i += 4) {
            // 计算亮度值（使用加权平均）
            const brightness1 = 0.299 * data1[i] + 0.587 * data1[i + 1] + 0.114 * data1[i + 2];
            const brightness2 = 0.299 * data2[i] + 0.587 * data2[i + 1] + 0.114 * data2[i + 2];
            
            totalBrightnessDiff += Math.abs(brightness1 - brightness2);
          }
          
          // 计算平均亮度变化
          const avgBrightnessDiff = totalBrightnessDiff / totalPixels;
          // 映射到0-100的范围
          const brightnessChangePercentage = (avgBrightnessDiff / 255) * 100;
          
          return brightnessChangePercentage;
        };
        
        // 设置跨域属性以处理可能的跨域图像
        img1.crossOrigin = "anonymous";
        img2.crossOrigin = "anonymous";
        
        // 加载第一张图像
        img1.onload = checkAndProcess;
        img1.onerror = () => resolve(0); // 如果加载失败，返回0
        img1.src = lastFrame;
        
        // 加载第二张图像
        img2.onload = checkAndProcess;
        img2.onerror = () => resolve(0); // 如果加载失败，返回0
        img2.src = currentFrame;
      });
    };
    
    // 异步处理图像比较
    compareImages(lastFrame, currentFrame).then(changeAmount => {
      lastFrameData = currentFrame; // 更新lastFrame
      sendResponse({ changeAmount: changeAmount });
    }).catch(error => {
      console.error('计算帧变化时出错:', error);
      sendResponse({ changeAmount: 0 });
    });
    
    return true; // 保持消息通道开放以进行异步响应
  }
});