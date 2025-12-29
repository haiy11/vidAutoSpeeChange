// popup.js
let currentStream = null;
let captureInterval = null;

// 添加图表相关变量
let changeHistory = [];
const MAX_HISTORY_POINTS = 50; // 最多保存50个历史点

document.addEventListener('DOMContentLoaded', () => {
  // 获取DOM元素
  const statusDiv = document.getElementById('status');
  const videoElement = document.getElementById('capturedVideo');
  const startBtn = document.getElementById('startCapture');
  const stopBtn = document.getElementById('stopCapture');
  const intervalInput = document.getElementById('intervalInput');
  const currentChangeDiv = document.getElementById('currentChange');
  const chartCanvas = document.getElementById('chartCanvas');
  const chartGrid = document.getElementById('chartGrid');

  // 检查必需的DOM元素是否存在
  if (!startBtn || !stopBtn) {
    console.error('必需的DOM元素未找到，请确保popup.html包含所有必需的元素');
    return;
  }

  // 设置canvas尺寸（如果canvas存在）
  function setupChart() {
    if (!chartCanvas) return;
    const container = chartCanvas.parentElement;
    if (!container) return;
    chartCanvas.width = container.clientWidth;
    chartCanvas.height = container.clientHeight;
    drawChart();
  }

  // 绘制图表（如果canvas存在）
  function drawChart() {
    if (!chartCanvas) return;
    const ctx = chartCanvas.getContext('2d');
    if (!ctx) return;
    const width = chartCanvas.width;
    const height = chartCanvas.height;
    
    // 清空canvas
    ctx.clearRect(0, 0, width, height);
    
    if (changeHistory.length < 2) return;
    
    // 找到最大值用于缩放
    let maxValue = 0;
    for (const point of changeHistory) {
      if (point.value > maxValue) maxValue = point.value;
    }
    maxValue = Math.max(maxValue, 1); // 防止最大值为0
    
    // 绘制网格线
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1;
    
    // 水平网格线 (4条)
    for (let i = 0; i <= 4; i++) {
      const y = height * (i / 4);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // 垂直网格线 (5条)
    for (let i = 0; i <= 5; i++) {
      const x = width * (i / 5);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    // 绘制折线图
    ctx.beginPath();
    ctx.strokeStyle = '#007bff';
    ctx.lineWidth = 2;
    
    const pointSpacing = width / (changeHistory.length - 1);
    
    for (let i = 0; i < changeHistory.length; i++) {
      const x = i * pointSpacing;
      // 将值映射到canvas高度 (从上到下)
      const y = height - (changeHistory[i].value / maxValue) * height;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    ctx.stroke();
    
    // 绘制数据点
    ctx.fillStyle = '#ff0000';
    for (let i = 0; i < changeHistory.length; i++) {
      const x = i * pointSpacing;
      const y = height - (changeHistory[i].value / maxValue) * height;
      
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 添加新的变化值到历史记录
  function addChangeValue(value) {
    const timestamp = Date.now();
    changeHistory.push({ value: value, timestamp: timestamp });
    
    // 保持历史记录在最大限制内
    if (changeHistory.length > MAX_HISTORY_POINTS) {
      changeHistory.shift();
    }
    
    // 更新当前变化显示（如果元素存在）
    if (currentChangeDiv) {
      currentChangeDiv.textContent = `当前变化: ${value.toFixed(2)}%`;
    }
    
    // 更新图表
    drawChart();
  }

  // 更新状态显示
  function updateStatus(message, type = 'info') {
    if (statusDiv) {
      statusDiv.textContent = message;
      statusDiv.className = type;
    }
  }

  // 显示捕获的画面
  function displayCapture(data) {
    if (!videoElement) return;
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
        
        // 计算帧变化幅度 - 现在是异步的
        const changeAmount = await calculateFrameChange(window.lastFrame, smartCaptureResponse.imageDataUrl);
        window.lastFrame = smartCaptureResponse.imageDataUrl;
        console.log(`📊 画面变化幅度: ${changeAmount.toFixed(2)}`);
        
        // 添加到图表
        addChangeValue(changeAmount);
        
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

  // 计算帧变化幅度的函数 - 高级版，使用边缘检测和结构变化检测
  async function calculateFrameChange(lastFrame, currentFrame) {
    if (!lastFrame || !currentFrame) return 0;

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
  }

  // 边缘检测函数（使用Sobel算子）
  function detectEdges(imageData) {
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
  }
  
  // 计算边缘变化
  function calculateEdgeChange(edgeMap1, edgeMap2, width, height) {
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
  }
  
  // 计算亮度变化
  function calculateBrightnessChange(imageData1, imageData2) {
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

    // 先尝试停止任何可能存在的捕获
    try {
      await chrome.runtime.sendMessage({action: "stop-capture"});
      // 等待一点时间让资源释放
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (e) {
      console.log("停止现有捕获时出错:", e);
    }

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
            if (videoElement) {
              videoElement.srcObject = null;
              videoElement.poster = response.imageDataUrl;
            }
            
            // 计算帧变化幅度 - 现在是异步的
            const changeAmount = await calculateFrameChange(window.lastFrame, response.imageDataUrl);
            window.lastFrame = response.imageDataUrl;
            console.log(`📊 画面变化幅度: ${changeAmount.toFixed(2)}`);
            
            // 添加到图表
            addChangeValue(changeAmount);
            
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
    // 重置历史记录
    changeHistory = [];
    drawChart();
    
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
      if (videoElement) {
        videoElement.srcObject = null;
      }
    }
  });

  // 停止捕获
  stopBtn.addEventListener('click', async () => {
    if (captureInterval) {
      clearInterval(captureInterval);
      captureInterval = null;
    }

    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
      currentStream = null;
    }
    
    // 通知background停止捕获，释放资源
    try {
      await chrome.runtime.sendMessage({action: "stop-capture"});
    } catch (error) {
      console.log("通知background停止捕获时出错:", error);
    }
    
    if (videoElement) {
      videoElement.srcObject = null;
      videoElement.poster = '';
    }
    updateStatus('已停止捕获', 'info');
    console.log("⏹️ 已停止捕获");
  });

  // 初始化状态
  updateStatus('准备就绪\n点击"开始捕获"按钮\n将先尝试直接捕获视频元素，失败后使用 tabCapture 兜底', 'info');
  
  // 初始化图表
  setupChart();
  
  // 监听窗口大小变化以重新调整图表
  window.addEventListener('resize', setupChart);
});