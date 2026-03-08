// c
// 存储视频检测状态
let hasVideo = false;
let captureStatus = false; // 捕获状态，需要持久化
let captureInterval = null;
let lastFrame = null;
let changeHistory = [];
const MAX_HISTORY_POINTS = 40; // 最多保存40个历史点
const CHART_MAX_VALUE = 50; // 图表最大值

// 存储当前活动的流ID，以便正确管理
let activeStreamId = null;

// 初始化捕获状态
async function initializeCaptureStatus() {
  try {
    const result = await chrome.storage.local.get(['captureStatus']);
    captureStatus = result.captureStatus || false;
    // console.log('初始化捕获状态:', captureStatus);
  } catch (error) {
    console.error('初始化捕获状态失败:', error);
    captureStatus = false; // 默认为关闭状态
  }
}

// 检测页面是否有视频元素
async function checkForVideos(tabId) {
  try {
    // 在目标标签页执行内容脚本
    const [result] = await chrome.scripting.executeScript({
      target: {tabId},
      func: () => {
        // 查找所有视频元素
        const videos = document.querySelectorAll('video');
        
        // 检查是否有正在播放的视频
        const playingVideos = Array.from(videos).filter(video => 
          !video.paused && !video.ended && video.readyState > 2
        );
        
        return {
          totalVideos: videos.length,
          playingVideos: playingVideos.length,
          hasVideo: videos.length > 0
        };
      }
    });
    
    return result.result;
  } catch (error) {
    console.error('视频检测失败:', error);
    return {hasVideo: false};
  }
}

// 计算帧变化幅度的函数 - 高级版，使用边缘检测和结构变化检测
async function calculateFrameChange(lastFrame, currentFrame) {
  if (!lastFrame || !currentFrame) return 0;

  return new Promise((resolve) => {
    // 创建临时canvas用于图像处理 - 在content.js中处理
    chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
      if (tabs.length > 0) {
        try {
          const response = await chrome.tabs.sendMessage(tabs[0].id, {
            action: "calculateFrameChange",
            currentFrame: currentFrame,
            lastFrame: lastFrame
          });
          resolve(response.changeAmount);
        } catch (error) {
          console.error('计算帧变化时出错:', error);
          resolve(0);
        }
      } else {
        resolve(0);
      }
    });
  });
}

// 添加新的变化值到历史记录
function addChangeValue(value) {
  const timestamp = Date.now();
  changeHistory.push({ value: value, timestamp: timestamp });
  
  // 保持历史记录在最大限制内
  if (changeHistory.length > MAX_HISTORY_POINTS) {
    changeHistory.shift();
  }
  
  // 广播变化数据给popup
  chrome.runtime.sendMessage({
    action: 'updateChangeData',
    currentChange: value,
    changeHistory: changeHistory
  }).catch(() => {
    // 忽略错误，因为popup可能未打开
  });
}

// 捕获当前页面视频帧
async function captureCurrentPageFrame() {
  try {
    // 获取当前活动标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      // console.log("未找到活动标签页");
      return;
    }
    
    // 检查是否有视频元素
    const videoInfo = await checkForVideos(tab.id);
    if (!videoInfo.hasVideo) {
      // console.log("当前页面没有视频元素");
      return;
    }
    
    // 尝试智能捕获
    const smartCaptureResponse = await chrome.tabs.sendMessage(tab.id, {action: "smartCapture"});
    
    if (smartCaptureResponse.success) {
      // console.log("✅ 定时捕获成功：直接捕获视频元素");
      // console.log(`📊 捕获信息 - 方法: direct, 尺寸: ${smartCaptureResponse.width}x${smartCaptureResponse.height}`);
      
      // 计算帧变化幅度
      const changeAmount = await calculateFrameChange(lastFrame, smartCaptureResponse.imageDataUrl);
      lastFrame = smartCaptureResponse.imageDataUrl;
      // console.log(`📊 画面变化幅度: ${changeAmount.toFixed(2)}`);
      
      // 添加到图表
      addChangeValue(changeAmount);
      
      // 广播捕获画面给popup
      chrome.runtime.sendMessage({
        action: 'updateCaptureImage',
        imageDataUrl: smartCaptureResponse.imageDataUrl,
        width: smartCaptureResponse.width,
        height: smartCaptureResponse.height
      }).catch(() => {
        // 忽略错误，因为popup可能未打开
      });
    } else {
      // console.log("⚠️ 定时捕获失败:", smartCaptureResponse.reason);
      
      // 如果直接捕获失败，尝试tabCapture方法
      await captureTabFrame(tab);
    }
  } catch (error) {
    // console.log("⚠️ 定时捕获异常:", error.message);
  }
}

// 使用tabCapture捕获标签页
async function captureTabFrame(tab) {
  try {
    // 获取视频流ID
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tab.id
    });
    
    // console.log("✅ 成功获取视频流ID:", streamId);
    
    // 创建offscreen页面处理视频流
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

      // 捕获帧
      const response = await chrome.runtime.sendMessage({
        action: "captureFrameFromStream",
        streamId: streamId
      });
      
      if (response.success) {
        // 计算帧变化幅度
        const changeAmount = await calculateFrameChange(lastFrame, response.imageDataUrl);
        lastFrame = response.imageDataUrl;
        // console.log(`📊 画面变化幅度: ${changeAmount.toFixed(2)}`);
        
        // 添加到图表
        addChangeValue(changeAmount);
        
        // 广播捕获画面给popup
        chrome.runtime.sendMessage({
          action: 'updateCaptureImage',
          imageDataUrl: response.imageDataUrl,
          width: response.width,
          height: response.height
        }).catch(() => {
          // 忽略错误，因为popup可能未打开
        });
      } else {
        console.error("捕获失败:", response.error);
      }
    } catch (error) {
      console.error("第二阶段初始化失败:", error);
    }
  } catch (error) {
    console.error("tabCapture捕获失败:", error);
  }
}

// 开始定时捕获
function startCapture() {
  if (captureInterval) {
    clearInterval(captureInterval);
  }
  
  // 每0.2秒捕获一次
  captureInterval = setInterval(captureCurrentPageFrame, 200);
  // console.log("✅ 开始定时捕获，间隔: 200ms");
}

// 停止定时捕获
function stopCapture() {
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
  }
  // console.log("⏹️ 停止定时捕获");
}

// 主功能：获取视频流ID
async function getVideoStreamId(tab) {
  try {
    // 1. 检测视频状态
    const videoInfo = await checkForVideos(tab.id);
    hasVideo = videoInfo.hasVideo;
    
    if (!hasVideo) {
      // console.log('当前页面没有检测到视频元素');
      // 更新扩展图标状态
      chrome.action.setIcon({
        path: {
          16: "icons/16-gray.png",
          32: "icons/32-gray.png",
          48: "icons/48-gray.png"
        },
        tabId: tab.id
      });
      return;
    }
    
    // console.log(`检测到视频: ${videoInfo.totalVideos}个，正在播放: ${videoInfo.playingVideos}个`);
    
    // 2. 如果已有活动流，先尝试关闭
    if (activeStreamId) {
      try {
        // 尝试关闭offscreen document
        await chrome.offscreen.closeDocument();
      } catch (e) {
        // console.log("关闭offscreen document时出错:", e);
      }
    }
    
    // 3. 获取视频流ID
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tab.id
    });
    
    // 更新活动流ID
    activeStreamId = streamId;
    
    // console.log("✅ 成功获取视频流ID:", streamId);
    
    // 4. 验证视频流 - 创建一个offscreen document来处理媒体流
    try {
      // 先关闭可能存在的offscreen document
      try {
        await chrome.offscreen.closeDocument();
      } catch (e) {
        // 如果没有offscreen document，则忽略错误
      }
      
      // 创建offscreen document来处理视频流
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL('offscreen.html'),
        reasons: ['USER_MEDIA'],
        justification: '验证视频流'
      });
      
      // 发送消息到offscreen document以处理视频流
      setTimeout(() => {
        chrome.runtime.sendMessage({
          target: 'offscreen',
          action: 'process-stream',
          streamId: streamId
        });
      }, 100);
    } catch (offscreenError) {
      console.warn("无法创建offscreen document进行验证:", offscreenError);
    }
    
    // 5. 更新扩展图标状态
    chrome.action.setIcon({
      path: {
        16: "icons/16.png",
        32: "icons/32.png",
        48: "icons/48.png"
      },
      tabId: tab.id
    });
    
  } catch (error) {
    console.error("❌ 获取视频流ID失败:", error);
    
    // 恢复默认图标
    chrome.action.setIcon({
      path: {
        16: "icons/16.png",
        32: "icons/32.png",
        48: "icons/48.png"
      },
      tabId: tab.id
    });
  }
}

// 监听扩展图标点击
chrome.action.onClicked.addListener(getVideoStreamId);

// 监听标签页更新（检测视频状态变化）
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    const videoInfo = await checkForVideos(tabId);
    hasVideo = videoInfo.hasVideo;
    
    // 根据视频状态更新图标
    chrome.action.setIcon({
      path: {
        16: hasVideo ? "icons/16.png" : "icons/16-gray.png",
        32: hasVideo ? "icons/32.png" : "icons/32-gray.png",
        48: hasVideo ? "icons/48.png" : "icons/48-gray.png"
      },
      tabId
    });
  }
});

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "get-video-stream-id") {
    // 获取当前活动标签页
    chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
      if (tabs.length > 0) {
        try {
          // console.log("📥 收到获取视频流ID的请求");
          
          // 如果已有活动流，先尝试清理
          if (activeStreamId) {
            // console.log("⚠️ 已存在活动流，尝试清理...");
            try {
              await chrome.offscreen.closeDocument();
            } catch (e) {
              // console.log("关闭offscreen document时出错:", e);
            }
          }
          
          const streamId = await chrome.tabCapture.getMediaStreamId({
            targetTabId: tabs[0].id
          });
          
          // 更新活动流ID
          activeStreamId = streamId;
          
          // console.log("📤 返回视频流ID:", streamId);
          sendResponse({success: true, streamId: streamId});
        } catch (error) {
          console.error("❌ 获取视频流ID失败:", error);
          sendResponse({success: false, error: error.message});
        }
      } else {
        // console.log("❌ 未找到活动标签页");
        sendResponse({success: false, error: "No active tab found"});
      }
    });
    return true; // 保持消息通道开放以进行异步响应
  }
  
  // 停止捕获
  if (message.action === "stop-capture") {
    // 清理活动流ID
    activeStreamId = null;
    
    // 关闭offscreen页面
    chrome.offscreen.closeDocument()
      .then(() => {
        // console.log("✅ 已关闭offscreen页面");
      })
      .catch((e) => {
        // console.log("⚠️ 关闭offscreen页面时出错:", e);
      });
    
    sendResponse({ success: true });
    return true;
  }
  
  // 处理从popup发来的捕获帧消息
  if (message.action === "captureFrameFromStream") {
    // 发送消息到offscreen页面处理视频流
    chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'capture-frame',
      streamId: message.streamId
    }).then(response => {
      sendResponse(response);
    }).catch(error => {
      console.error("捕获帧失败:", error);
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // 保持消息通道开放
  }
  
  // 处理offscreen页面的响应（如果需要）
  if (message.target === 'background' && message.source === 'offscreen') {
    // console.log('收到offscreen页面的消息:', message);
  }
  
  // 处理开始/停止捕获的请求
  if (message.action === 'startCapture') {
    captureStatus = true;
    startCapture();
    chrome.storage.local.set({ captureStatus: true });
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'stopCapture') {
    captureStatus = false;
    stopCapture();
    chrome.storage.local.set({ captureStatus: false });
    sendResponse({ success: true });
    return true;
  }
  
  // 获取当前状态
  if (message.action === 'getStatus') {
    sendResponse({ 
      captureStatus: captureStatus,
      changeHistory: changeHistory,
      currentChange: changeHistory.length > 0 ? changeHistory[changeHistory.length - 1].value : 0
    });
    return true;
  }
  
  // 获取当前捕获的画面
  if (message.action === 'getCurrentCapture') {
    sendResponse({ 
      imageDataUrl: lastFrame,
      changeHistory: changeHistory,
      currentChange: changeHistory.length > 0 ? changeHistory[changeHistory.length - 1].value : 0
    });
    return true;
  }
  
  return true; // 保持消息通道开放
});

// 当扩展卸载或关闭时清理资源
chrome.runtime.onSuspend.addListener(() => {
  if (activeStreamId) {
    chrome.offscreen.closeDocument().catch(e => {
      // console.log("关闭offscreen document时出错:", e);
    });
    activeStreamId = null;
  }
  
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
  }
});

// 初始化捕获状态
initializeCaptureStatus().then(() => {
  // 根据持久化状态设置定时捕获
  if (captureStatus) {
    startCapture();
  }
});