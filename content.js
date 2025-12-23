// content.js
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
});