// popup.js
let currentStream = null;

document.addEventListener('DOMContentLoaded', () => {
  const statusDiv = document.getElementById('status');
  const videoElement = document.getElementById('capturedVideo');
  const startBtn = document.getElementById('startCapture');
  const stopBtn = document.getElementById('stopCapture');
  
  // 更新状态显示
  function updateStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.className = type;
  }
  
  // 显示捕获的画面
  function displayCapture(data) {
    if (data.method === "direct") {
      // 直接捕获的视频帧显示为图片
      videoElement.poster = data.imageDataUrl;
      videoElement.srcObject = null;
      updateStatus(`✅ 直接捕获成功\n尺寸: ${data.width}x${data.height}\n方法: 直接从视频元素捕获`, 'success');
    } else if (data.method === "tabCapture") {
      // tabCapture 捕获的流显示为视频
      videoElement.srcObject = data.stream;
      videoElement.poster = '';
      updateStatus(`✅ Tab捕获成功\n流ID: ${data.streamId.substring(0, 20)}...\n方法: 捕获整个标签页`, 'success');
    }
  }
  
  // 开始捕获 - 两阶段策略
  startBtn.addEventListener('click', async () => {
    try {
      updateStatus('正在获取当前标签页...', 'info');
      
      // 获取当前活动标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // 第一阶段：尝试直接捕获视频元素
      updateStatus('第一阶段：尝试直接捕获视频元素...', 'info');
      console.log("🔍 第一阶段：尝试直接捕获视频元素...");
      
      try {
        // 先获取页面中的视频信息
        console.log("🔍 查找页面中的视频元素...");
        const videoInfoResponse = await chrome.tabs.sendMessage(tab.id, {action: "getVideoInfo"});
        
        if (videoInfoResponse.videos && videoInfoResponse.videos.length > 0) {
          console.log(`✅ 找到 ${videoInfoResponse.videos.length} 个视频元素:`, videoInfoResponse.videos);
          updateStatus(`找到 ${videoInfoResponse.videos.length} 个视频元素\n尝试直接捕获...`, 'info');
        } else {
          console.log("⚠️ 页面中没有找到视频元素");
          updateStatus("页面中没有找到视频元素\n尝试第二阶段...", 'info');
        }
        
        // 尝试智能捕获
        const smartCaptureResponse = await chrome.tabs.sendMessage(tab.id, {action: "smartCapture"});
        
        if (smartCaptureResponse.success) {
          console.log("✅ 第一阶段成功：直接捕获视频元素");
          console.log(`📊 捕获信息 - 方法: direct, 尺寸: ${smartCaptureResponse.width}x${smartCaptureResponse.height}`);
          displayCapture({
            method: "direct",
            imageDataUrl: smartCaptureResponse.imageDataUrl,
            width: smartCaptureResponse.width,
            height: smartCaptureResponse.height
          });
          return;
        } else {
          console.log("⚠️ 第一阶段失败:", smartCaptureResponse.reason);
          updateStatus(`第一阶段失败: ${smartCaptureResponse.reason}\n尝试第二阶段...`, 'info');
        }
      } catch (error) {
        console.log("⚠️ 第一阶段出现异常:", error.message);
        updateStatus(`第一阶段异常: ${error.message}\n尝试第二阶段...`, 'info');
      }
      
      // 第二阶段：使用 tabCapture 捕获整个标签页
      updateStatus('第二阶段：使用 tabCapture 捕获整个标签页...', 'info');
      console.log("🔄 开始第二阶段：使用 tabCapture");
      
      // 请求获取视频流ID
      console.log("📥 请求获取视频流ID...");
      const streamResponse = await chrome.runtime.sendMessage({action: "get-video-stream-id"});
      
      if (!streamResponse.success) {
        updateStatus('获取视频流ID失败: ' + streamResponse.error, 'error');
        console.error("❌ 第二阶段失败：获取视频流ID失败", streamResponse.error);
        return;
      }
      
      const streamId = streamResponse.streamId;
      console.log("✅ 成功获取视频流ID:", streamId);
      updateStatus(`成功获取视频流ID\nID: ${streamId.substring(0, 20)}...\n正在获取媒体流...`, 'success');
      
      // 使用流ID获取实际的媒体流
      console.log("📥 使用流ID获取实际的媒体流...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId
          }
        },
        audio: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId
          }
        }
      });
      
      currentStream = stream;
      
      console.log("✅ 第二阶段成功：获取媒体流成功");
      displayCapture({
        method: "tabCapture",
        stream: stream,
        streamId: streamId
      });
      
    } catch (error) {
      console.error('捕获视频时出错:', error);
      updateStatus(`错误: ${error.message}`, 'error');
      
      // 清理可能的部分初始化
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
      }
      videoElement.srcObject = null;
    }
  });
  
  // 停止捕获
  stopBtn.addEventListener('click', () => {
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
      currentStream = null;
    }
    videoElement.srcObject = null;
    videoElement.poster = '';
    updateStatus('已停止捕获', 'info');
    console.log("⏹️ 已停止捕获");
  });
  
  // 初始化状态
  updateStatus('准备就绪\n点击"开始捕获"按钮\n将先尝试直接捕获视频元素，失败后使用 tabCapture 兜底', 'info');
});