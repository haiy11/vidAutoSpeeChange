// content.js

// 全局变量
let lastFrameData = null;
let videoSpeedHistory = []; // 存储变化幅度历史，用于灵敏度处理
let currentSettings = null; // 当前设置
let cachedSettings = null;

// 加载当前设置
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(['scheme', 'schemes', 'sensitivity']);
    currentSettings = {
      scheme: result.scheme || 1,
      schemes: result.schemes || {
        1: [
          { min: 0, max: 5, speed: 2.0 },
          { min: 5, max: 8, speed: 1.9 },
          { min: 8, max: 11, speed: 1.8 },
          { min: 11, max: 13, speed: 1.7 },
          { min: 13, max: 14, speed: 1.6 },
          { min: 14, max: 15, speed: 1.5 },
          { min: 15, max: 16, speed: 1.4 },
          { min: 16, max: 17, speed: 1.3 },
          { min: 17, max: 19, speed: 1.2 },
          { min: 19, max: 22, speed: 1.1 },
          { min: 22, max: 25, speed: 1.0 },
          { min: 25, max: 30, speed: 0.9 },
          { min: 30, max: 35, speed: 0.8 },
          { min: 35, max: 40, speed: 0.7 },
          { min: 40, max: 45, speed: 0.6 },
          { min: 45, max: 50, speed: 0.5 },
          { min: 50, max: 60, speed: 0.4 },
          { min: 60, max: 70, speed: 0.3 },
          { min: 70, max: 80, speed: 0.2 },
          { min: 80, max: 100, speed: 0.1 }
        ],
        2: [
          { min: 0, max: 15, speed: 2.0 },
          { min: 15, max: 30, speed: 1.0 },
          { min: 30, max: 60, speed: 0.7 },
          { min: 60, max: 100, speed: 0.5 }
        ],
        3: [
          { min: 0, max: 25, speed: 2.0 },
          { min: 25, max: 100, speed: 1.0 }
        ]
      },
      sensitivity: result.sensitivity || 3
    };
  } catch (error) {
    console.error('加载设置失败:', error);
    // 使用默认设置
    currentSettings = {
      scheme: 1,
      schemes: {
        1: [
          { min: 0, max: 5, speed: 2.0 },
          { min: 5, max: 8, speed: 1.9 },
          { min: 8, max: 11, speed: 1.8 },
          { min: 11, max: 13, speed: 1.7 },
          { min: 13, max: 14, speed: 1.6 },
          { min: 14, max: 15, speed: 1.5 },
          { min: 15, max: 16, speed: 1.4 },
          { min: 16, max: 17, speed: 1.3 },
          { min: 17, max: 19, speed: 1.2 },
          { min: 19, max: 22, speed: 1.1 },
          { min: 22, max: 25, speed: 1.0 },
          { min: 25, max: 30, speed: 0.9 },
          { min: 30, max: 35, speed: 0.8 },
          { min: 35, max: 40, speed: 0.7 },
          { min: 40, max: 45, speed: 0.6 },
          { min: 45, max: 50, speed: 0.5 },
          { min: 50, max: 60, speed: 0.4 },
          { min: 60, max: 70, speed: 0.3 },
          { min: 70, max: 80, speed: 0.2 },
          { min: 80, max: 100, speed: 0.1 }
        ],
        2: [
          { min: 0, max: 15, speed: 2.0 },
          { min: 15, max: 30, speed: 1.0 },
          { min: 30, max: 60, speed: 0.7 },
          { min: 60, max: 100, speed: 0.5 }
        ],
        3: [
          { min: 0, max: 25, speed: 2.0 },
          { min: 25, max: 100, speed: 1.0 }
        ]
      },
      sensitivity: 3
    };
  }
}

// 根据灵敏度处理变化幅度
function processChangeWithSensitivity(change) {
  // 添加新的变化幅度到历史
  videoSpeedHistory.push(change);
  
  // 保持历史记录在灵敏度值的两倍以内，以防内存泄漏
  if (videoSpeedHistory.length > currentSettings.sensitivity * 2) {
    videoSpeedHistory = videoSpeedHistory.slice(-currentSettings.sensitivity);
  }
  
  // 如果历史记录少于灵敏度设置，使用当前有的数量
  const sensitivity = Math.min(currentSettings.sensitivity, videoSpeedHistory.length);
  
  if (sensitivity > 0) {
    // 计算需要去掉的极值数量
    const out = Math.floor(sensitivity / 3);
    
    // 确定需要处理的历史数据长度
    const historyLength = Math.min(videoSpeedHistory.length, sensitivity);
    
    // 获取需要处理的历史数据
    const start = Math.max(0, videoSpeedHistory.length - historyLength);
    const values = videoSpeedHistory.slice(start);
    
    // 如果数据量不足以去掉极值，直接返回平均值
    if (values.length <= out * 2) {
      return values.reduce((a, b) => a + b, 0) / values.length;
    }
    
    // 排序并去掉极值
    const sortedValues = [...values].sort((a, b) => a - b);
    const trimmedValues = sortedValues.slice(out, sortedValues.length - out);
    
    // 计算剩余值的平均值
    return trimmedValues.reduce((a, b) => a + b, 0) / trimmedValues.length;
  } else {
    // 如果没有敏感度，直接返回平均值
    console.log("⚠️ 灵敏度设置无效，无法处理变化幅度。请检查设置。");
    return 0;
  }

}

// 根据变化幅度和当前方案调整视频播放速度
function adjustVideoSpeed(change) {
  if (!currentSettings) return;
  
  // 处理变化幅度范围为0-100
  const processedChange = processChangeWithSensitivity(change);
  const changePercent = processedChange;
  
  // 获取当前方案的设置
  const scheme = currentSettings.schemes[currentSettings.scheme];
  
  // 查找对应的播放速度
  for (const range of scheme) {
    if (changePercent >= range.min && changePercent <= range.max) {
      // 找到匹配的范围，调整播放速度
      const videos = document.querySelectorAll('video');
      videos.forEach(video => {
        // 确保视频已加载
        if (video.readyState >= 1) {
          video.playbackRate = range.speed;
          // 向popup发送当前播放速度
          chrome.runtime.sendMessage({
            action: 'updateCurrentSpeed',
            currentSpeed: range.speed
          }).catch(() => {
            // 忽略错误，因为popup可能未打开
          });
        }
      });
      break; // 找到匹配项后退出循环
    }
  }
}

// 监听来自扩展的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // 监听background发送的速度更新消息
  if (request.action === 'updateSpeed') {
    const change = request.change;
    adjustVideoSpeed(change);
    // 不需要 sendResponse，或者可以简单返回
    return false;
  }
  
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
        // console.log("直接捕获视频帧失败:", error);
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
    
    // 方法1：使用异步函数处理（推荐）
    (async () => {
      try {
        // 获取最大分辨率配置（默认480）
        let maxResolution = 480; // 默认值
        
        // 尝试从storage获取配置
        const config = await chrome.storage.sync.get(['maxResolution']);
        console.log('获取的存储配置:', config); // 调试用
        
        if (config.maxResolution && config.maxResolution >= 200) {
          maxResolution = config.maxResolution;
        }
        
        console.log(`🔧 使用最大分辨率配置: ${maxResolution}px`);
        
        // 尝试捕获每个视频
        for (let i = 0; i < videos.length; i++) {
          const video = videos[i];
          
          // 检查视频是否适合捕获
          if (video.readyState < 2) {
            continue;
          }
          
          if (video.videoWidth === 0 || video.videoHeight === 0) {
            continue;
          }
          
          try {
            // 1：计算缩放后的尺寸
            let targetWidth = video.videoWidth;
            let targetHeight = video.videoHeight;
            
            // 循环除以2直到两个边长都≤maxResolution
            while (targetWidth > maxResolution || targetHeight > maxResolution) {
              targetWidth = Math.floor(targetWidth / 2);
              targetHeight = Math.floor(targetHeight / 2);
            }
            
            // 确保最小尺寸不低于80×80
            targetWidth = Math.max(targetWidth, 80);
            targetHeight = Math.max(targetHeight, 80);
            
            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');
            
            // 2：绘制时使用目标尺寸
            ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
            
            // 3：使用JPEG格式代替PNG
            const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
            
            sendResponse({
              success: true,
              method: "direct",
              videoIndex: i,
              imageDataUrl: imageDataUrl,
              width: canvas.width,
              height: canvas.height,
              originalWidth: video.videoWidth,
              originalHeight: video.videoHeight,
              maxResolution: maxResolution // 返回使用的分辨率配置
            });
            return; // 成功捕获，提前返回
          } catch (e) {
            // 继续尝试下一个视频
            continue;
          }
        }
        
        // 所有视频都尝试失败
        sendResponse({success: false, reason: "all_capture_failed"});
      } catch (error) {
        console.error('智能捕获处理失败:', error);
        sendResponse({success: false, reason: "internal_error", error: error.message});
      }
    })();
    
    return true; // 保持消息通道开放，等待异步响应
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
  
  
  // 监听设置更新
  if (request.action === 'updateSettings') {
    currentSettings = request.settings;
    sendResponse({ success: true });
    return true;
  }
});

// 监听设置变化
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && (changes.scheme || changes.schemes || changes.sensitivity )) {
    loadSettings();
  }
});

// 初始化设置
loadSettings();