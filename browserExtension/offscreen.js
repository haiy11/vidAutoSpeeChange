// offscreen.js
let videoElement = null;
let canvas = null;
let stream = null;

// 初始化offscreen页面元素
function initializeOffscreen() {
  videoElement = document.getElementById('video');
  canvas = document.getElementById('canvas');
  videoElement.style.display = 'block';
  videoElement.muted = true; // 静音以避免音频播放
}

// 处理视频流
async function handleStream(streamId) {
  try {
    // 首先停止之前的流（如果存在）
    if (videoElement.srcObject) {
      const oldStream = videoElement.srcObject;
      if (oldStream && oldStream.getTracks) {
        oldStream.getTracks().forEach(track => track.stop());
      }
    }
    
    // 使用chrome.desktopCapture或tabCapture API获取媒体流
    // 由于直接使用流ID设置srcObject不可行，我们需要通过getUserMedia获取实际流
    const constraints = {
      audio: false, // 不需要音频
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
          maxWidth: 1920,
          maxHeight: 1080
        }
      }
    };

    stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = stream;
    
    // 等待视频元素准备好
    videoElement.onloadedmetadata = () => {
      // console.log('✅ 视频流已加载到offscreen页面');
    };
    
    // 确保视频元素开始播放
    videoElement.play().catch(error => {
      // console.log('⚠️ 视频播放失败:', error);
    });
  } catch (error) {
    console.error('❌ 获取媒体流失败:', error);
    sendResponseToBackground({ success: false, error: error.message });
  }
}

// 捕获视频帧
function captureFrame() {
  if (!videoElement || !videoElement.srcObject) {
    console.error('❌ 视频元素未初始化或没有流');
    return { success: false, error: 'No video stream' };
  }

  try {
    // 确保视频元素已加载且正在播放
    if (videoElement.readyState < videoElement.HAVE_CURRENT_DATA) {
      // console.log('⚠️ 视频尚未准备好，当前状态:', videoElement.readyState);
      return { success: false, error: 'Video not ready', readyState: videoElement.readyState };
    }

    // 设置canvas尺寸
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    
    const ctx = canvas.getContext('2d');
    
    // 绘制当前视频帧到canvas
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    
    // 将图像数据转换为data URL
    const imageDataUrl = canvas.toDataURL('image/png');
    
    return {
      success: true,
      imageDataUrl: imageDataUrl,
      width: canvas.width,
      height: canvas.height
    };
  } catch (error) {
    console.error('❌ 捕获视频帧失败:', error);
    return { success: false, error: error.message };
  }
}

// 向background script发送响应
function sendResponseToBackground(response) {
  chrome.runtime.sendMessage({
    target: 'background',
    source: 'offscreen',
    ...response
  }).catch(error => {
    console.error('发送响应到background失败:', error);
  });
}

// 监听来自background的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') {
    return false;
  }

  switch (message.action) {
    case 'process-stream':
      initializeOffscreen();
      handleStream(message.streamId).then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        console.error('处理流失败:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // 异步操作，保持消息通道开放
      
    case 'capture-frame':
      const result = captureFrame();
      sendResponse(result);
      break;
      
    default:
      console.warn('未知的offscreen消息:', message.action);
      sendResponse({ success: false, error: 'Unknown action' });
  }
  
  return true; // 保持消息通道开放
});

// 初始化
initializeOffscreen();