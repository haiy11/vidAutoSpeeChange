// popup.js
let currentStream = null;
let captureInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  const statusDiv = document.getElementById('status');
  const videoElement = document.getElementById('capturedVideo');
  const startBtn = document.getElementById('startCapture');
  const stopBtn = document.getElementById('stopCapture');
  const intervalInput = document.getElementById('intervalInput');

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

  // 定时捕获视频帧的函数
  async function captureAndDisplayFrame(tab) {
    try {
      // 尝试智能捕获
      const smartCaptureResponse = await chrome.tabs.sendMessage(tab.id, {action: "smartCapture"});
      
      if (smartCaptureResponse.success) {
        console.log("✅ 定时捕获成功：直接捕获视频元素");
        console.log(`📊 捕获信息 - 方法: direct, 尺寸: ${smartCaptureResponse.width}x${smartCaptureResponse.height}`);
        
        // 显示捕获的画面
        displayCapture({
          method: "direct",
          imageDataUrl: smartCaptureResponse.imageDataUrl,
          width: smartCaptureResponse.width,
          height: smartCaptureResponse.height
        });
        
        // 计算帧变化幅度
        const changeAmount = calculateFrameChange(window.lastFrame, smartCaptureResponse.imageDataUrl);
        window.lastFrame = smartCaptureResponse.imageDataUrl;
        console.log(`📊 画面变化幅度: ${changeAmount.toFixed(2)}`);
        
        return true;
      } else {
        console.log("⚠️ 定时捕获失败:", smartCaptureResponse.reason);
        return false;
      }
    } catch (error) {
      console.log("⚠️ 定时捕获异常:", error.message);
      return false;
    }
  }

  // 计算帧变化幅度的函数
  function calculateFrameChange(lastFrame, currentFrame) {
    if (!lastFrame) return 0;

    // 简单的base64字符串差异计算
    const minLength = Math.min(lastFrame.length, currentFrame.length);
    let diffCount = 0;

    for (let i = 0; i < minLength; i++) {
      if (lastFrame[i] !== currentFrame[i]) {
        diffCount++;
      }
    }

    return (diffCount / minLength) * 100;
  }

  // 启动方案一：直接捕获视频元素
  async function startFirstMethod(tab, interval) {
    try {
      // 先获取页面中的视频信息
      console.log("🔍 查找页面中的视频元素...");
      const videoInfoResponse = await chrome.tabs.sendMessage(tab.id, {action: "getVideoInfo"});

      if (videoInfoResponse.videos && videoInfoResponse.videos.length > 0) {
        console.log(`✅ 找到 ${videoInfoResponse.videos.length} 个视频元素:`, videoInfoResponse.videos);
        updateStatus(`找到 ${videoInfoResponse.videos.length} 个视频元素\n开始定时捕获...`, 'info');
      } else {
        console.log("⚠️ 页面中没有找到视频元素");
        updateStatus("页面中没有找到视频元素\n尝试第二阶段...", 'info');
      }

      // 启动定时捕获
      if (captureInterval) {
        clearInterval(captureInterval);
      }

      // 设置定时器
      captureInterval = setInterval(async () => {
        const success = await captureAndDisplayFrame(tab);
        // 如果方案一失败，切换到方案二
        if (!success) {
          console.log("🔄 方案一失败，切换到方案二");
          clearInterval(captureInterval);
          captureInterval = null;
          await startSecondMethod(tab, interval);
        }
      }, interval);

      updateStatus(`✅ 开始定时捕获，间隔: ${interval}ms\n监控中...`, 'success');
      console.log(`✅ 开始定时捕获，间隔: ${interval}ms`);
      return true;
    } catch (error) {
      console.log("⚠️ 方案一出现异常:", error.message);
      updateStatus(`方案一异常: ${error.message}\n尝试第二阶段...`, 'info');
      return false;
    }
  }

  // 启动方案二：使用 tabCapture
  async function startSecondMethod(tab, interval) {
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
    updateStatus(`成功获取视频流ID\nID: ${streamId.substring(0, 20)}...\n正在后台处理视频流...`, 'success');

    // 在后台offscreen页面处理视频流
    try {
      // 先尝试关闭可能存在的offscreen页面
      try {
        await chrome.offscreen.closeDocument();
      } catch (e) {
        // 忽略错误，如果offscreen页面不存在则正常
      }
      
      // 创建offscreen页面
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL('offscreen.html'),
        reasons: ['USER_MEDIA'],
        justification: '处理视频流'
      });

      // 通知offscreen页面处理视频流
      await chrome.runtime.sendMessage({
        target: 'offscreen',
        action: 'process-stream',
        streamId: streamId
      });

      console.log("✅ 第二阶段成功：offscreen页面已创建并开始处理视频流");
      
      // 启动定时捕获（使用后台offscreen页面）
      if (captureInterval) {
        clearInterval(captureInterval);
      }

      captureInterval = setInterval(async () => {
        try {
          // 在offscreen页面中捕获帧并返回给popup
          const response = await chrome.runtime.sendMessage({
            action: "captureFrameFromStream",
            streamId: streamId
          });
          
          if (response.success) {
            // 显示捕获的画面
            videoElement.srcObject = null;
            videoElement.poster = response.imageDataUrl;
            
            // 计算帧变化幅度
            const changeAmount = calculateFrameChange(window.lastFrame, response.imageDataUrl);
            window.lastFrame = response.imageDataUrl;
            console.log(`📊 画面变化幅度: ${changeAmount.toFixed(2)}`);
            
            // 更新状态显示
            updateStatus(`✅ Tab捕获成功\n尺寸: ${response.width}x${response.height}\n方法: 捕获整个标签页`, 'success');
          } else {
            console.error("捕获失败:", response.error);
            updateStatus(`❌ 捕获失败: ${response.error}`, 'error');
          }
        } catch (error) {
          console.error("定时捕获失败:", error);
          updateStatus(`❌ 定时捕获失败: ${error.message}`, 'error');
        }
      }, interval);
    } catch (error) {
      console.error("第二阶段初始化失败:", error);
      updateStatus(`❌ 第二阶段初始化失败: ${error.message}`, 'error');
    }
  }

  // 开始定时捕获
  startBtn.addEventListener('click', async () => {
    const interval = parseInt(intervalInput.value) || 200;

    try {
      updateStatus('正在获取当前标签页...', 'info');

      // 获取当前活动标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // 首先尝试方案一：直接捕获视频元素
      updateStatus('第一阶段：尝试直接捕获视频元素...', 'info');
      console.log("🔍 第一阶段：尝试直接捕获视频元素...");

      const firstMethodSuccess = await startFirstMethod(tab, interval);
      
      // 如果方案一立即失败（比如没有视频元素），则启动方案二
      if (!firstMethodSuccess && !captureInterval) {
        await startSecondMethod(tab, interval);
      }

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
    if (captureInterval) {
      clearInterval(captureInterval);
      captureInterval = null;
    }

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